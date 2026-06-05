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
const { fetchPriceDataWithFallback }        = require('../lib/datasource');
const { applyCompression }                  = require('../lib/compress');
const log                                   = require('../lib/logger');

// ── IHSG crash threshold ──────────────────────────────────────────
const CRASH_THRESHOLD = -8; // blokir sinyal bullish jika IHSG < -8%

// ── Rate Limiting ──────────────────────────────────────────────────
// Pakai lib/cache.js (TTL-based) agar tidak perlu setInterval
// Vercel serverless: setiap cold start bersih — rate limit per-instance
// Untuk rate limit persist gunakan Vercel KV / Redis
const { cacheGet: rlGet, cacheSet: rlSet } = require('../lib/cache');
const RL_WINDOW = 60 * 1000; // 1 menit
const RL_MAX    = 10;         // max 10 request/menit/IP

function isRateLimited(ip) {
  const key  = 'rl:' + (ip || 'unknown');
  const now  = Date.now();
  // Ambil hits dari cache — sudah TTL otomatis, tidak perlu cleanup manual
  const hits = (rlGet(key) || []).filter(function(t) { return now - t < RL_WINDOW; });
  hits.push(now);
  rlSet(key, hits, RL_WINDOW);
  return hits.length > RL_MAX;
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

  // fetchPriceDataWithFallback: Yahoo → Stooq (otomatis jika Yahoo gagal)
  const data = await fetchPriceDataWithFallback(ticker, isIndex);
  if (!data) return null;

  if (data.source && data.source !== 'yahoo') {
    log.warn('analyze', '[DATASOURCE FALLBACK]', ticker + ' menggunakan ' + data.source);
  }

  cacheSet(cacheKey, data, TTL.price);
  return data;
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

  applyCompression(req, res);
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

  // ── Simpan IHSG changePct ke cache untuk crash detection ──────
  if (isIndex && ticker === 'IHSG' && priceData && priceData.changePct != null) {
    cacheSet('ihsg:changePct', priceData.changePct, 10 * 60 * 1000); // 10 menit
    log.info('analyze', '[IHSG]', 'changePct=' + priceData.changePct + '% cached');
  }

  // ── Cek crash IHSG ─────────────────────────────────────────────
  const ihsgChangePct = cacheGet('ihsg:changePct');
  const isMarketCrash = typeof ihsgChangePct === 'number' && ihsgChangePct < CRASH_THRESHOLD;
  if (isMarketCrash) {
    log.warn('analyze', '[CRASH BLOCKER]', 'IHSG ' + ihsgChangePct + '% — sinyal bullish diblokir untuk ' + ticker);
  }

  // ── 5. Scoring ─────────────────────────────────────────────────
  const scoring = computeScore(indicators, volumeData, structure, priceData);
  log.info('analyze', '[SCORE]', ticker + ': ' + scoring.final + '/10 ->', scoring.recommendation);

  // ── 6. Market context ──────────────────────────────────────────
  // ── 7. Quick scan signals ──────────────────────────────────────
  // ── 8. Bandar analysis ─────────────────────────────────────────
  const marketContextPromise = (!isIndex && candles.length >= 5)
    ? analyzeMarketContext(ticker, candles, indicators, volumeData, structure)
    : Promise.resolve(null);

  const scanSignals = !isIndex && candles.length >= 20
    ? quickScan(ticker, candles, indicators, volumeData, structure, scoring, priceData && priceData.changePct, cacheGet)
    : null;

  const bandarData = !isIndex && candles.length >= 20
    ? analyzeBandar(candles, indicators, volumeData, priceData, metadata)
    : null;
  if (bandarData) log.info('analyze', '[BANDAR]', ticker, 'score=' + bandarData.bandarScore, bandarData.smartMoney && bandarData.smartMoney.label);

  // ── 9 & 10. News + AI + Market context — PARALEL ──────────────
  // Jalankan semua sekaligus untuk hemat 2-3 detik latency
  const priceContext = buildPriceContext(priceData);

  const newsPromise = fetchAllNews(ticker, metadata, isIndex).catch(e => {
    log.warn('analyze', '[NEWS ERROR]', e.message);
    return null;
  });

  const aiPromise = callAI({
    ticker, metadata, isIndex, priceData, priceContext,
    indicators, volumeData, structure, scoring, bandarData,
    newsData: null // news belum ada, AI pakai data teknikal
  }).catch(function(e) {
    log.warn('analyze', '[AI ERROR]', e.message);
    return null;
  });

  const [marketContext, newsData, rawAI] = await Promise.all([
    marketContextPromise,
    newsPromise,
    aiPromise
  ]);

  if (newsData) {
    log.info('analyze', '[NEWS]', ticker, 'emiten=' + (newsData.emiten && newsData.emiten.length) + ' komods=' + (newsData.komoditas && newsData.komoditas.length));
  }

  // ── Proses hasil AI ───────────────────────────────────────────
  let parsed;
  try {
    const aiValidation = validateAIOutput(rawAI);
    if (!aiValidation.valid) {
      log.error('analyze', '[AI PARSE]', ticker + ':', aiValidation.error);
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }
    parsed = aiValidation.parsed;

    // FIX: Sanitize angka target/SL/levelBeli dari AI — pakai ATR jika tersedia
    parsed = sanitizeAIOutput(parsed, priceData, indicators);

  } catch (err) {
    log.error('analyze', '[AI ERROR]', ticker + ':', err.message);
    return res.status(502).json({ error: err.message || 'AI tidak merespons. Coba lagi.' });
  }

  // ── Override metadata IDX ──────────────────────────────────────
  if (metadata) {
    const name = metadata.name || '';
    const hasPrefix = /^(PT|Bank|Indeks|Index|BRI|BNI|BCA|BTN)\s/i.test(name);
    parsed.namaLengkap = hasPrefix ? name : 'PT ' + name;
    parsed.sektor      = metadata.sector + (metadata.subsector ? ' - ' + metadata.subsector : '');
  }

  // ── CRASH BLOCKER — override rekomendasi saat IHSG crash >8% ──
  // Blokir sinyal bullish agar user tidak masuk posisi di kondisi panik
  if (isMarketCrash && !isIndex) {
    const bullishRek = ['BELI', 'AKUMULASI'];
    if (bullishRek.includes((parsed.rekomendasi || '').toUpperCase()) ||
        bullishRek.includes((parsed.sentiment   || '').toUpperCase())) {
      parsed.rekomendasi   = 'TAHAN';
      parsed.sentiment     = 'TAHAN';
      parsed.crashOverride = true;
      parsed.crashWarning  = 'IHSG turun ' + Math.abs(ihsgChangePct).toFixed(1) +
        '% hari ini (crash >8%). Rekomendasi beli diblokir — prioritas capital preservation. ' +
        'Tunggu IHSG stabil sebelum entry baru.';
      log.warn('analyze', '[CRASH BLOCKER]', ticker,
        'rekomendasi di-override ke TAHAN (IHSG ' + ihsgChangePct + '%)');
    }
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
      bias:           volumeData.accDist && volumeData.accDist.bias,
      isSpike:        volumeData.spike && volumeData.spike.isSpike,
      spikeRatio:     volumeData.spike && volumeData.spike.ratio,
      narrative:      volumeData.narrative,
      score:          volumeData.score,
      accDist:        volumeData.accDist,
      spike:          volumeData.spike,
      obv:            volumeData.obv,
      vwap:           volumeData.vwap,
      confirmation:   volumeData.confirmation,
      smartMoneyFlow: volumeData.smartMoneyFlow || null  // FIX: was missing
    } : null,
    structureData: structure ? {
      phase:      structure.phase,
      phaseLabel: structure.phaseLabel,
      trend:      structure.trend,
      setups:     structure.setups,
      breakout:   structure.breakout,
      hhll:       structure.hhll
    } : null,
    scoringData:   isMarketCrash && !isIndex && parsed.crashOverride
      ? Object.assign({}, scoring, { recommendation: 'TAHAN' })
      : scoring,
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
    fromCache:     false,
    marketCrash:   isMarketCrash ? { active: true, ihsgChangePct } : null
  });

  cacheSet(cacheKey, response, TTL.analysis);
  log.info('analyze', '[DONE]', ticker, (Date.now() - startTime) + 'ms');
  return res.status(200).json(response);
};
