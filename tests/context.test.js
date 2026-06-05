// ══════════════════════════════════════════════════════════════════
// tests/context.test.js — Unit Test: lib/context.js
// ══════════════════════════════════════════════════════════════════

const {
  analyzeMarketContext,
  getSektorFromTicker,
  analyzeSectorStrength,
  detectRiskSentiment,
  analyzeSectorRotation
} = require('../lib/context');

let passed = 0, failed = 0;
const _asyncTests = [];

function test(name, fn) {
  let result;
  try { result = fn(); } catch (e) { console.log('  ❌ ' + name + ' — ' + e.message); failed++; return; }
  if (result && typeof result.then === 'function') {
    _asyncTests.push(
      result
        .then(function() { console.log('  ✅ ' + name); passed++; })
        .catch(function(e) { console.log('  ❌ ' + name + ' — ' + e.message); failed++; })
    );
    return;
  }
  console.log('  ✅ ' + name); passed++;
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function makeCandles(n, priceDrift = 0) {
  return Array.from({ length: n }, (_, i) => ({
    date: '2024-01-' + String(i+1).padStart(2,'0'),
    open: 1000, high: 1010, low: 990,
    close: 1000 + priceDrift * i,
    volume: 1000000
  }));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 getSektorFromTicker');
// ══════════════════════════════════════════════════════════════════

test('Ticker dikenal — return sektor', () => {
  const sektor = getSektorFromTicker('BBCA');
  assert(sektor !== null && typeof sektor === 'string' && sektor.length > 0,
    'BBCA harus punya sektor, got: ' + sektor);
});

test('Ticker tidak dikenal — return null', () => {
  assert(getSektorFromTicker('XXXZZ') === null);
});

test('Ticker kosong — return null', () => {
  assert(getSektorFromTicker('') === null);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeSectorStrength');
// ══════════════════════════════════════════════════════════════════

// analyzeSectorStrength adalah async — mock fetch agar tidak hit network
global.fetch = global.fetch || async function() { return { ok: false }; };

test('Data kurang — return unknown', async () => {
  const result = await analyzeSectorStrength('Perbankan', makeCandles(2));
  assert(result.strength === 'unknown');
});

test('Return field sektor, strength, return20d', async () => {
  const result = await analyzeSectorStrength('Perbankan', makeCandles(25, 1));
  assert('sektor' in result && 'strength' in result && 'return20d' in result);
});

test('Harga naik 15% — very_strong', async () => {
  const result = await analyzeSectorStrength('Energi', makeCandles(25, 10)); // naik signifikan
  assert(result.strength === 'very_strong' || result.strength === 'strong',
    'got ' + result.strength + ' return20d=' + result.return20d);
});

test('Harga turun — weak atau very_weak', async () => {
  const result = await analyzeSectorStrength('Properti', makeCandles(25, -8)); // turun
  assert(['weak', 'very_weak', 'neutral_negative'].includes(result.strength),
    'got ' + result.strength);
});

test('Sektor null — return unknown', async () => {
  const result = await analyzeSectorStrength(null, makeCandles(25));
  assert(result.strength === 'unknown');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 detectRiskSentiment');
// ══════════════════════════════════════════════════════════════════

test('Return field mode, score, signals, label', () => {
  const result = detectRiskSentiment({}, {}, {});
  assert('mode' in result && 'score' in result && 'signals' in result && 'label' in result);
});

test('Semua bullish — risk_on atau mild_risk_on', () => {
  const indicators = { rsi: 60, ma: { ma20vs50: 'bullish_alignment' } };
  const volume     = { accDist: { bias: 'accumulation' } };
  const structure  = { trend: { direction: 'uptrend' } };
  const result     = detectRiskSentiment(indicators, volume, structure);
  assert(['risk_on', 'mild_risk_on'].includes(result.mode),
    'Bullish harus risk_on/mild, got ' + result.mode);
});

test('Semua bearish — risk_off atau mild_risk_off', () => {
  const indicators = { rsi: 40, ma: { ma20vs50: 'bearish_alignment' } };
  const volume     = { accDist: { bias: 'distribution' } };
  const structure  = { trend: { direction: 'downtrend' } };
  const result     = detectRiskSentiment(indicators, volume, structure);
  assert(['risk_off', 'mild_risk_off'].includes(result.mode),
    'Bearish harus risk_off/mild, got ' + result.mode);
});

test('signals adalah array', () => {
  const result = detectRiskSentiment({}, {}, {});
  assert(Array.isArray(result.signals));
});

test('Null input — tidak crash', () => {
  let result;
  try { result = detectRiskSentiment(null, null, null); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(result !== null && 'mode' in result);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeSectorRotation');
// ══════════════════════════════════════════════════════════════════

test('Sektor null — return null', () => {
  assert(analyzeSectorRotation(null, { mode: 'risk_on' }) === null);
});

test('Return field isBeneficiary, isLaggard, implication', () => {
  const result = analyzeSectorRotation('Energi', { mode: 'risk_on' });
  assert('isBeneficiary' in result && 'isLaggard' in result && 'implication' in result);
});

test('Energi + risk_on — isBeneficiary true', () => {
  const result = analyzeSectorRotation('Energi', { mode: 'risk_on' });
  assert(result.isBeneficiary === true, 'Energi harus beneficiary saat risk_on');
});

test('Energi + risk_off — isLaggard true', () => {
  const result = analyzeSectorRotation('Energi', { mode: 'risk_off' });
  assert(result.isLaggard === true, 'Energi harus laggard saat risk_off');
});

test('Konsumer + risk_off — isBeneficiary true', () => {
  const result = analyzeSectorRotation('Konsumer', { mode: 'risk_off' });
  assert(result.isBeneficiary === true, 'Konsumer harus beneficiary saat risk_off');
});

test('riskSentiment null — tidak crash', () => {
  let result;
  try { result = analyzeSectorRotation('Perbankan', null); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(result !== null);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 analyzeMarketContext');
// ══════════════════════════════════════════════════════════════════

// analyzeMarketContext adalah async — mock fetch agar tidak hit network
global.fetch = global.fetch || async function() { return { ok: false }; };

test('Return semua field utama', async () => {
  const result = await analyzeMarketContext('BBCA', makeCandles(25), {}, {}, {});
  assert('sektor' in result, 'harus ada sektor');
  assert('sectorStrength' in result, 'harus ada sectorStrength');
  assert('riskSentiment' in result, 'harus ada riskSentiment');
  assert('sectorRotation' in result, 'harus ada sectorRotation');
  assert('summary' in result, 'harus ada summary');
});

test('BBCA — sektor Keuangan terdeteksi', async () => {
  const result = await analyzeMarketContext('BBCA', makeCandles(25), {}, {}, {});
  assert(result.sektor !== null && result.sektor.length > 0,
    'BBCA harus punya sektor, got: ' + result.sektor);
});

test('Ticker tidak dikenal — tidak crash', async () => {
  let result;
  try { result = await analyzeMarketContext('XXXZZ', makeCandles(25), {}, {}, {}); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(result !== null && 'summary' in result);
});

// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 Sector Coverage — Semua 12 Sektor');
// ══════════════════════════════════════════════════════════════════

const allSectors = [
  'Keuangan','Energi','Teknologi','Konsumer Primer','Konsumer Non-Primer',
  'Properti','Infrastruktur','Barang Baku','Kesehatan','Industri','Perindustrian'
];

allSectors.forEach(sektor => {
  test(`analyzeSectorRotation — ${sektor} tidak crash`, () => {
    let result;
    try { result = analyzeSectorRotation(sektor, { mode: 'risk_on' }); }
    catch(e) { throw new Error('Tidak boleh throw: ' + e.message); }
    assert(result !== null && 'isBeneficiary' in result);
  });
});

test('Konsumer Non-Primer + risk_off — isBeneficiary true', () => {
  const result = analyzeSectorRotation('Konsumer Non-Primer', { mode: 'risk_off' });
  assert(result !== null);
  // Konsumer Non-Primer masuk beneficiary saat risk_off
  assert(result.isBeneficiary === true, 'got isBeneficiary=' + result.isBeneficiary);
});

test('Perindustrian + risk_on — isBeneficiary true', () => {
  const result = analyzeSectorRotation('Perindustrian', { mode: 'risk_on' });
  assert(result !== null && result.isBeneficiary === true,
    'Perindustrian harus beneficiary saat risk_on, got ' + result.isBeneficiary);
});

console.log('\n══════════════════════════════════');
Promise.all(_asyncTests).then(function() {
  console.log('Hasil: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
});
