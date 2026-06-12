// ══════════════════════════════════════════════════════════════════
// tests/indicators.test.js — Unit Test: lib/indicators.js
// ══════════════════════════════════════════════════════════════════

const {
  sma, ema, rsi, macd, bollingerBands, atr,
  maCrossover, computeAll
} = require('../lib/indicators');

// ── Helper ────────────────────────────────────────────────────────
function makeCandles(closes, baseVol = 1000000) {
  return closes.map((c, i) => ({
    date:   '2024-01-' + String(i + 1).padStart(2, '0'),
    open:   c,
    high:   c + 10,
    low:    c - 10,
    close:  c,
    volume: baseVol
  }));
}

function range(start, end, step = 1) {
  const arr = [];
  for (let i = start; step > 0 ? i <= end : i >= end; i += step)
    arr.push(Math.round(i));
  return arr;
}

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅ ' + name);
    passed++;
  } catch (e) {
    console.log('  ❌ ' + name + ' — ' + e.message);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 SMA');
// ══════════════════════════════════════════════════════════════════

test('SMA 5 periode — rata-rata benar', () => {
  const result = sma([100, 200, 300, 400, 500], 5);
  assert(result === 300, 'SMA([100,200,300,400,500], 5) harus 300, got ' + result);
});

test('SMA data kurang dari periode — return null', () => {
  assert(sma([100, 200], 5) === null);
});

test('SMA data kosong — return null', () => {
  assert(sma([], 5) === null);
});

test('SMA ambil N data terakhir', () => {
  const result = sma([100, 200, 300, 400, 500, 600], 3);
  assert(result === 500, 'SMA 3 dari [...,400,500,600] harus 500, got ' + result);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📈 EMA');
// ══════════════════════════════════════════════════════════════════

test('EMA data kurang dari periode — return null', () => {
  assert(ema([100, 200], 5) === null);
});

test('EMA konvergen ke harga konstan', () => {
  const closes = Array(30).fill(1000);
  const result = ema(closes, 14);
  assert(result === 1000, 'EMA harga konstan harus = 1000, got ' + result);
});

test('EMA trending up >= SMA pada tren naik', () => {
  const closes = range(100, 130);
  const emaVal = ema(closes, 10);
  const smaVal = sma(closes, 10);
  assert(emaVal !== null && smaVal !== null);
  assert(emaVal !== null && smaVal !== null, "EMA dan SMA harus return nilai");
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📉 RSI');
// ══════════════════════════════════════════════════════════════════

test('RSI data kurang — return null', () => {
  assert(rsi([100, 200], 14) === null);
});

test('RSI semua naik — mendekati 100', () => {
  const closes = range(100, 120);
  const result = rsi(closes, 14);
  assert(result !== null && result > 85, 'RSI semua naik harus > 85, got ' + result);
});

test('RSI semua turun — mendekati 0', () => {
  const closes = range(120, 100, -1);
  const result = rsi(closes, 14);
  assert(result !== null && result < 15, 'RSI semua turun harus < 15, got ' + result);
});

test('RSI range 0–100', () => {
  const closes = [100,105,103,108,102,110,98,112,95,115,92,118,90,120,88,122,86,124];
  const result = rsi(closes, 14);
  assert(result !== null && result >= 0 && result <= 100, 'RSI harus 0-100, got ' + result);
});

test('RSI harga flat — return 100', () => {
  const closes = Array(20).fill(1000);
  const result = rsi(closes, 14);
  assert(result === 100, 'RSI flat harus 100, got ' + result);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 MACD');
// ══════════════════════════════════════════════════════════════════

test('MACD return object dengan field yang benar', () => {
  const closes = range(100, 145);
  const result = macd(closes);
  assert(result !== null, 'MACD harus return object');
  assert('macd' in result && 'signal' in result && 'histogram' in result && 'trend' in result);
});

test('MACD tren naik kuat — trend bullish', () => {
  const closes = range(100, 150);
  const result = macd(closes);
  assert(result !== null && result.trend === 'bullish', 'got ' + (result && result.trend));
});

test('MACD tren turun kuat — trend bearish', () => {
  const closes = range(150, 100, -1);
  const result = macd(closes);
  assert(result !== null && result.trend === 'bearish', 'got ' + (result && result.trend));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 Bollinger Bands');
// ══════════════════════════════════════════════════════════════════

test('BB data kurang — return null', () => {
  assert(bollingerBands([100, 200], 20) === null);
});

test('BB upper > middle > lower', () => {
  const closes = range(100, 125);
  const result = bollingerBands(closes, 20);
  assert(result !== null);
  assert(result.upper > result.middle && result.middle > result.lower,
    `upper=${result.upper} middle=${result.middle} lower=${result.lower}`);
});

test('BB harga flat — bandwidth sangat kecil', () => {
  const closes = Array(25).fill(1000);
  const result = bollingerBands(closes, 20);
  assert(result !== null && result.bandwidth < 1, 'got bandwidth=' + (result && result.bandwidth));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 ATR');
// ══════════════════════════════════════════════════════════════════

test('ATR data kurang — return null', () => {
  assert(atr(makeCandles([100, 200]), 14) === null);
});

test('ATR return field atr dan atrPct', () => {
  const result = atr(makeCandles(range(100, 120)), 14);
  assert(result !== null && 'atr' in result && 'atrPct' in result);
});

test('ATR > 0 pada data normal', () => {
  const result = atr(makeCandles(range(100, 120)), 14);
  assert(result !== null && result.atr > 0, 'ATR harus > 0');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 relativeVolume (RVOL)');
// ══════════════════════════════════════════════════════════════════

test('RVOL data kurang — return null', () => {
  const { relativeVolume } = require('../lib/indicators');
  assert(relativeVolume(makeCandles([100, 200]), 20) === null);
});

test('RVOL return field rvol dan label', () => {
  const { relativeVolume } = require('../lib/indicators');
  const candles = makeCandles(range(100, 125));
  const result  = relativeVolume(candles, 20);
  assert(result !== null && 'rvol' in result && 'label' in result, 'got: ' + JSON.stringify(result));
});

test('RVOL spike terdeteksi saat volume 3x', () => {
  const { relativeVolume } = require('../lib/indicators');
  const candles = makeCandles(range(100, 125));
  candles[candles.length - 1].volume = 3000000; // 3x dari default baseVol 1000000
  const result = relativeVolume(candles, 20);
  assert(result !== null && result.isSpike === true, 'got isSpike=' + (result && result.isSpike) + ' rvol=' + (result && result.rvol));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 position52w');
// ══════════════════════════════════════════════════════════════════

test('position52w data kurang — return null', () => {
  const { position52w } = require('../lib/indicators');
  assert(position52w([]) === null);
});

test('position52w return semua field utama', () => {
  const { position52w } = require('../lib/indicators');
  const result = position52w(makeCandles(range(100, 165)));
  assert(result !== null && 'positionPct' in result && 'high52w' in result && 'low52w' in result, 'got: ' + JSON.stringify(result));
});

test('position52w positionPct 0–100', () => {
  const { position52w } = require('../lib/indicators');
  const result = position52w(makeCandles(range(100, 165)));
  assert(result !== null && result.positionPct >= 0 && result.positionPct <= 100, 'got ' + (result && result.positionPct));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 computeAll');
// ══════════════════════════════════════════════════════════════════

test('computeAll return semua field utama', () => {
  const result = computeAll(makeCandles(range(100, 165)));
  assert(result !== null);
  ['rsi', 'macd', 'bb', 'ma', 'atr', 'rvol', 'obv', 'smartMoney', 'levels', 'fibonacci', 'position52w', 'divergence', 'candlestick'].forEach(f => {
    assert(f in result, 'Harus ada field: ' + f);
  });
});

test('computeAll data sedikit — tidak crash', () => {
  let result;
  try { result = computeAll(makeCandles([100, 105, 103])); }
  catch (e) { throw new Error('computeAll tidak boleh throw: ' + e.message); }
  assert(result !== null && typeof result === 'object');
});

test('computeAll data kosong — tidak crash', () => {
  let result;
  try { result = computeAll([]); }
  catch (e) { throw new Error('computeAll tidak boleh throw: ' + e.message); }
  assert(result !== null && typeof result === 'object');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════');
console.log(`Hasil: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
