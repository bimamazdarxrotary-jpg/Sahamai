// ══════════════════════════════════════════════════════════════════
// lib/scanner.js — Scanner Engine
// Breakout, volume spike, oversold, momentum, MA crossover scanner
// ══════════════════════════════════════════════════════════════════

var { computeAll }    = require('./indicators');
var { analyzeVolume } = require('./volume');
var { analyzeStructure } = require('./structure');
var { computeScore }  = require('./scoring');
var IDX_STOCKS        = require('../data/idx-stocks.json');

// Daftar saham yang akan di-scan (top likuid IHSG)
var SCAN_UNIVERSE = [
  'BBCA','BBRI','BMRI','BBNI','BRIS',
  'TLKM','ASII','UNVR','ICBP','KLBF',
  'ADRO','PTBA','ITMG','BREN','PGAS',
  'GOTO','BUKA','EMTK',
  'TPIA','INCO','ANTM','MDKA',
  'BSDE','CTRA','SMRA',
  'JSMR','WIKA','WSKT',
  'AMMN','MYOR','SIDO',
  'EXCL','ISAT','TBIG',
  'HMSP','GGRM','HEAL','MIKA'
];

/**
 * Fetch candles dari Yahoo Finance untuk satu ticker
 */
async function fetchCandles(ticker) {
  var symbol = ticker + '.JK';
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=3mo';

  try {
    var res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;

    var json = await res.json();
    var result     = json && json.chart && json.chart.result && json.chart.result[0];
    var meta       = result && result.meta;
    var quotes     = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
    var timestamps = result && result.timestamp;

    if (!meta || !quotes || !timestamps) return null;

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

    return {
      ticker:     ticker,
      candles:    candles,
      lastClose:  candles[candles.length - 1].close,
      lastVolume: candles[candles.length - 1].volume
    };
  } catch (e) {
    return null;
  }
}

/**
 * Scan satu saham untuk semua setup
 */
function scanTicker(ticker, candleData) {
  if (!candleData || !candleData.candles || candleData.candles.length < 20) return null;

  var candles    = candleData.candles;
  var indicators = computeAll(candles);
  var volumeData = analyzeVolume(candles);
  var structure  = analyzeStructure(candles, indicators, volumeData);
  var scoring    = computeScore(indicators, volumeData, structure, { current: candleData.lastClose });
  var metadata   = IDX_STOCKS[ticker] || null;

  var signals = [];

  // ── BREAKOUT SCANNER ───────────────────────────────────────────
  if (structure && structure.breakout && structure.breakout.isBreakout && structure.breakout.confirmed) {
    signals.push({
      type:       'breakout',
      label:      'Breakout Terkonfirmasi',
      direction:  structure.breakout.type === 'bullish_breakout' ? 'long' : 'short',
      detail:     'Breakout di level ' + (structure.breakout.level ? structure.breakout.level.toLocaleString('id-ID') : 'N/A') + ' dengan konfirmasi volume',
      strength:   'high'
    });
  }

  // ── VOLUME SPIKE SCANNER ───────────────────────────────────────
  if (volumeData && volumeData.spike && volumeData.spike.isSpike && volumeData.spike.ratio >= 2) {
    signals.push({
      type:       'volume_spike',
      label:      'Volume Spike ' + volumeData.spike.ratio + 'x',
      direction:  volumeData.accDist && volumeData.accDist.bias === 'accumulation' ? 'long' : 'watch',
      detail:     'Volume ' + volumeData.spike.ratio + 'x rata-rata — ' + (volumeData.spike.intensity || 'spike') + '. ' + (volumeData.narrative || ''),
      strength:   volumeData.spike.ratio >= 3 ? 'high' : 'medium'
    });
  }

  // ── OVERSOLD SCANNER ───────────────────────────────────────────
  if (indicators.rsi != null && indicators.rsi < 30) {
    signals.push({
      type:       'oversold',
      label:      'RSI Oversold (' + indicators.rsi + ')',
      direction:  'long',
      detail:     'RSI ' + indicators.rsi + ' di zona oversold. ' + (indicators.stoch && indicators.stoch.signal === 'oversold' ? 'Stochastic juga oversold — konfirmasi ganda.' : ''),
      strength:   indicators.rsi < 20 ? 'high' : 'medium'
    });
  }

  // ── GOLDEN CROSS SCANNER ───────────────────────────────────────
  if (indicators.ma && indicators.ma.type === 'golden_cross') {
    signals.push({
      type:       'golden_cross',
      label:      'Golden Cross MA20/MA50',
      direction:  'long',
      detail:     'MA20 baru menembus MA50 ke atas — sinyal uptrend dimulai.',
      strength:   'high'
    });
  }

  // ── DEATH CROSS SCANNER ────────────────────────────────────────
  if (indicators.ma && indicators.ma.type === 'death_cross') {
    signals.push({
      type:       'death_cross',
      label:      'Death Cross MA20/MA50',
      direction:  'short',
      detail:     'MA20 baru menembus MA50 ke bawah — sinyal downtrend dimulai.',
      strength:   'high'
    });
  }

  // ── ACCUMULATION SCANNER ───────────────────────────────────────
  if (volumeData && volumeData.accDist && volumeData.accDist.bias === 'accumulation' && volumeData.accDist.accDays >= 5) {
    signals.push({
      type:       'accumulation',
      label:      'Pola Akumulasi (' + volumeData.accDist.accDays + ' hari)',
      direction:  'long',
      detail:     'Akumulasi ' + volumeData.accDist.accDays + ' dari 10 hari terakhir. Potensi smart money masuk.',
      strength:   volumeData.accDist.accDays >= 7 ? 'high' : 'medium'
    });
  }

  // ── MOMENTUM SCANNER ───────────────────────────────────────────
  if (indicators.macd && indicators.macd.crossover === 'golden_cross') {
    signals.push({
      type:       'macd_cross',
      label:      'MACD Golden Cross',
      direction:  'long',
      detail:     'MACD line baru menembus signal line ke atas — momentum bullish dimulai.',
      strength:   'medium'
    });
  }

  if (!signals.length) return null;

  return {
    ticker:    ticker,
    name:      metadata ? metadata.name : ticker,
    sector:    metadata ? metadata.sector : 'Unknown',
    lastClose: candleData.lastClose,
    signals:   signals,
    score:     scoring ? scoring.final : 5,
    recommendation: scoring ? scoring.recommendation : 'TAHAN',
    topSignal: signals[0]
  };
}

/**
 * Run scanner untuk semua saham dalam universe
 * Fetch paralel dengan batas concurrency
 */
async function runScanner(filter) {
  var results  = [];
  var universe = SCAN_UNIVERSE;
  var batchSize = 5; // fetch 5 saham sekaligus

  for (var i = 0; i < universe.length; i += batchSize) {
    var batch   = universe.slice(i, i + batchSize);
    var fetched = await Promise.all(batch.map(fetchCandles));

    for (var j = 0; j < fetched.length; j++) {
      var candleData = fetched[j];
      if (!candleData) continue;

      var scanResult = scanTicker(batch[j], candleData);
      if (!scanResult) continue;

      // Filter berdasarkan tipe scan yang diminta
      if (filter && filter !== 'all') {
        var hasFilter = scanResult.signals.some(function(s) { return s.type === filter; });
        if (!hasFilter) continue;
      }

      results.push(scanResult);
    }
  }

  // Sort by score descending
  results.sort(function(a, b) { return b.score - a.score; });

  return {
    results:    results,
    total:      results.length,
    scannedAt:  new Date().toISOString(),
    filter:     filter || 'all'
  };
}

/**
 * Quick scan — hanya untuk satu ticker (dipakai di analyze.js)
 */
function quickScan(ticker, candles, indicators, volumeData, structure, scoring) {
  var signals = [];
  var metadata = IDX_STOCKS[ticker] || null;

  if (!candles || candles.length < 20) return { signals: [], ticker: ticker };

  // Breakout
  if (structure && structure.breakout && structure.breakout.isBreakout && structure.breakout.confirmed) {
    signals.push({ type: 'breakout', label: 'Breakout', strength: 'high' });
  }

  // Volume spike
  if (volumeData && volumeData.spike && volumeData.spike.isSpike) {
    signals.push({ type: 'volume_spike', label: 'Volume Spike ' + (volumeData.spike.ratio || '') + 'x', strength: volumeData.spike.ratio >= 3 ? 'high' : 'medium' });
  }

  // Oversold
  if (indicators && indicators.rsi != null && indicators.rsi < 30) {
    signals.push({ type: 'oversold', label: 'RSI Oversold (' + indicators.rsi + ')', strength: 'medium' });
  }

  // Golden cross
  if (indicators && indicators.ma && indicators.ma.type === 'golden_cross') {
    signals.push({ type: 'golden_cross', label: 'Golden Cross', strength: 'high' });
  }

  // Accumulation
  if (volumeData && volumeData.accDist && volumeData.accDist.bias === 'accumulation' && volumeData.accDist.accDays >= 6) {
    signals.push({ type: 'accumulation', label: 'Akumulasi ' + volumeData.accDist.accDays + ' hari', strength: 'medium' });
  }

  // MACD cross
  if (indicators && indicators.macd && indicators.macd.crossover === 'golden_cross') {
    signals.push({ type: 'macd_cross', label: 'MACD Cross', strength: 'medium' });
  }

  return { signals: signals, ticker: ticker, name: metadata ? metadata.name : ticker };
}

module.exports = { runScanner, quickScan, SCAN_UNIVERSE };
