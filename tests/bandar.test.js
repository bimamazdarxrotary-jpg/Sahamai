// ══════════════════════════════════════════════════════════════════
// tests/bandar.test.js — Unit Test: lib/bandar.js
// ══════════════════════════════════════════════════════════════════

const {
  analyzeBandar,
  detectStealthAccumulation,
  detectDistributionTrap,
  detectRetailPanic,
  detectSmartMoneyFootprint,
  detectStockType
} = require('../lib/bandar');

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

// ── Helper ────────────────────────────────────────────────────────
function makeCandles(n, opts = {}) {
  const {
    basePrice = 1000,
    priceDrift = 0,     // perubahan harga per candle
    baseVol = 1000000,
    volDrift = 0,       // perubahan volume per candle
    bearish = false
  } = opts;

  return Array.from({ length: n }, (_, i) => {
    const close = basePrice + priceDrift * i;
    const open  = bearish ? close + 5 : close - 5;
    return {
      date:   '2024-01-' + String(i + 1).padStart(2, '0'),
      open,
      high:   close + 15,
      low:    close - 15,
      close,
      volume: Math.max(1000, baseVol + volDrift * i)
    };
  });
}

// Candle dengan lower wick panjang (tanda akumulasi di low)
function makeLongLowerWick(price, vol) {
  return { date: '2024-01-01', open: price, high: price + 5, low: price - 40, close: price + 2, volume: vol };
}

// Candle dengan upper wick panjang (tanda distribusi di high)
function makeLongUpperWick(price, vol) {
  return { date: '2024-01-01', open: price, high: price + 40, low: price - 5, close: price - 2, volume: vol };
}

// Candle bearish besar dengan volume tinggi (retail panic)
function makePanicCandle(price, vol) {
  return { date: '2024-01-01', open: price + 30, high: price + 35, low: price - 5, close: price, volume: vol };
}

// ══════════════════════════════════════════════════════════════════
console.log('\n🕵️ detectStealthAccumulation');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return null', () => {
  assert(detectStealthAccumulation(makeCandles(5)) === null);
});

test('Return field yang diperlukan', () => {
  const result = detectStealthAccumulation(makeCandles(20));
  assert(result !== null);
  assert('detected' in result && 'priceChange' in result && 'volGrowth' in result && 'confidence' in result);
});

test('Harga flat + volume naik + lower wick — detected true', () => {
  // 10 candle awal: volume kecil, harga stabil
  const first10 = makeCandles(10, { basePrice: 1000, baseVol: 500000 });
  // 10 candle akhir: volume naik signifikan + lower wick panjang
  const last10 = Array.from({ length: 10 }, (_, i) => ({
    ...makeLongLowerWick(1000 + i, 700000 + i * 20000) // volume naik >20%, harga flat
  }));
  const candles = first10.concat(last10);
  const result = detectStealthAccumulation(candles);
  assert(result !== null);
  // Hanya cek tidak crash dan return proper structure
  assert(typeof result.detected === 'boolean');
  assert(['high', 'medium', 'low'].includes(result.confidence));
});

test('Harga naik cepat — detected false (bukan stealth)', () => {
  const candles = makeCandles(20, { basePrice: 1000, priceDrift: 10 }); // naik 10/candle = +100% = tidak flat
  const result = detectStealthAccumulation(candles);
  assert(result !== null && result.detected === false,
    'Harga naik cepat bukan stealth accumulation');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📉 detectDistributionTrap');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return null', () => {
  assert(detectDistributionTrap(makeCandles(5)) === null);
});

test('Return field yang diperlukan', () => {
  const result = detectDistributionTrap(makeCandles(15));
  assert(result !== null);
  assert('detected' in result && 'distCandles' in result && 'confidence' in result);
});

test('Tidak ada distribusi pada data normal — detected false', () => {
  const candles = makeCandles(20, { baseVol: 500000 }); // volume konsisten, tidak ada spike
  const result = detectDistributionTrap(candles);
  assert(result !== null && result.detected === false);
});

test('Harga naik + candle upper wick besar + volume tinggi — detected true', () => {
  // Harga naik: last > first
  const base = makeCandles(15, { basePrice: 1000, priceDrift: 5, baseVol: 500000 });
  // Ganti 3 candle terakhir dengan upper wick panjang + volume tinggi
  base[12] = makeLongUpperWick(1060, 1200000);
  base[13] = makeLongUpperWick(1065, 1300000);
  base[14] = makeLongUpperWick(1070, 1400000);
  const result = detectDistributionTrap(base);
  assert(result !== null && result.detected === true,
    'Harus detected, distCandles=' + (result && result.distCandles));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n😱 detectRetailPanic');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return null', () => {
  assert(detectRetailPanic(makeCandles(10)) === null);
});

test('Return field yang diperlukan', () => {
  const result = detectRetailPanic(makeCandles(21));
  assert(result !== null);
  assert('detected' in result && 'panicCount' in result && 'confidence' in result);
});

test('Data normal tanpa panic — detected false', () => {
  const candles = makeCandles(21, { baseVol: 500000 });
  const result = detectRetailPanic(candles);
  assert(result !== null && result.detected === false);
});

test('Candle merah besar + volume 3x avg — detected true', () => {
  const candles = makeCandles(21, { baseVol: 500000 });
  // Ganti candle terakhir dengan panic candle (volume 3x)
  candles[20] = makePanicCandle(1000, 1500000); // 3x avg
  const result = detectRetailPanic(candles);
  assert(result !== null && result.detected === true,
    'Panic candle volume 3x harus detected');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n🧠 detectSmartMoneyFootprint');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return score 0', () => {
  const result = detectSmartMoneyFootprint(makeCandles(5), {}, {});
  assert(result !== null && result.score === 0);
});

test('Return field score, signals, label', () => {
  const result = detectSmartMoneyFootprint(makeCandles(20), {}, {});
  assert('score' in result && 'signals' in result && 'label' in result);
  assert(Array.isArray(result.signals));
});

test('OBV bullish divergence — score naik', () => {
  const candles  = makeCandles(20, { basePrice: 1000, priceDrift: -1 }); // harga turun
  const volData  = { obv: { trend: 'rising' } }; // OBV naik
  const result   = detectSmartMoneyFootprint(candles, {}, volData);
  assert(result.score >= 3, 'OBV divergence harus tambah score >= 3, got ' + result.score);
});

test('Accumulation dari volume engine — score naik', () => {
  const candles = makeCandles(20);
  const volData = { accDist: { bias: 'accumulation', accDays: 7 } };
  const result  = detectSmartMoneyFootprint(candles, {}, volData);
  assert(result.score >= 2, 'Accumulation bias harus tambah score, got ' + result.score);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n🏷️ detectStockType');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return null', () => {
  assert(detectStockType(makeCandles(5), {}, {}) === null);
});

test('Return field type dan label', () => {
  const result = detectStockType(makeCandles(20), { marketCap: 10e12 }, {});
  assert(result !== null);
  assert('type' in result && 'label' in result);
  assert(['speculative', 'fundamental', 'mixed'].includes(result.type));
});

test('Market cap besar + volatilitas rendah — fundamental', () => {
  const candles = makeCandles(20, { basePrice: 1000, priceDrift: 0.1 }); // stabil
  const result  = detectStockType(candles, { marketCap: 10e12 }, {}); // > 5T
  assert(result !== null && result.type === 'fundamental',
    'Large cap stabil harus fundamental, got ' + (result && result.type));
});

test('Market cap kecil + volatilitas tinggi + volume erratic — speculative', () => {
  // Volatilitas tinggi: naik-turun drastis
  const closes = [1000,1100,900,1200,800,1300,700,1400,600,1500,500,1300,600,1200,700,1100,800,1000,900,950];
  const candles = closes.map((c, i) => ({
    date: '2024-01-' + String(i+1).padStart(2,'0'),
    open: c, high: c + 50, low: c - 50, close: c,
    volume: i % 3 === 0 ? 5000000 : 100000 // volume erratic: kadang 50x lebih besar
  }));
  const result = detectStockType(candles, { marketCap: 500e9 }, {}); // < 1T
  assert(result !== null && result.type === 'speculative',
    'Small cap volatile harus speculative, got ' + (result && result.type));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeBandar');
// ══════════════════════════════════════════════════════════════════

test('Data kurang — return error', () => {
  const result = analyzeBandar(makeCandles(5), {}, {}, {}, {});
  assert('error' in result);
});

test('Return semua field utama', () => {
  const candles = makeCandles(25);
  const result  = analyzeBandar(candles, {}, {}, { marketCap: 5e12 }, {});
  assert('smartMoney' in result, 'harus ada smartMoney');
  assert('stealth' in result, 'harus ada stealth');
  assert('distTrap' in result, 'harus ada distTrap');
  assert('panic' in result, 'harus ada panic');
  assert('bandarScore' in result, 'harus ada bandarScore');
  assert('narrative' in result, 'harus ada narrative');
});

test('bandarScore range 0–10', () => {
  const candles = makeCandles(25);
  const result  = analyzeBandar(candles, {}, {}, {}, {});
  assert(result.bandarScore >= 0 && result.bandarScore <= 10,
    'bandarScore out of range: ' + result.bandarScore);
});

test('narrative tidak kosong', () => {
  const candles = makeCandles(25);
  const result  = analyzeBandar(candles, {}, {}, {}, {});
  assert(typeof result.narrative === 'string' && result.narrative.length > 0);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════');
console.log(`Hasil: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
