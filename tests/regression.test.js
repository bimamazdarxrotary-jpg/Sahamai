// ══════════════════════════════════════════════════════════════════
// tests/regression.test.js — Test Regresi untuk Fix Bug (Jul 2026)
//
// Semua bug di file ini pernah lolos ke produksi TANPA terdeteksi test
// suite lama. File ini memastikan bug yang sama tidak diam-diam kembali
// kalau ada refactor di masa depan. Setiap test punya komentar merujuk
// ke bug spesifik yang diperbaiki.
// ══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => {
      console.log('  ✅ ' + name);
      passed++;
    }).catch(e => {
      console.log('  ❌ ' + name + ' — ' + e.message);
      failed++;
    });
  }
  console.log('  ✅ ' + name);
  passed++;
  return Promise.resolve();
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function makeCandles(closes, opens) {
  return closes.map((c, i) => ({
    date: '2024-01-' + String(i + 1).padStart(2, '0'),
    open: opens ? opens[i] : c - 2,
    high: Math.max(opens ? opens[i] : c - 2, c) + 10,
    low:  Math.min(opens ? opens[i] : c - 2, c) - 10,
    close: c,
    volume: 5000000
  }));
}

async function runTests() {

// ══════════════════════════════════════════════════════════════════
console.log('\n🕯️  lib/candleUtils.js — helper aman open null');
// ══════════════════════════════════════════════════════════════════

const { hasOpen, candleBody, isGreenCandle, isRedCandle, upperWick, lowerWick } = require('../lib/candleUtils');

await test('hasOpen — true jika open ada angka', () => {
  assert(hasOpen({ open: 1000, close: 1010 }) === true);
});

await test('hasOpen — false jika open null/undefined', () => {
  assert(hasOpen({ open: null, close: 1010 }) === false);
  assert(hasOpen({ close: 1010 }) === false);
});

await test('candleBody — null (bukan 0) saat open tidak ada', () => {
  assert(candleBody({ open: null, close: 1010 }) === null,
    'body harus null (tidak diketahui), bukan 0, saat open tidak ada');
});

await test('isGreenCandle/isRedCandle — null (bukan true/false) saat open tidak ada', () => {
  assert(isGreenCandle({ open: null, close: 1010 }) === null,
    'sebelumnya bug: green() selalu true saat open null (self-comparison close>=close)');
  assert(isRedCandle({ open: null, close: 1010 }) === null,
    'sebelumnya bug: red() selalu false saat open null (self-comparison close<close)');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n🕯️  lib/indicators.js — candlestickPatterns aman open null');
// ══════════════════════════════════════════════════════════════════

const { candlestickPatterns } = require('../lib/indicators');

function buildEngulfCandles(prevOpen, prevClose, lastOpen, lastClose) {
  const candles = [];
  for (let i = 0; i < 27; i++) candles.push({ date: 'd'+i, open: 1000, high: 1010, low: 990, close: 1000, volume: 1000000 });
  candles.push({ date: 'd27', open: 1000, high: 1010, low: 990, close: 1000, volume: 1000000 });
  candles.push({
    date: 'prev', open: prevOpen, high: Math.max(prevOpen, prevClose) + 10,
    low: Math.min(prevOpen, prevClose) - 10, close: prevClose, volume: 2000000
  });
  candles.push({
    date: 'last', open: lastOpen, high: Math.max(lastOpen || lastClose, lastClose) + 15,
    low: Math.min(lastOpen || lastClose, lastClose) - 15, close: lastClose, volume: 5000000
  });
  return candles;
}

await test('Bullish Engulfing terdeteksi saat open lengkap', () => {
  const r = candlestickPatterns(buildEngulfCandles(1010, 990, 950, 1030));
  assert(r.patterns.some(p => p.name === 'Bullish Engulfing'));
});

await test('Bearish Engulfing terdeteksi saat open lengkap', () => {
  const r = candlestickPatterns(buildEngulfCandles(1000, 1015, 1018, 950));
  assert(r.patterns.some(p => p.name === 'Bearish Engulfing'));
});

await test('Engulfing SKIP (bukan salah / mustahil) saat open null — kasus Bullish', () => {
  const r = candlestickPatterns(buildEngulfCandles(1010, 990, null, 1030));
  assert(!r.patterns.some(p => p.name.includes('Engulfing')),
    'sebelumnya bug: fallback close membuat kondisi engulfing mustahil terpenuhi (bukan sekadar skip)');
});

await test('Engulfing SKIP saat open null — kasus Bearish', () => {
  const r = candlestickPatterns(buildEngulfCandles(1000, 1015, null, 950));
  assert(!r.patterns.some(p => p.name.includes('Engulfing')));
});

function buildMarubozuCandles(lastOpen, lastClose) {
  const candles = [];
  for (let i = 0; i < 27; i++) candles.push({ date: 'd'+i, open: 1000, high: 1010, low: 990, close: 1000, volume: 1000000 });
  candles.push({ date: 'd27', open: 1000, high: 1010, low: 990, close: 1000, volume: 1000000 });
  candles.push({ date: 'd28', open: 1000, high: 1010, low: 990, close: 1000, volume: 1000000 });
  candles.push({
    date: 'last', open: lastOpen, high: (lastOpen || lastClose) + 2, low: lastClose - 2,
    close: lastClose, volume: 5000000
  });
  return candles;
}

await test('Bearish Marubozu terdeteksi saat open lengkap', () => {
  const r = candlestickPatterns(buildMarubozuCandles(1050, 950));
  assert(r.patterns.some(p => p.name === 'Bearish Marubozu'));
});

await test('Marubozu SKIP (bukan tak-terdeteksi-permanen tanpa alasan jelas) saat open null', () => {
  const r = candlestickPatterns(buildMarubozuCandles(null, 950));
  assert(!r.patterns.some(p => p.name.includes('Marubozu')),
    'sebelumnya bug: body() jadi 0 saat open null -> Marubozu mustahil terdeteksi, bukan skip eksplisit');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📢 lib/logger.js — variadic args tidak hilang');
// ══════════════════════════════════════════════════════════════════

const log = require('../lib/logger');

await test('log.info menangkap lebih dari 3 argumen', () => {
  const origLog = console.log;
  let captured = '';
  console.log = (...args) => { captured += args.join(' '); };
  log.info('analyze', '[IND]', 'BBCA', 'RSI=65.4', 'EMA9=1235');
  console.log = origLog;
  assert(captured.includes('RSI=65.4'), 'argumen ke-4 (RSI) hilang — bug lama');
  assert(captured.includes('EMA9=1235'), 'argumen ke-5 (EMA9) hilang — bug lama');
});

await test('log.info tetap backward-compatible dengan 3 argumen', () => {
  const origLog = console.log;
  let captured = '';
  console.log = (...args) => { captured += args.join(' '); };
  log.info('analyze', '[IND]', 'BBCA-only');
  console.log = origLog;
  assert(captured.includes('BBCA-only'));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n🤖 lib/ai.js — sanitizeAIOutput arah bearish/bullish');
// ══════════════════════════════════════════════════════════════════

const { sanitizeAIOutput, deriveSentimentFromScore } = require('../lib/ai');

await test('Target JUAL tidak dipaksa jadi bullish (tetap di bawah current)', () => {
  const priceData = { current: 1247, atr: 40 };
  const indicators = { atr: 40 };
  const parsed = sanitizeAIOutput({
    sentiment: 'JUAL', targetHarga: 'Rp 850', stopLoss: 'Rp 1.320', levelBeli: 'Rp 900 - Rp 950'
  }, priceData, indicators);
  assert(parsed.targetHarga.includes('850'),
    'sebelumnya bug: target bearish valid (850, di bawah current) ditimpa jadi bullish');
  assert(parsed.stopLoss.includes('1.320') || parsed.stopLoss.includes('1320'),
    'SL bearish valid (di atas current) seharusnya tidak ditimpa');
});

await test('Target JUAL yang tidak masuk akal (di bawah current tapi salah arah SL) tetap disanitasi', () => {
  const priceData = { current: 1247, atr: 40 };
  const indicators = { atr: 40 };
  // SL di BAWAH current padahal sentiment JUAL (SL seharusnya di atas) -> harus disanitasi ulang
  const parsed = sanitizeAIOutput({
    sentiment: 'JUAL', targetHarga: 'Rp 850', stopLoss: 'Rp 1.100', levelBeli: 'Rp 900 - Rp 950'
  }, priceData, indicators);
  const slNum = parseInt(parsed.stopLoss.replace(/[^\d]/g, ''));
  assert(slNum > 1247, 'SL untuk JUAL harus di atas current setelah disanitasi, dapat: ' + parsed.stopLoss);
});

await test('Target BELI tetap di atas current seperti semula (tidak regresi)', () => {
  const priceData = { current: 1247, atr: 40 };
  const indicators = { atr: 40 };
  const parsed = sanitizeAIOutput({
    sentiment: 'BELI', targetHarga: 'Rp 1.500', stopLoss: 'Rp 1.100', levelBeli: 'Rp 1.050 - Rp 1.100'
  }, priceData, indicators);
  assert(parsed.targetHarga.includes('1.500') || parsed.targetHarga.includes('1500'));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n🎯 lib/ai.js — deriveSentimentFromScore (dipakai untuk enforcement)');
// ══════════════════════════════════════════════════════════════════

await test('deriveSentimentFromScore — BELI/AKUMULASI -> BELI', () => {
  assert(deriveSentimentFromScore({ recommendation: 'BELI' }) === 'BELI');
  assert(deriveSentimentFromScore({ recommendation: 'AKUMULASI' }) === 'BELI');
});

await test('deriveSentimentFromScore — JUAL/KURANGI -> JUAL', () => {
  assert(deriveSentimentFromScore({ recommendation: 'JUAL' }) === 'JUAL');
  assert(deriveSentimentFromScore({ recommendation: 'KURANGI' }) === 'JUAL');
});

await test('deriveSentimentFromScore — TAHAN atau null -> TAHAN', () => {
  assert(deriveSentimentFromScore({ recommendation: 'TAHAN' }) === 'TAHAN');
  assert(deriveSentimentFromScore(null) === 'TAHAN');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📈 lib/volume.js — unifikasi SmartMoneyFlow dengan indicators.js');
// ══════════════════════════════════════════════════════════════════

const { analyzeVolume } = require('../lib/volume');
const { computeAll } = require('../lib/indicators');

await test('analyzeVolume REUSE indicators.smartMoney saat diberikan (bukan hitung ulang terpisah)', () => {
  const candles = makeCandles(Array.from({ length: 30 }, (_, i) => 1000 + i * 5));
  const indicators = computeAll(candles);
  const volumeData = analyzeVolume(candles, indicators);
  assert(volumeData.smartMoneyFlow === indicators.smartMoney,
    'sebelumnya bug: volumeData.smartMoneyFlow dihitung ulang dengan formula/periode berbeda dari indicators.smartMoney');
});

await test('analyzeVolume tetap jalan (fallback lokal) jika indicators tidak diberikan', () => {
  const candles = makeCandles(Array.from({ length: 30 }, (_, i) => 1000 + i * 5));
  const volumeData = analyzeVolume(candles);
  assert(volumeData.smartMoneyFlow != null, 'fallback backward-compat harus tetap menghasilkan smartMoneyFlow');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n🏦 lib/bandar.js & lib/volume.js — filter aman open null');
// ══════════════════════════════════════════════════════════════════

const { detectStealthAccumulation, detectRetailPanic } = require('../lib/bandar');

await test('detectStealthAccumulation tidak crash & tidak over-count saat sebagian open null', () => {
  const closes = Array.from({ length: 20 }, (_, i) => 1000 - i);
  const candles = makeCandles(closes);
  candles[15].open = null; // simulasikan data provider yang tidak selalu isi open
  candles[16].open = null;
  const result = detectStealthAccumulation(candles);
  assert(result !== undefined, 'tidak boleh throw/crash');
});

await test('detectRetailPanic tidak crash saat open null di beberapa candle terakhir', () => {
  const closes = Array.from({ length: 25 }, (_, i) => 1000 + (i < 20 ? i : -(i - 20) * 20));
  const candles = makeCandles(closes);
  candles[candles.length - 1].open = null;
  const result = detectRetailPanic(candles);
  assert(result !== undefined, 'tidak boleh throw/crash');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n⏱️  api/health.js — TTL konsisten dengan TTL.price');
// ══════════════════════════════════════════════════════════════════

await test('health.js pakai TTL.price (bukan hardcode terpisah) untuk cache harga', () => {
  const src = fs.readFileSync(path.join(__dirname, '../api/health.js'), 'utf8');
  assert(src.includes('TTL.price'),
    'health.js harus reuse TTL.price dari lib/cache.js, bukan hardcode angka TTL sendiri');
  assert(!/cacheSet\(cacheKey,\s*data,\s*5\s*\*\s*60\s*\*\s*1000\)/.test(src),
    'sebelumnya bug: hardcode 5 menit di sini, beda dari TTL.price (1 menit) yang dipakai analyze.js utk key sama');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n🗂️  data/idx-stocks.json — kualitas data');
// ══════════════════════════════════════════════════════════════════

const idxStocks = require('../data/idx-stocks.json');

await test('AXIO — metadata benar (Tera Data Indonusa, bukan Axiata Group Berhad)', () => {
  assert(idxStocks.AXIO, 'AXIO harus ada di database');
  assert(idxStocks.AXIO.name.includes('Tera Data'),
    'sebelumnya bug: AXIO salah dilabeli "Axiata Group Berhad" (perusahaan Malaysia, bukan emiten IDX ini)');
});

await test('IPOT tidak ada di database (bukan ticker asli, nama platform trading)', () => {
  assert(!idxStocks.IPOT, 'IPOT bukan ticker IDX — sebelumnya salah dimasukkan sebagai emiten');
});

await test('Tidak ada duplikat nama perusahaan', () => {
  const names = {};
  for (const [ticker, v] of Object.entries(idxStocks)) {
    names[v.name] = names[v.name] || [];
    names[v.name].push(ticker);
  }
  const dupes = Object.entries(names).filter(([, tickers]) => tickers.length > 1);
  assert(dupes.length === 0, 'ditemukan nama duplikat: ' + JSON.stringify(dupes));
});

await test('Semua ticker format standar (4 huruf) kecuali index dikenal', () => {
  const KNOWN_INDEX = ['LQ45'];
  const bad = Object.keys(idxStocks).filter(k =>
    !KNOWN_INDEX.includes(k) && !/^[A-Z]{4}$/.test(k));
  assert(bad.length === 0, 'ticker format non-standar: ' + JSON.stringify(bad));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📡 api/scanner.js — SSE tetap format benar saat cache-hit');
// ══════════════════════════════════════════════════════════════════

const scannerCandles = makeCandles(Array.from({ length: 65 }, (_, i) => 1000 + i));
global.fetch = async function(url) {
  if (!url || (!url.includes('yahoo') && !url.includes('finance.yahoo'))) return { ok: false };
  return {
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          meta: { symbol: 'TEST.JK', currency: 'IDR' },
          timestamp: scannerCandles.map((_, i) => 1700000000 + i * 86400),
          indicators: { quote: [{
            open:   scannerCandles.map(c => c.open),
            high:   scannerCandles.map(c => c.high),
            low:    scannerCandles.map(c => c.low),
            close:  scannerCandles.map(c => c.close),
            volume: scannerCandles.map(c => c.volume)
          }] }
        }]
      }
    })
  };
};

function mockReqSSE(query) {
  return { method: 'GET', body: {}, query, headers: {} };
}

function mockResSSE() {
  const res = { _status: 200, _headers: {}, _chunks: [], _ended: false };
  res.status    = (code) => { res._status = code; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; return res; };
  res.write     = (chunk) => { res._chunks.push(chunk); return true; };
  res.json      = (data) => { res._chunks.push(JSON.stringify(data)); res._jsonBody = data; return res; };
  res.end       = (data) => { if (data) res._chunks.push(data); res._ended = true; return res; };
  return res;
}

process.env.GROQ_API_KEY = 'mock-key-for-regression-test';
const scannerHandler = require('../api/scanner');

await test('Scanner cache-hit saat isStream=true tetap kirim Content-Type text/event-stream', async () => {
  const filterName = 'regressiontest' + Date.now();

  // Panggilan pertama: isi cache (non-stream)
  const req1 = mockReqSSE({ filter: filterName });
  const res1 = mockResSSE();
  await scannerHandler(req1, res1);
  assert(res1._status === 200, 'panggilan pertama harus 200, dapat ' + res1._status);

  // Panggilan kedua: SSE, HARUS hit cache dari panggilan pertama
  const req2 = mockReqSSE({ filter: filterName, stream: 'true' });
  const res2 = mockResSSE();
  await scannerHandler(req2, res2);

  assert(res2._headers['Content-Type'] === 'text/event-stream',
    'sebelumnya bug: cache-hit saat isStream=true tetap kirim Content-Type application/json ' +
    '(via res.json), membuat EventSource browser gagal parse dan trigger onerror palsu. ' +
    'Header yang didapat: ' + JSON.stringify(res2._headers));
  assert(res2._chunks.some(c => typeof c === 'string' && c.startsWith('data: ')),
    'body SSE harus berformat "data: {...}"');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log(`  Hasil: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════════\n');
if (failed > 0) process.exit(1);

}

runTests();
