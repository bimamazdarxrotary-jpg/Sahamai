// ══════════════════════════════════════════════════════════════════
// tests/scanner.test.js — Unit Test: lib/scanner.js (quickScan)
// ══════════════════════════════════════════════════════════════════

const { quickScan, isMarketCrashing } = require('../lib/scanner');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); passed++; }
  catch (e) { console.log('  ❌ ' + name + ' — ' + e.message); failed++; }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ── Fixtures ──────────────────────────────────────────────────────
function makeCandles(n, trend) {
  trend = trend || 'up';
  const candles = [];
  let price = 1000;
  for (let i = 0; i < n; i++) {
    if (trend === 'up')   price = price * 1.003;
    if (trend === 'down') price = price * 0.997;
    candles.push({
      date:   '2024-' + String(Math.floor(i/30)+1).padStart(2,'0') + '-' + String((i%30)+1).padStart(2,'0'),
      open:   Math.round(price * 0.998),
      high:   Math.round(price * 1.005),
      low:    Math.round(price * 0.993),
      close:  Math.round(price),
      volume: 1000000
    });
  }
  return candles;
}

const baseIndicators = {
  rsi:  50,
  ma:   { aboveMA20: true, aboveMA50: true, ma20vs50: 'bullish_alignment', type: null, ma20: 980, ma50: 950 },
  macd: { trend: 'bullish', crossover: null, histogram: 5 },
  bb:   { bandwidth: 10, position: 'neutral_zone', isSqueeze: false },
  atr:  { atrPct: 2.0 },
  obv:  { trend: 'rising' },
  rvol: { rvol: 1.2, label: 'Normal', isSpike: false },
  divergence:   null,
  candlestick:  null,
  fibonacci:    null
};

const baseVolume = {
  accDist: { bias: 'accumulation', accDays: 7 },
  spike:   { isSpike: false, ratio: 1.0, intensity: 'normal' }
};

const baseStructure = {
  breakout: { isBreakout: false, type: 'none', confirmed: false },
  setups:   []
};

const baseScoring = { final: 7, recommendation: 'BELI', confidence: 'High' };

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 quickScan — Output Structure');
// ══════════════════════════════════════════════════════════════════

test('Return object dengan field signals', () => {
  const result = quickScan('BBCA', makeCandles(25), baseIndicators, baseVolume, baseStructure, baseScoring);
  assert(result !== null && 'signals' in result, 'harus ada field signals');
  assert(Array.isArray(result.signals), 'signals harus Array');
});

test('Data candles kurang — return signals kosong', () => {
  const result = quickScan('BBCA', makeCandles(5), baseIndicators, baseVolume, baseStructure, baseScoring);
  assert(result.signals.length === 0, 'candles < 20 harus return signals kosong');
});

test('Indicators null — tidak crash', () => {
  let result;
  try { result = quickScan('BBCA', makeCandles(25), null, null, null, null); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(Array.isArray(result.signals));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 quickScan — Signal Detection');
// ══════════════════════════════════════════════════════════════════

test('Breakout bullish — sinyal breakout muncul', () => {
  const str = { ...baseStructure, breakout: { isBreakout: true, type: 'bullish_breakout', level: 1100, confirmed: true } };
  const { signals } = quickScan('BBCA', makeCandles(25), baseIndicators, baseVolume, str, baseScoring);
  assert(signals.some(s => s.type === 'breakout' && s.direction === 'long'), 'harus ada sinyal breakout long');
});

test('Bearish breakdown — sinyal breakdown muncul', () => {
  const str = { ...baseStructure, breakout: { isBreakout: true, type: 'bearish_breakdown', level: 900, confirmed: true } };
  const { signals } = quickScan('BBCA', makeCandles(25), baseIndicators, baseVolume, str, baseScoring);
  assert(signals.some(s => s.type === 'breakout' && s.direction === 'short'), 'harus ada sinyal breakdown short');
});

test('RSI oversold < 30 — sinyal oversold muncul', () => {
  const ind = { ...baseIndicators, rsi: 25 };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  assert(signals.some(s => s.type === 'oversold'), 'RSI 25 harus trigger oversold');
});

test('RSI > 30 — tidak ada sinyal oversold', () => {
  const ind = { ...baseIndicators, rsi: 55 };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  assert(!signals.some(s => s.type === 'oversold'), 'RSI 55 tidak boleh trigger oversold');
});

test('Golden cross — sinyal golden_cross muncul', () => {
  const ind = { ...baseIndicators, ma: { ...baseIndicators.ma, type: 'golden_cross' } };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  assert(signals.some(s => s.type === 'golden_cross'), 'harus ada sinyal golden_cross');
});

test('Death cross — sinyal death_cross muncul', () => {
  const ind = { ...baseIndicators, ma: { ...baseIndicators.ma, type: 'death_cross' } };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  assert(signals.some(s => s.type === 'death_cross'), 'harus ada sinyal death_cross');
});

test('MACD golden cross — sinyal macd_cross muncul', () => {
  const ind = { ...baseIndicators, macd: { ...baseIndicators.macd, crossover: 'golden_cross' } };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  assert(signals.some(s => s.type === 'macd_cross' && s.direction === 'long'), 'harus ada sinyal macd_cross long');
});

test('Bullish divergence — sinyal divergence muncul', () => {
  const ind = { ...baseIndicators, divergence: { detected: true, bias: 'bullish', summary: 'Bullish divergence RSI' } };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  assert(signals.some(s => s.type === 'divergence' && s.direction === 'long'), 'harus ada sinyal divergence long');
});

test('RVOL 2x + akumulasi — sinyal volume_spike muncul', () => {
  const ind = { ...baseIndicators, rvol: { rvol: 2.5, label: 'Sangat Tinggi (2x+)', isSpike: true } };
  const vol = { ...baseVolume, accDist: { bias: 'accumulation', accDays: 7 } };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, vol, baseStructure, baseScoring);
  assert(signals.some(s => s.type === 'volume_spike'), 'RVOL 2.5x + akumulasi harus trigger volume_spike');
});

test('BB squeeze — sinyal squeeze muncul', () => {
  const ind = { ...baseIndicators, bb: { bandwidth: 3.5, position: 'neutral_zone', isSqueeze: true } };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  assert(signals.some(s => s.type === 'squeeze'), 'BB bandwidth < 5 harus trigger squeeze');
});

test('Sinyal diurutkan high → medium → low', () => {
  const ind = {
    ...baseIndicators,
    rsi:        25,
    ma:         { ...baseIndicators.ma, type: 'golden_cross' },
    macd:       { ...baseIndicators.macd, crossover: 'golden_cross' },
    divergence: { detected: true, bias: 'bullish', summary: 'test' }
  };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring);
  const strengths = signals.map(s => s.strength);
  const order = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < strengths.length; i++) {
    assert((order[strengths[i]] || 2) >= (order[strengths[i-1]] || 2),
      'Sinyal tidak terurut: ' + strengths[i-1] + ' → ' + strengths[i]);
  }
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 quickScan — Crash Blocker');
// ══════════════════════════════════════════════════════════════════

test('IHSG crash >8% — sinyal bullish diblokir', () => {
  const cacheGet = function(key) { return key === 'ihsg:changePct' ? -9.5 : null; };
  const ind = { ...baseIndicators, rsi: 25, ma: { ...baseIndicators.ma, type: 'golden_cross' } };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring, 0, cacheGet);
  assert(!signals.some(s => s.direction === 'long'), 'Saat crash, tidak boleh ada sinyal long');
  assert(signals.some(s => s.type === 'market_crash'), 'Harus ada sinyal market_crash');
});

test('IHSG crash >8% — sinyal bearish tetap muncul', () => {
  const cacheGet = function(key) { return key === 'ihsg:changePct' ? -9.5 : null; };
  const str = { ...baseStructure, breakout: { isBreakout: true, type: 'bearish_breakdown', level: 900, confirmed: true } };
  const { signals } = quickScan('BBCA', makeCandles(25), baseIndicators, baseVolume, str, baseScoring, 0, cacheGet);
  assert(signals.some(s => s.direction === 'short'), 'Sinyal short tetap harus muncul saat crash');
});

test('IHSG tidak crash (-5%) — sinyal bullish tetap muncul', () => {
  const cacheGet = function(key) { return key === 'ihsg:changePct' ? -5 : null; };
  const ind = { ...baseIndicators, rsi: 25 };
  const { signals } = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring, 0, cacheGet);
  assert(signals.some(s => s.direction === 'long'), 'IHSG -5% tidak boleh blokir sinyal long');
});

test('Tidak ada cacheGet — tidak crash, sinyal normal', () => {
  const ind = { ...baseIndicators, rsi: 25 };
  let result;
  try { result = quickScan('BBCA', makeCandles(25), ind, baseVolume, baseStructure, baseScoring); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(result.signals.some(s => s.direction === 'long'), 'Tanpa cacheGet sinyal bullish harus muncul');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 isMarketCrashing');
// ══════════════════════════════════════════════════════════════════

test('IHSG -9% — return true', () => {
  const cacheGet = function(key) { return -9; };
  assert(isMarketCrashing(cacheGet) === true, 'IHSG -9% harus return true');
});

test('IHSG -5% — return false', () => {
  const cacheGet = function(key) { return -5; };
  assert(isMarketCrashing(cacheGet) === false, 'IHSG -5% harus return false');
});

test('IHSG +2% — return false', () => {
  const cacheGet = function(key) { return 2; };
  assert(isMarketCrashing(cacheGet) === false, 'IHSG +2% harus return false');
});

test('cacheGet null — return false', () => {
  assert(isMarketCrashing(null) === false, 'cacheGet null harus return false');
});

test('Cache kosong (return null) — return false', () => {
  const cacheGet = function(key) { return null; };
  assert(isMarketCrashing(cacheGet) === false, 'Cache kosong harus return false');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════');
console.log('Hasil: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
