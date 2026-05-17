// ══════════════════════════════════════════════════════════════════
// api/analyze.js — Main Handler (CommonJS)
// ══════════════════════════════════════════════════════════════════

const { validateTicker, validateAIOutput } = require('../lib/validation');
const { computeAll }                        = require('../lib/indicators');
const { analyzeVolume }                     = require('../lib/volume');
const { analyzeStructure }                  = require('../lib/structure');
const { computeScore }                      = require('../lib/scoring');
const { callAI }                            = require('../lib/ai');
const { cacheGet, cacheSet, TTL }           = require('../lib/cache');

// ── Rate Limiting ──────────────────────────────────────────────────
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000;
  const max    = 10;
  const hits   = (rateLimitMap.get(ip) || []).filter(t => now - t < window);
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > max;
}

// ── Fetch harga dari Yahoo Finance ─────────────────────────────────
async function fetchPriceData(ticker, isIndex) {
  const cacheKey = `price:${ticker}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  const symbol = isIndex
    ? (ticker === 'IHSG' ? '%5EJKSE' : '%5EJKLQ45')
    : `${ticker}.JK`;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
  } catch (e) {
    console.error('[YAHOO FETCH ERROR]', e.message);
    return null;
  }

  if (!res.ok) {
    console.error('[YAHOO ERROR]', res.status, ticker);
    return null;
  }

  let json;
  try { json = await res.json(); }
  catch (e) { console.error('[YAHOO JSON PARSE]', e.message); return null; }

  const result     = json?.chart?.result?.[0];
  const meta       = result?.meta;
  const quotes     = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;

  if (!meta || !quotes || !timestamps) {
    console.error('[YAHOO NO DATA]', ticker);
    return null;
  }

  const { close: closes, high: highs, low: lows, open: opens, volume: volumes } = quotes;

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    candles.push({
      date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
      open:   Math.round(opens?.[i]  || closes[i]),
      high:   Math.round(highs[i]    || closes[i]),
      low:    Math.round(lows[i]     || closes[i]),
      close:  Math.round(closes[i]),
      volume: volumes[i] || 0
    });
  }

  if (!candles.length) return null;

  const lastClose = meta.regularMarketPrice || candles[candles.length - 1].close;
  const prevClose = meta.chartPreviousClose  || candles[candles.length - 2]?.close || lastClose;
  const change    = lastClose - prevClose;
  const changePct = prevClose ? parseFloat((change / prevClose * 100).toFixed(2)) : 0;

  const priceData = {
    current:   Math.round(lastClose),
    prevClose: Math.round(prevClose),
    change:    Math.round(change),
    changePct,
    isUp:      change >= 0,
    high52w:   meta.fiftyTwoWeekHigh ? Math.round(meta.fiftyTwoWeekHigh) : null,
    low52w:    meta.fiftyTwoWeekLow  ? Math.round(meta.fiftyTwoWeekLow)  : null,
    volume:    meta.regularMarketVolume || candles[candles.length - 1].volume || null,
    marketCap: meta.marketCap || null,
    currency:  meta.currency  || 'IDR',
    candles,
    history:   candles.slice(-60)
  };

  cacheSet(cacheKey, priceData, TTL.price);
  return priceData;
}

// ── Build price context ─────────────────────────────────────────────
function buildPriceContext(priceData) {
  if (!priceData) return 'Data harga real-time tidak tersedia.';
  const { current, changePct, isUp, high52w, low52w, volume, marketCap, currency } = priceData;
  const pct52wHigh = high52w ? ((high52w - current) / high52w * 100).toFixed(1) : null;
  const pct52wLow  = low52w  ? ((current - low52w)  / low52w  * 100).toFixed(1) : null;
  return `DATA PASAR REAL-TIME (FAKTUAL):
- Harga saat ini : ${currency} ${current.toLocaleString('id-ID')}
- Perubahan hari : ${isUp ? '+' : ''}${priceData.change.toLocaleString('id-ID')} (${isUp ? '+' : ''}${changePct}%)
- 52W High       : ${high52w?.toLocaleString('id-ID') || 'N/A'}${pct52wHigh ? ` (${pct52wHigh}% di atas harga sekarang)` : ''}
- 52W Low        : ${low52w?.toLocaleString('id-ID')  || 'N/A'}${pct52wLow  ? ` (${pct52wLow}% di atas 52W Low)` : ''}
- Volume         : ${volume?.toLocaleString('id-ID')  || 'N/A'}
- Market Cap     : ${marketCap ? (marketCap / 1e12).toFixed(2) + ' T IDR' : 'N/A'}`;
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

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Terlalu banyak request. Tunggu sebentar.' });

  // ── Validasi input ─────────────────────────────────────────────
  const tickerRaw  = req.body?.ticker;
  const validation = validateTicker(tickerRaw);
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  const { ticker, isIndex, metadata } = validation;

  // ── Cek cache analisis ─────────────────────────────────────────
  const cacheKey      = `analysis:${ticker}`;
  const cachedAnalysis = cacheGet(cacheKey);
  if (cachedAnalysis) {
    console.log(`[CACHE HIT] ${ticker}`);
    return res.status(200).json({ ...cachedAnalysis, fromCache: true });
  }

  // ── 1. Fetch harga ─────────────────────────────────────────────
  const priceData = await fetchPriceData(ticker, isIndex);
  const candles   = priceData?.candles || [];

  // ── 2. Indikator matematis ─────────────────────────────────────
  const indicators = candles.length >= 5 ? computeAll(candles) : {};
  console.log(`[IND] ${ticker} RSI=${indicators?.rsi} MA20=${indicators?.ma?.ma20}`);

  // ── 3. Volume intelligence ─────────────────────────────────────
  const volumeData = candles.length >= 5 ? analyzeVolume(candles) : null;

  // ── 4. Market structure ────────────────────────────────────────
  const structure = candles.length >= 10 ? analyzeStructure(candles, indicators, volumeData) : null;

  // ── 5. Scoring ─────────────────────────────────────────────────
  const scoring = computeScore(indicators, volumeData, structure, priceData);
  console.log(`[SCORE] ${ticker}: ${scoring.final}/10 → ${scoring.recommendation}`);

  // ── 6. AI ──────────────────────────────────────────────────────
  const priceContext = buildPriceContext(priceData);
  let parsed;
  try {
    const rawAI = await callAI({ ticker, metadata, isIndex, priceData, priceContext, indicators, volumeData, structure, scoring });
    const aiValidation = validateAIOutput(rawAI);
    if (!aiValidation.valid) {
      console.error(`[AI PARSE] ${ticker}:`, aiValidation.error);
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }
    parsed = aiValidation.parsed;
  } catch (err) {
    console.error(`[AI ERROR] ${ticker}:`, err.message);
    return res.status(502).json({ error: err.message || 'AI tidak merespons. Coba lagi.' });
  }

  // ── 7. Override metadata IDX ───────────────────────────────────
  if (metadata) {
    parsed.namaLengkap = `PT ${metadata.name}`;
    parsed.sektor      = metadata.sector + (metadata.subsector ? ` — ${metadata.subsector}` : '');
  }

  // ── 8. Build response ──────────────────────────────────────────
  const response = {
    ...parsed,
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
      ma20:   indicators.ma?.ma20,
      ma50:   indicators.ma?.ma50,
      macd:   indicators.macd,
      bb:     indicators.bb,
      atr:    indicators.atr,
      stoch:  indicators.stoch,
      trend:  indicators.trend,
      levels: indicators.levels
    },
    volumeData: volumeData ? {
      bias:      volumeData.accDist?.bias,
      isSpike:   volumeData.spike?.isSpike,
      spikeRatio: volumeData.spike?.ratio,
      narrative: volumeData.narrative,
      score:     volumeData.score,
      accDist:   volumeData.accDist,
      spike:     volumeData.spike,
      obv:       volumeData.obv,
      vwap:      volumeData.vwap,
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
    scoringData: scoring,
    ticker,
    generatedAt: new Date().toISOString(),
    latencyMs:   Date.now() - startTime,
    fromCache:   false
  };

  cacheSet(cacheKey, response, TTL.analysis);
  console.log(`[DONE] ${ticker} ${Date.now() - startTime}ms`);
  return res.status(200).json(response);
};
