// ══════════════════════════════════════════════════════════════════
// api/analyze.js — Main Handler (CommonJS)
// ══════════════════════════════════════════════════════════════════

const { validateTicker, validateAIOutput } = require('../lib/validation');
const { computeAll }                        = require('../lib/indicators');
const { analyzeVolume }                     = require('../lib/volume');
const { analyzeStructure }                  = require('../lib/structure');
const { computeScore }                      = require('../lib/scoring');
const { callAI, sanitizeAIOutput }          = require('../lib/ai');
const { cacheGet, cacheSet, TTL }           = require('../lib/cache');
const { analyzeMarketContext }              = require('../lib/context');
const { quickScan }                         = require('../lib/scanner');
const { analyzeBandar }                     = require('../lib/bandar');
const { fetchAllNews }                      = require('../lib/news');
const log                                   = require('../lib/logger');

// ── Rate Limiting ──────────────────────────────────────────────────
// CATATAN: rateLimitMap in-memory — tidak persist antar Vercel cold start
// Untuk rate limit yang persist, gunakan Redis atau Vercel KV
const rateLimitMap = new Map();

// Bersihkan IP lama setiap 5 menit — cegah memory leak
setInterval(function() {
  const now = Date.now();
  const window = 60 * 1000;
  rateLimitMap.forEach(function(hits, ip) {
    const fresh = hits.filter(function(t) { return now - t < window; });
    if (fresh.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, fresh);
  });
}, 5 * 60 * 1000);

function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000;
  const max    = 10;
  const hits   = (rateLimitMap.get(ip) || []).filter(function(t) { return now - t < window; });
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > max;
}

// ── Fetch dengan retry (handle Yahoo 429) ─────────────────────────
const YAHOO_TIMEOUT = 8000; // 8 detik — cegah hang saat Yahoo lambat

async function fetchWithRetry(url, options, maxRetries) {
  maxRetries = maxRetries || 2;
  let delay  = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      const controller = new AbortController();
      const timer = setTimeout(function() { controller.abort(); }, YAHOO_TIMEOUT);
      res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      clearTimeout(timer);
    } catch (e) {
      if (e.name === 'AbortError') {
        log.warn('analyze', '[YAHOO TIMEOUT]', url);
        if (attempt === maxRetries) throw new Error('Yahoo Finance timeout setelah ' + YAHOO_TIMEOUT + 'ms');
      } else {
        if (attempt === maxRetries) throw e;
      }
      if (attempt < maxRetries) await sleep(delay);
      delay *= 2;
      continue;
    }
    if (res.status === 429) {
      if (attempt === maxRetries) return res;
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10) || delay / 1000;
      console.warn('[YAHOO 429] retry ke-' + (attempt + 1) + ' tunggu ' + retryAfter + 's');
      await sleep(retryAfter * 1000);
      delay *= 2;
      continue;
    }
    return res;
  }
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// ── Fetch harga dari Yahoo Finance ─────────────────────────────────
async function fetchPriceData(ticker, isIndex) {
  const cacheKey = 'price:' + ticker;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  const symbol = isIndex
    ? (ticker === 'IHSG' ? '%5EJKSE' : '%5EJKLQ45')
    : ticker + '.JK';

  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=6mo';

  let res;
  try {
    res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
  } catch (e) {
    log.error('analyze', '[YAHOO FETCH ERROR]', e.message);
    return null;
  }

  if (!res.ok) {
    log.error('analyze', '[YAHOO ERROR]', res.status, ticker);
    return null;
  }

  let json;
  try { json = await res.json(); }
  catch (e) { log.error('analyze', '[YAHOO JSON PARSE]', e.message); return null; }

  const result     = json && json.chart && json.chart.result && json.chart.result[0];
  const meta       = result && result.meta;
  const quotes     = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
  const timestamps = result && result.timestamp;

  if (!meta || !quotes || !timestamps) {
    log.error('analyze', '[YAHOO NO DATA]', ticker);
    return null;
  }

  const closes  = quotes.close;
  const highs   = quotes.high;
  const lows    = quotes.low;
  const opens   = quotes.open;
  const volumes = quotes.volume;

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    candles.push({
      date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
      open:   Math.round(opens && opens[i] ? opens[i] : closes[i]),
      high:   Math.round(highs[i] || closes[i]),
      low:    Math.round(lows[i]  || closes[i]),
      close:  Math.round(closes[i]),
      volume: volumes[i] || 0
    });
  }

  if (!candles.length) return null;

  const lastClose = meta.regularMarketPrice || candles[candles.length - 1].close;
  let prevClose = meta.chartPreviousClose  || (candles[candles.length - 2] && candles[candles.length - 2].close) || lastClose;
  let change    = lastClose - prevClose;
  let changePct = prevClose ? parseFloat((change / prevClose * 100).toFixed(2)) : 0;

  // Filter data Yahoo yang tidak wajar (corporate action, stock split, dll)
  // Kalau change > 25% dalam sehari, kemungkinan data salah — reset ke 0
  if (Math.abs(changePct) > 25) {
    const prevFromCandles = candles.length >= 2 ? candles[candles.length - 2].close : lastClose;
    const changePctFromCandles = prevFromCandles ? parseFloat(((lastClose - prevFromCandles) / prevFromCandles * 100).toFixed(2)) : 0;
    // Pakai data candle kalau lebih masuk akal
    if (Math.abs(changePctFromCandles) <= 25) {
      prevClose = prevFromCandles;
      change    = lastClose - prevClose;
      changePct = changePctFromCandles;
    } else {
      // Keduanya tidak wajar — kemungkinan corporate action, tampilkan 0
      change    = 0;
      changePct = 0;
    }
  }

  const priceData = {
    current:   Math.round(lastClose),
    prevClose: Math.round(prevClose),
    change:    Math.round(change),
    changePct: changePct,
    isUp:      change >= 0,
    high52w:   meta.fiftyTwoWeekHigh ? Math.round(meta.fiftyTwoWeekHigh) : null,
    low52w:    meta.fiftyTwoWeekLow  ? Math.round(meta.fiftyTwoWeekLow)  : null,
    volume:    meta.regularMarketVolume || candles[candles.length - 1].volume || null,
    marketCap: meta.marketCap || null,
    currency:  meta.currency  || 'IDR',
    candles:   candles,
    history:   candles.slice(-60)
  };

  cacheSet(cacheKey, priceData, TTL.price);
  return priceData;
}

// ── Build price context ─────────────────────────────────────────────
function buildPriceContext(priceData) {
  if (!priceData) return 'Data harga real-time tidak tersedia.';
  const current   = priceData.current;
  const changePct = priceData.changePct;
  const isUp      = priceData.isUp;
  const high52w   = priceData.high52w;
  const low52w    = priceData.low52w;
  const volume    = priceData.volume;
  const marketCap = priceData.marketCap;
  const currency  = priceData.currency;

  const pct52wHigh = high52w ? ((high52w - current) / high52w * 100).toFixed(1) : null;
  const pct52wLow  = low52w  ? ((current - low52w)  / low52w  * 100).toFixed(1) : null;

  return 'DATA PASAR REAL-TIME (FAKTUAL):\n' +
    '- Harga saat ini : ' + currency + ' ' + current.toLocaleString('id-ID') + '\n' +
    '- Perubahan hari : ' + (isUp ? '+' : '') + priceData.change.toLocaleString('id-ID') + ' (' + (isUp ? '+' : '') + changePct + '%)\n' +
    '- 52W High       : ' + (high52w ? high52w.toLocaleString('id-ID') : 'N/A') + (pct52wHigh ? ' (' + pct52wHigh + '% di atas harga sekarang)' : '') + '\n' +
    '- 52W Low        : ' + (low52w  ? low52w.toLocaleString('id-ID')  : 'N/A') + (pct52wLow  ? ' (' + pct52wLow  + '% di atas 52W Low)' : '') + '\n' +
    '- Volume         : ' + (volume  ? volume.toLocaleString('id-ID')  : 'N/A') + '\n' +
    '- Market Cap     : ' + (marketCap ? (marketCap / 1e12).toFixed(2) + ' T IDR' : 'N/A');
}

// ── Main Handler ────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const startTime = Date.now();

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown');
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Terlalu banyak request. Tunggu sebentar.' });

  // ── Validasi input ─────────────────────────────────────────────
  const tickerRaw  = req.body && req.body.ticker;
  const validation = validateTicker(tickerRaw);
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  const ticker   = validation.ticker;
  const isIndex  = validation.isIndex;
  const metadata = validation.metadata;

  // ── Cek cache analisis ─────────────────────────────────────────
  const cacheKey       = 'analysis:' + ticker;
  const cachedAnalysis = cacheGet(cacheKey);
  if (cachedAnalysis) {
    log.info('analyze', '[CACHE HIT]', ticker);
    return res.status(200).json(Object.assign({}, cachedAnalysis, { fromCache: true }));
  }

  // ── 1. Fetch harga ─────────────────────────────────────────────
  const priceData = await fetchPriceData(ticker, isIndex);
  const candles   = (priceData && priceData.candles) || [];

  // ── 2. Indikator matematis ─────────────────────────────────────
  const indicators = candles.length >= 5 ? computeAll(candles) : {};
  log.info('analyze', '[IND]', ticker, 'RSI=' + (indicators && indicators.rsi), 'MA20=' + (indicators && indicators.ma && indicators.ma.ma20));

  // ── 3. Volume intelligence ─────────────────────────────────────
  const volumeData = candles.length >= 5 ? analyzeVolume(candles) : null;

  // ── 4. Market structure ────────────────────────────────────────
  const structure = candles.length >= 10 ? analyzeStructure(candles, indicators, volumeData) : null;

  // ── 5. Scoring ─────────────────────────────────────────────────
  const scoring = computeScore(indicators, volumeData, structure, priceData);
  log.info('analyze', '[SCORE]', ticker + ': ' + scoring.final + '/10 ->', scoring.recommendation);

  // ── 6. Market context ──────────────────────────────────────────
  const marketContext = !isIndex && candles.length >= 5
    ? analyzeMarketContext(ticker, candles, indicators, volumeData, structure)
    : null;

  // ── 7. Quick scan signals ──────────────────────────────────────
  const scanSignals = !isIndex && candles.length >= 20
    ? quickScan(ticker, candles, indicators, volumeData, structure, scoring)
    : null;

  // ── 8. Bandar analysis ─────────────────────────────────────────
  const bandarData = !isIndex && candles.length >= 20
    ? analyzeBandar(candles, indicators, volumeData, priceData, metadata)
    : null;
  if (bandarData) log.info('analyze', '[BANDAR]', ticker, 'score=' + bandarData.bandarScore, bandarData.smartMoney && bandarData.smartMoney.label);

  // ── 9. Fetch berita terkini ────────────────────────────────────
  let newsData = null;
  try {
    newsData = await fetchAllNews(ticker, metadata, isIndex);
    log.info('analyze', '[NEWS]', ticker, 'emiten=' + (newsData.emiten && newsData.emiten.length) + ' komods=' + (newsData.komoditas && newsData.komoditas.length));
  } catch (e) {
    log.warn('analyze', '[NEWS ERROR]', e.message);
    // Tidak fatal — lanjut tanpa berita
  }

  // ── 10. AI ────────────────────────────────────────────────────
  const priceContext = buildPriceContext(priceData);
  let parsed;
  try {
    const rawAI = await callAI({
      ticker, metadata, isIndex, priceData, priceContext,
      indicators, volumeData, structure, scoring, bandarData,
      newsData
    });
    const aiValidation = validateAIOutput(rawAI);
    if (!aiValidation.valid) {
      log.error('analyze', '[AI PARSE]', ticker + ':', aiValidation.error);
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }
    parsed = aiValidation.parsed;

    // FIX: Sanitize angka target/SL/levelBeli dari AI
    parsed = sanitizeAIOutput(parsed, priceData);

  } catch (err) {
    log.error('analyze', '[AI ERROR]', ticker + ':', err.message);
    return res.status(502).json({ error: err.message || 'AI tidak merespons. Coba lagi.' });
  }

  // ── Override metadata IDX ──────────────────────────────────────
  if (metadata) {
    parsed.namaLengkap = 'PT ' + metadata.name;
    parsed.sektor      = metadata.sector + (metadata.subsector ? ' - ' + metadata.subsector : '');
  }

  // ── Build response — include indikator baru di cache ───────────
  const response = Object.assign({}, parsed, {
    priceData: priceData ? {
      current:   priceData.current,
      prevClose: priceData.prevClose,
      change:    priceData.change,
      changePct: priceData.changePct,
      isUp:      priceData.isUp,
      high52w:   priceData.high52w,
      low52w:    priceData.low52w,
      volume:    priceData.volume,
      marketCap: priceData.marketCap,
      currency:  priceData.currency,
      history:   priceData.history,
      candles:   priceData.candles
    } : null,
    indicators: {
      rsi:    indicators.rsi,
      ma:     indicators.ma,
      ma20:   indicators.ma && indicators.ma.ma20,
      ma50:   indicators.ma && indicators.ma.ma50,
      macd:   indicators.macd,
      bb:     indicators.bb,
      atr:    indicators.atr,
      stoch:  indicators.stoch,
      trend:  indicators.trend,
      levels: indicators.levels,
      // NEW: indikator baru masuk cache
      mfi:         indicators.mfi        || null,
      divergence:  indicators.divergence || null,
      fibonacci:   indicators.fibonacci  || null,
      candlestick: indicators.candlestick || null,
      relStrength: indicators.relStrength || null,
      pivots:      indicators.pivots     || null
    },
    volumeData: volumeData ? {
      bias:         volumeData.accDist && volumeData.accDist.bias,
      isSpike:      volumeData.spike && volumeData.spike.isSpike,
      spikeRatio:   volumeData.spike && volumeData.spike.ratio,
      narrative:    volumeData.narrative,
      score:        volumeData.score,
      accDist:      volumeData.accDist,
      spike:        volumeData.spike,
      obv:          volumeData.obv,
      vwap:         volumeData.vwap,
      confirmation: volumeData.confirmation
    } : null,
    structureData: structure ? {
      phase:      structure.phase,
      phaseLabel: structure.phaseLabel,
      trend:      structure.trend,
      setups:     structure.setups,
      breakout:   structure.breakout,
      hhll:       structure.hhll
    } : null,
    scoringData:   scoring,
    bandarData:    bandarData ? {
      bandarScore: bandarData.bandarScore,
      narrative:   bandarData.narrative,
      smartMoney:  bandarData.smartMoney,
      stealth:     bandarData.stealth,
      distTrap:    bandarData.distTrap,
      panic:       bandarData.panic,
      stockType:   bandarData.stockType
    } : null,
    marketContext: marketContext,
    scanSignals:   scanSignals ? scanSignals.signals : [],
    newsData:      newsData ? {
      emiten:    newsData.emiten    || [],
      komoditas: newsData.komoditas || [],
      makro:     newsData.makro     || []
    } : null,
    ticker:        ticker,
    generatedAt:   new Date().toISOString(),
    latencyMs:     Date.now() - startTime,
    fromCache:     false
  });

  cacheSet(cacheKey, response, TTL.analysis);
  log.info('analyze', '[DONE]', ticker, (Date.now() - startTime) + 'ms');
  return res.status(200).json(response);
};
