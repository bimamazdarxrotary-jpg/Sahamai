// ══════════════════════════════════════════════════════════════════
// api/analyze.js — Main Handler (CommonJS)
// ══════════════════════════════════════════════════════════════════

var { validateTicker, validateAIOutput } = require('../lib/validation');
var { computeAll }                        = require('../lib/indicators');
var { analyzeVolume }                     = require('../lib/volume');
var { analyzeStructure }                  = require('../lib/structure');
var { computeScore }                      = require('../lib/scoring');
var { callAI }                            = require('../lib/ai');
var { cacheGet, cacheSet, TTL }           = require('../lib/cache');
var { analyzeMarketContext }              = require('../lib/context');
var { quickScan }                         = require('../lib/scanner');
var { analyzeBandar }                     = require('../lib/bandar');

// ── Rate Limiting ──────────────────────────────────────────────────
var rateLimitMap = new Map();
function isRateLimited(ip) {
  var now    = Date.now();
  var window = 60 * 1000;
  var max    = 10;
  var hits   = (rateLimitMap.get(ip) || []).filter(function(t) { return now - t < window; });
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > max;
}

// ── Fetch harga dari Yahoo Finance ─────────────────────────────────
async function fetchPriceData(ticker, isIndex) {
  var cacheKey = 'price:' + ticker;
  var cached   = cacheGet(cacheKey);
  if (cached) return cached;

  var symbol = isIndex
    ? (ticker === 'IHSG' ? '%5EJKSE' : '%5EJKLQ45')
    : ticker + '.JK';

  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=6mo';

  var res;
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

  var json;
  try { json = await res.json(); }
  catch (e) { console.error('[YAHOO JSON PARSE]', e.message); return null; }

  var result     = json && json.chart && json.chart.result && json.chart.result[0];
  var meta       = result && result.meta;
  var quotes     = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
  var timestamps = result && result.timestamp;

  if (!meta || !quotes || !timestamps) {
    console.error('[YAHOO NO DATA]', ticker);
    return null;
  }

  var closes  = quotes.close;
  var highs   = quotes.high;
  var lows    = quotes.low;
  var opens   = quotes.open;
  var volumes = quotes.volume;

  var candles = [];
  for (var i = 0; i < timestamps.length; i++) {
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

  var lastClose = meta.regularMarketPrice || candles[candles.length - 1].close;
  var prevClose = meta.chartPreviousClose  || (candles[candles.length - 2] && candles[candles.length - 2].close) || lastClose;
  var change    = lastClose - prevClose;
  var changePct = prevClose ? parseFloat((change / prevClose * 100).toFixed(2)) : 0;

  var priceData = {
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
  var current   = priceData.current;
  var changePct = priceData.changePct;
  var isUp      = priceData.isUp;
  var high52w   = priceData.high52w;
  var low52w    = priceData.low52w;
  var volume    = priceData.volume;
  var marketCap = priceData.marketCap;
  var currency  = priceData.currency;

  var pct52wHigh = high52w ? ((high52w - current) / high52w * 100).toFixed(1) : null;
  var pct52wLow  = low52w  ? ((current - low52w)  / low52w  * 100).toFixed(1) : null;

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
  var startTime = Date.now();

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  var ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown');
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Terlalu banyak request. Tunggu sebentar.' });

  // ── Validasi input ─────────────────────────────────────────────
  var tickerRaw  = req.body && req.body.ticker;
  var validation = validateTicker(tickerRaw);
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  var ticker   = validation.ticker;
  var isIndex  = validation.isIndex;
  var metadata = validation.metadata;

  // ── Cek cache analisis ─────────────────────────────────────────
  var cacheKey      = 'analysis:' + ticker;
  var cachedAnalysis = cacheGet(cacheKey);
  if (cachedAnalysis) {
    console.log('[CACHE HIT]', ticker);
    return res.status(200).json(Object.assign({}, cachedAnalysis, { fromCache: true }));
  }

  // ── 1. Fetch harga ─────────────────────────────────────────────
  var priceData = await fetchPriceData(ticker, isIndex);
  var candles   = (priceData && priceData.candles) || [];

  // ── 2. Indikator matematis ─────────────────────────────────────
  var indicators = candles.length >= 5 ? computeAll(candles) : {};
  console.log('[IND]', ticker, 'RSI=' + (indicators && indicators.rsi), 'MA20=' + (indicators && indicators.ma && indicators.ma.ma20));

  // ── 3. Volume intelligence ─────────────────────────────────────
  var volumeData = candles.length >= 5 ? analyzeVolume(candles) : null;

  // ── 4. Market structure ────────────────────────────────────────
  var structure = candles.length >= 10 ? analyzeStructure(candles, indicators, volumeData) : null;

  // ── 5. Scoring ─────────────────────────────────────────────────
  var scoring = computeScore(indicators, volumeData, structure, priceData);
  console.log('[SCORE]', ticker + ': ' + scoring.final + '/10 ->', scoring.recommendation);

  // ── 6. Market context ──────────────────────────────────────────
  var marketContext = !isIndex && candles.length >= 5
    ? analyzeMarketContext(ticker, candles, indicators, volumeData, structure)
    : null;

  // ── 7. Quick scan signals ──────────────────────────────────────
  var scanSignals = !isIndex && candles.length >= 20
    ? quickScan(ticker, candles, indicators, volumeData, structure, scoring)
    : null;

  // ── 8. Bandar analysis ───────────────────────────────────────────
  var bandarData = !isIndex && candles.length >= 20
    ? analyzeBandar(candles, indicators, volumeData, priceData, metadata)
    : null;
  if (bandarData) console.log('[BANDAR]', ticker, 'score=' + bandarData.bandarScore, bandarData.smartMoney && bandarData.smartMoney.label);

  // ── 9. AI ──────────────────────────────────────────────────────
  var priceContext = buildPriceContext(priceData);
  var parsed;
  try {
    var rawAI = await callAI({ ticker: ticker, metadata: metadata, isIndex: isIndex, priceData: priceData, priceContext: priceContext, indicators: indicators, volumeData: volumeData, structure: structure, scoring: scoring, bandarData: bandarData });
    var aiValidation = validateAIOutput(rawAI);
    if (!aiValidation.valid) {
      console.error('[AI PARSE]', ticker + ':', aiValidation.error);
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }
    parsed = aiValidation.parsed;
  } catch (err) {
    console.error('[AI ERROR]', ticker + ':', err.message);
    return res.status(502).json({ error: err.message || 'AI tidak merespons. Coba lagi.' });
  }

  // ── 9. Override metadata IDX ───────────────────────────────────
  if (metadata) {
    parsed.namaLengkap = 'PT ' + metadata.name;
    parsed.sektor      = metadata.sector + (metadata.subsector ? ' - ' + metadata.subsector : '');
  }

  // ── 10. Build response ─────────────────────────────────────────
  var response = Object.assign({}, parsed, {
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
      levels: indicators.levels
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
    ticker:        ticker,
    generatedAt:   new Date().toISOString(),
    latencyMs:     Date.now() - startTime,
    fromCache:     false
  });

  cacheSet(cacheKey, response, TTL.analysis);
  console.log('[DONE]', ticker, (Date.now() - startTime) + 'ms');
  return res.status(200).json(response);
};
