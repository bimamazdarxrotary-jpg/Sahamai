// ══════════════════════════════════════════════════════════════════
// api/scanner.js — Scanner Endpoint
// Scan saham IHSG untuk setup: breakout, volume spike, dll
// ══════════════════════════════════════════════════════════════════

var { computeAll }       = require('../lib/indicators');
var { analyzeVolume }    = require('../lib/volume');
var { analyzeStructure } = require('../lib/structure');
var { computeScore }     = require('../lib/scoring');
var { cacheGet, cacheSet } = require('../lib/cache');
var IDX_STOCKS           = require('../data/idx-stocks.json');

var SCAN_UNIVERSE = [
  'BBCA','BBRI','BMRI','BBNI','BRIS','BBTN',
  'TLKM','ASII','UNVR','ICBP','KLBF',
  'ADRO','PTBA','ITMG','BREN','PGAS','HRUM','GEMS',
  'GOTO','BUKA','EMTK',
  'TPIA','INCO','ANTM','MDKA','AMMN','BRMS',
  'BSDE','CTRA','SMRA','PWON',
  'JSMR','WIKA','WSKT','PTPP','ADHI',
  'AMMN','MYOR','SIDO','AMRT',
  'EXCL','ISAT','TBIG',
  'HMSP','KAEF','HEAL','MIKA',
  'ACES','ERAA','MAPI',
  'SMGR','INTP',
  'INKP','TKIM',
  'JPFA','CPIN',
  'AALI','LSIP'
];

// De-duplicate
SCAN_UNIVERSE = SCAN_UNIVERSE.filter(function(v, i, a) { return a.indexOf(v) === i; });

var CACHE_TTL = 10 * 60 * 1000; // 10 menit

async function fetchCandles(ticker) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.JK?interval=1d&range=3mo';
  try {
    var res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;

    var json       = await res.json();
    var result     = json && json.chart && json.chart.result && json.chart.result[0];
    var meta       = result && result.meta;
    var quotes     = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
    var timestamps = result && result.timestamp;
    if (!meta || !quotes || !timestamps) return null;

    var candles = [];
    for (var i = 0; i < timestamps.length; i++) {
      if (!quotes.close[i]) continue;
      candles.push({
        date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open:   Math.round(quotes.open  && quotes.open[i]   ? quotes.open[i]   : quotes.close[i]),
        high:   Math.round(quotes.high  && quotes.high[i]   ? quotes.high[i]   : quotes.close[i]),
        low:    Math.round(quotes.low   && quotes.low[i]    ? quotes.low[i]    : quotes.close[i]),
        close:  Math.round(quotes.close[i]),
        volume: quotes.volume && quotes.volume[i] ? quotes.volume[i] : 0
      });
    }
    if (candles.length < 20) return null;

    return {
      ticker:    ticker,
      candles:   candles,
      lastClose: candles[candles.length - 1].close,
      lastVol:   candles[candles.length - 1].volume
    };
  } catch (e) {
    return null;
  }
}

function scanOneTicker(ticker, candleData) {
  if (!candleData || !candleData.candles || candleData.candles.length < 20) return null;

  var candles  = candleData.candles;
  var metadata = IDX_STOCKS[ticker] || null;

  var indicators = computeAll(candles);
  var volumeData = analyzeVolume(candles);
  var structure  = analyzeStructure(candles, indicators, volumeData);
  var scoring    = computeScore(indicators, volumeData, structure, { current: candleData.lastClose });

  var signals = [];

  // Breakout
  if (structure && structure.breakout && structure.breakout.isBreakout && structure.breakout.confirmed) {
    signals.push({
      type:      'breakout',
      label:     'Breakout',
      direction: structure.breakout.type === 'bullish_breakout' ? 'long' : 'short',
      detail:    'Breakout di ' + (structure.breakout.level ? structure.breakout.level.toLocaleString('id-ID') : 'N/A') + ' — volume terkonfirmasi',
      strength:  'high'
    });
  }

  // Volume spike
  if (volumeData && volumeData.spike && volumeData.spike.isSpike && volumeData.spike.ratio >= 2) {
    signals.push({
      type:      'volume_spike',
      label:     'Vol Spike ' + volumeData.spike.ratio + 'x',
      direction: volumeData.accDist && volumeData.accDist.bias === 'accumulation' ? 'long' : 'watch',
      detail:    'Volume ' + volumeData.spike.ratio + 'x rata-rata — ' + (volumeData.narrative || ''),
      strength:  volumeData.spike.ratio >= 3 ? 'high' : 'medium'
    });
  }

  // Oversold
  if (indicators.rsi != null && indicators.rsi < 30) {
    signals.push({
      type:      'oversold',
      label:     'RSI Oversold ' + indicators.rsi,
      direction: 'long',
      detail:    'RSI ' + indicators.rsi + ' — zona oversold' + (indicators.stoch && indicators.stoch.signal === 'oversold' ? ' + Stoch oversold' : ''),
      strength:  indicators.rsi < 20 ? 'high' : 'medium'
    });
  }

  // Golden cross
  if (indicators.ma && indicators.ma.type === 'golden_cross') {
    signals.push({
      type:      'golden_cross',
      label:     'Golden Cross',
      direction: 'long',
      detail:    'MA20 menembus MA50 ke atas — sinyal uptrend',
      strength:  'high'
    });
  }

  // Death cross
  if (indicators.ma && indicators.ma.type === 'death_cross') {
    signals.push({
      type:      'death_cross',
      label:     'Death Cross',
      direction: 'short',
      detail:    'MA20 menembus MA50 ke bawah — sinyal downtrend',
      strength:  'high'
    });
  }

  // Accumulation
  if (volumeData && volumeData.accDist && volumeData.accDist.bias === 'accumulation' && volumeData.accDist.accDays >= 5) {
    signals.push({
      type:      'accumulation',
      label:     'Akumulasi ' + volumeData.accDist.accDays + 'h',
      direction: 'long',
      detail:    'Akumulasi ' + volumeData.accDist.accDays + ' dari 10 hari — potensi smart money masuk',
      strength:  volumeData.accDist.accDays >= 7 ? 'high' : 'medium'
    });
  }

  // MACD cross
  if (indicators.macd && indicators.macd.crossover === 'golden_cross') {
    signals.push({
      type:      'macd_cross',
      label:     'MACD Cross',
      direction: 'long',
      detail:    'MACD menembus signal line ke atas — momentum bullish',
      strength:  'medium'
    });
  }

  if (!signals.length) return null;

  // Change pct
  var changePct = 0;
  if (candles.length >= 2) {
    var prev = candles[candles.length - 2].close;
    changePct = prev ? parseFloat(((candleData.lastClose - prev) / prev * 100).toFixed(2)) : 0;
  }

  return {
    ticker:         ticker,
    name:           metadata ? metadata.name : ticker,
    sector:         metadata ? metadata.sector : 'Unknown',
    lastClose:      candleData.lastClose,
    changePct:      changePct,
    isUp:           changePct >= 0,
    score:          scoring ? scoring.final : 5,
    recommendation: scoring ? scoring.recommendation : 'TAHAN',
    confidence:     scoring ? scoring.confidence : 'Low',
    rsi:            indicators.rsi,
    signals:        signals,
    topSignal:      signals[0]
  };
}

async function runScan(filter) {
  var results   = [];
  var universe  = SCAN_UNIVERSE;
  var batchSize = 6;

  for (var i = 0; i < universe.length; i += batchSize) {
    var batch   = universe.slice(i, i + batchSize);
    var fetched = await Promise.all(batch.map(fetchCandles));

    for (var j = 0; j < batch.length; j++) {
      if (!fetched[j]) continue;
      var result = scanOneTicker(batch[j], fetched[j]);
      if (!result) continue;

      if (filter && filter !== 'all') {
        var match = result.signals.some(function(s) { return s.type === filter; });
        if (!match) continue;
      }

      results.push(result);
    }
  }

  results.sort(function(a, b) { return b.score - a.score; });

  return {
    results:   results,
    total:     results.length,
    universe:  universe.length,
    filter:    filter || 'all',
    scannedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var filter   = (req.query && req.query.filter) || (req.body && req.body.filter) || 'all';
  var cacheKey = 'scanner:' + filter;
  var cached   = cacheGet(cacheKey);
  if (cached) {
    console.log('[SCANNER CACHE HIT]', filter);
    return res.status(200).json(Object.assign({}, cached, { fromCache: true }));
  }

  console.log('[SCANNER START]', filter);
  try {
    var data = await runScan(filter);
    cacheSet(cacheKey, data, CACHE_TTL);
    console.log('[SCANNER DONE]', data.total, 'results');
    return res.status(200).json(data);
  } catch (e) {
    console.error('[SCANNER ERROR]', e.message);
    return res.status(500).json({ error: 'Scanner gagal: ' + e.message });
  }
};
