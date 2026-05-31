// ══════════════════════════════════════════════════════════════════
// tests/volume.test.js — Unit Test: lib/volume.js
// ══════════════════════════════════════════════════════════════════

const { analyzeVolume, smartMoneyFlow, volumePriceTrend } = require('../lib/volume');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); passed++; }
  catch (e) { console.log('  ❌ ' + name + ' — ' + e.message); failed++; }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function makeCandles(closes, vols) {
  return closes.map((c, i) => ({
    date: '2024-01-' + String(i+1).padStart(2,'0'),
    open: c - 2, high: c + 10, low: c - 10, close: c,
    volume: vols ? vols[i] : 1000000
  }));
}

function range(s, e, step = 1) {
  const a = [];
  for (let i = s; step > 0 ? i <= e : i >= e; i += step) a.push(Math.round(i));
  return a;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeVolume');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return error', () => {
  const result = analyzeVolume(makeCandles([100, 200]));
  assert('error' in result);
});

test('Return semua field utama', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert('spike' in result, 'harus ada spike');
  assert('accDist' in result, 'harus ada accDist');
  assert('obv' in result, 'harus ada obv');
  assert('vwap' in result, 'harus ada vwap');
  assert('score' in result, 'harus ada score');
  assert('narrative' in result, 'harus ada narrative');
});

test('Score range 0–10', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert(result.score >= 0 && result.score <= 10, 'score out of range: ' + result.score);
});

test('Volume spike terdeteksi saat volume 3x avg', () => {
  const closes = range(100, 122); // 23 candle
  const vols   = Array(22).fill(500000).concat([2000000]); // candle terakhir 4x avg
  const result = analyzeVolume(makeCandles(closes, vols));
  assert(result.spike !== null);
  assert(result.spike.isSpike === true, 'Harus terdeteksi spike, ratio=' + (result.spike && result.spike.ratio));
  assert(result.spike.ratio >= 2, 'Ratio harus >= 2, got ' + result.spike.ratio);
});

test('Volume normal — tidak terdeteksi spike', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert(result.spike !== null);
  assert(result.spike.isSpike === false, 'Volume normal tidak boleh spike');
});

test('Harga naik + volume naik — accDist accumulation', () => {
  const closes = range(100, 125);
  // Volume naik seiring harga naik = accumulation
  const vols = range(100, 125).map((_, i) => 800000 + i * 50000);
  const result = analyzeVolume(makeCandles(closes, vols));
  assert(result.accDist !== null);
  assert(result.accDist.bias === 'accumulation', 'Harus accumulation, got ' + result.accDist.bias);
});

test('OBV trend sesuai dengan harga', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert(result.obv !== null);
  assert(['rising', 'falling'].includes(result.obv.trend), 'OBV trend tidak valid: ' + result.obv.trend);
});

test('VWAP > 0', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert(result.vwap !== null && result.vwap > 0, 'VWAP harus > 0');
});

test('narrative tidak kosong', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert(typeof result.narrative === 'string' && result.narrative.length > 0);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 smartMoneyFlow');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return null', () => {
  assert(smartMoneyFlow(makeCandles([100, 200]), 14) === null);
});

test('Return field yang benar', () => {
  const result = smartMoneyFlow(makeCandles(range(100, 120)), 14);
  assert(result !== null);
  assert('ratio' in result && 'bias' in result && 'label' in result);
});

test('ratio range 0–100', () => {
  const result = smartMoneyFlow(makeCandles(range(100, 120)), 14);
  assert(result !== null && result.ratio >= 0 && result.ratio <= 100, 'got ' + (result && result.ratio));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 volumePriceTrend');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return null', () => {
  assert(volumePriceTrend(makeCandles([100, 200])) === null);
});

test('Return field value dan trend', () => {
  const result = volumePriceTrend(makeCandles(range(100, 120)));
  assert(result !== null && 'value' in result && 'trend' in result);
});

test('VPT trend naik pada harga naik + volume konsisten', () => {
  const result = volumePriceTrend(makeCandles(range(100, 120)));
  assert(result !== null && result.trend === 'rising', 'got ' + (result && result.trend));
});

// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 Climax & Unusual Activity');
// ══════════════════════════════════════════════════════════════════

test('Climax tidak terdeteksi pada data normal', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert(result.climax !== null);
  assert(result.climax.isClimax === false, 'Data normal tidak boleh climax');
});

test('Selling climax terdeteksi — volume 4x + candle merah', () => {
  const closes = range(100, 122);
  const vols   = Array(22).fill(500000);
  vols[21] = 2200000; // 4x avg — volume ekstrim
  const candles = closes.map((c, i) => ({
    date: '2024-01-' + String(i+1).padStart(2,'0'),
    open: c + 5, high: c + 10, low: c - 10, close: c - 3, // bearish candle
    volume: vols[i]
  }));
  const result = analyzeVolume(candles);
  assert(result.climax !== null && result.climax.isClimax === true,
    'Volume 4x harus climax, ratio=' + (result.climax && result.climax.volRatio));
});

test('Unusual activity terdeteksi pada spike 3x', () => {
  const closes = range(100, 122);
  const vols   = Array(22).fill(500000);
  vols[20] = 1700000; // 3x+ avg
  const result = analyzeVolume(makeCandles(closes, vols));
  assert(result.unusual !== null, 'unusual harus ada');
  assert(result.unusual.hasUnusual === true, 'Volume 3x harus unusual');
});

test('Unusual activity tidak terdeteksi pada volume normal', () => {
  const result = analyzeVolume(makeCandles(range(100, 125)));
  assert(result.unusual !== null);
  assert(result.unusual.hasUnusual === false, 'Volume normal tidak boleh unusual');
});

console.log('\n══════════════════════════════════');
console.log(`Hasil: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
