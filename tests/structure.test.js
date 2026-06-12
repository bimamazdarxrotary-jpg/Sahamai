// ══════════════════════════════════════════════════════════════════
// tests/structure.test.js — Unit Test: lib/structure.js
// ══════════════════════════════════════════════════════════════════

const { analyzeStructure } = require('../lib/structure');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); passed++; }
  catch (e) { console.log('  ❌ ' + name + ' — ' + e.message); failed++; }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function makeCandles(closes) {
  return closes.map((c, i) => ({
    date: '2024-01-' + String(i+1).padStart(2,'0'),
    open: c - 2, high: c + 15, low: c - 15, close: c,
    volume: 1000000
  }));
}

function range(s, e, step = 1) {
  const a = [];
  for (let i = s; step > 0 ? i <= e : i >= e; i += step) a.push(Math.round(i));
  return a;
}

const bullishIndicators = {
  ma: { aboveEMA9: true, aboveSMA50: true, alignment: 'bullish', type: null, ema9: 110, sma50: 105,
        // backward compat aliases
        aboveMA20: true, aboveMA50: true, ma20vs50: 'bullish_alignment', ma20: 110 },
  rsi: 55,
  bb: { position: 'middle', bandwidth: 8 }
};

const bearishIndicators = {
  ma: { aboveEMA9: false, aboveSMA50: false, alignment: 'bearish', type: null, ema9: 90, sma50: 95,
        // backward compat aliases
        aboveMA20: false, aboveMA50: false, ma20vs50: 'bearish_alignment', ma20: 90 },
  rsi: 40,
  bb: { position: 'middle', bandwidth: 8 }
};

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeStructure — Output');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return error', () => {
  const result = analyzeStructure(makeCandles([100, 200]));
  assert('error' in result);
});

test('Return semua field utama', () => {
  const result = analyzeStructure(makeCandles(range(100, 130)), bullishIndicators, {});
  assert('trend' in result, 'harus ada trend');
  assert('breakout' in result, 'harus ada breakout');
  assert('setups' in result, 'harus ada setups');
  assert('hhll' in result, 'harus ada hhll');
  assert('phase' in result, 'harus ada phase');
});

test('setups adalah array', () => {
  const result = analyzeStructure(makeCandles(range(100, 130)), bullishIndicators, {});
  assert(Array.isArray(result.setups));
});

test('phase adalah string valid', () => {
  const result = analyzeStructure(makeCandles(range(100, 130)), bullishIndicators, {});
  const validPhases = ['markup', 'markdown', 'accumulation', 'distribution', 'consolidation'];
  assert(validPhases.includes(result.phase), 'Phase tidak valid: ' + result.phase);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeStructure — Trend');
// ══════════════════════════════════════════════════════════════════

test('Harga tren naik kuat — direction uptrend', () => {
  const candles = makeCandles(range(100, 135));
  const result  = analyzeStructure(candles, bullishIndicators, {});
  assert(result.trend !== null);
  assert(result.trend.direction === 'uptrend',
    'Tren naik harus uptrend, got ' + result.trend.direction);
});

test('Harga tren turun kuat — direction downtrend', () => {
  const candles = makeCandles(range(135, 100, -1));
  const result  = analyzeStructure(candles, bearishIndicators, {});
  assert(result.trend !== null);
  assert(result.trend.direction === 'downtrend',
    'Tren turun harus downtrend, got ' + result.trend.direction);
});

test('trend.confidence range 0–100', () => {
  const result = analyzeStructure(makeCandles(range(100, 135)), bullishIndicators, {});
  assert(result.trend.confidence >= 0 && result.trend.confidence <= 100,
    'confidence out of range: ' + result.trend.confidence);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeStructure — Breakout');
// ══════════════════════════════════════════════════════════════════

test('breakout return field isBreakout', () => {
  const result = analyzeStructure(makeCandles(range(100, 125)), bullishIndicators, {});
  assert(result.breakout !== null && 'isBreakout' in result.breakout);
});

test('Harga di tengah range — tidak breakout', () => {
  // Harga sideways tidak breakout
  const closes = Array(25).fill(1000);
  const result = analyzeStructure(makeCandles(closes), {}, {});
  assert(result.breakout !== null && result.breakout.isBreakout === false);
});

test('Harga tembus high 20 candle — breakout detected', () => {
  // 20 candle di 100, lalu 1 candle di 200 (jauh di atas range)
  const closes = Array(20).fill(100).concat([200]);
  const result = analyzeStructure(makeCandles(closes), bullishIndicators, {});
  assert(result.breakout !== null && result.breakout.isBreakout === true,
    'Harga jauh di atas range harus breakout');
  assert(result.breakout.type === 'bullish_breakout', 'Harus bullish_breakout');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeStructure — Phase');
// ══════════════════════════════════════════════════════════════════

test('Breakout + volume konfirmasi — phase markup', () => {
  const closes = Array(20).fill(100).concat([200]);
  const vols   = Array(20).fill(1000000).concat([3000000]);
  const candles = closes.map((c, i) => ({
    date: '2024-01-' + String(i+1).padStart(2,'0'),
    open: c - 2, high: c + 15, low: c - 15, close: c,
    volume: vols[i]
  }));
  const result = analyzeStructure(candles, bullishIndicators, {});
  assert(result.phase === 'markup', 'Breakout harus markup, got ' + result.phase);
});

test('Accumulation bias dari volume — phase accumulation', () => {
  const result = analyzeStructure(
    makeCandles(Array(25).fill(1000)),
    {},
    { accDist: { bias: 'accumulation' } }
  );
  assert(result.phase === 'accumulation', 'got ' + result.phase);
});

test('Tidak ada signal — phase consolidation', () => {
  const result = analyzeStructure(makeCandles(Array(25).fill(1000)), {}, {});
  assert(result.phase === 'consolidation', 'got ' + result.phase);
});

test('Edge case — tidak crash dengan data minimal', () => {
  let result;
  try { result = analyzeStructure(makeCandles(range(100, 115)), {}, {}); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(result !== null && typeof result === 'object');
});

// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 structure — Extended Coverage');
// ══════════════════════════════════════════════════════════════════

test('phaseConfidence ada di response', () => {
  const result = analyzeStructure(makeCandles(range(100, 130)), bullishIndicators, {});
  assert('phaseConfidence' in result, 'harus ada phaseConfidence');
  assert(result.phaseConfidence >= 0 && result.phaseConfidence <= 100,
    'phaseConfidence out of range: ' + result.phaseConfidence);
});

test('consolidationRange ada di response', () => {
  const result = analyzeStructure(makeCandles(range(100, 130)), bullishIndicators, {});
  assert('consolidationRange' in result, 'harus ada consolidationRange');
  assert('high' in result.consolidationRange && 'low' in result.consolidationRange);
  assert(result.consolidationRange.high >= result.consolidationRange.low,
    'high harus >= low');
});

test('Breakout + volume tinggi — phaseConfidence >= 80', () => {
  const closes = Array(20).fill(100).concat([200]);
  const vols   = Array(20).fill(1000000).concat([3000000]);
  const candles = closes.map((c, i) => ({
    date: '2024-01-' + String(i+1).padStart(2,'0'),
    open: c-2, high: c+15, low: c-15, close: c,
    volume: vols[i]
  }));
  const result = analyzeStructure(candles, bullishIndicators, {});
  assert(result.phaseConfidence >= 80,
    'Breakout confirmed harus phaseConfidence >= 80, got ' + result.phaseConfidence);
});

test('Sideways — phaseConfidence <= 50', () => {
  const result = analyzeStructure(makeCandles(Array(25).fill(1000)), {}, {});
  assert(result.phaseConfidence <= 50,
    'Sideways harus phaseConfidence <= 50, got ' + result.phaseConfidence);
});

test('rangePct > 0 pada data normal', () => {
  const result = analyzeStructure(makeCandles(range(100, 130)), bullishIndicators, {});
  assert(result.consolidationRange.rangePct > 0, 'rangePct harus > 0');
});

console.log('\n══════════════════════════════════');
console.log(`Hasil: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
