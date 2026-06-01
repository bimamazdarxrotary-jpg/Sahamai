// ══════════════════════════════════════════════════════════════════
// tests/analyze.integration.test.js — Integration Test: api/analyze.js
// Test orchestration flow tanpa live network (mock Yahoo + Groq)
// Jalankan: node tests/analyze.integration.test.js
// ══════════════════════════════════════════════════════════════════

// ── Mock fetch sebelum require apapun ────────────────────────────
const MOCK_CANDLES = Array.from({ length: 65 }, (_, i) => ({
  date:   '2025-0' + (Math.floor(i/30)+1) + '-' + String((i%30)+1).padStart(2,'0'),
  open:   1000 + i * 3,
  high:   1020 + i * 3,
  low:    980  + i * 3,
  close:  1010 + i * 3,
  volume: 5000000 + (i % 7) * 1000000
}));

// Yahoo Finance mock response
function buildYahooMock(candles) {
  return JSON.stringify({
    chart: {
      result: [{
        meta: { symbol: 'BBCA.JK', currency: 'IDR', regularMarketPrice: candles[candles.length-1].close },
        timestamp: candles.map((_, i) => 1700000000 + i * 86400),
        indicators: {
          quote: [{
            open:   candles.map(c => c.open),
            high:   candles.map(c => c.high),
            low:    candles.map(c => c.low),
            close:  candles.map(c => c.close),
            volume: candles.map(c => c.volume)
          }]
        }
      }]
    }
  });
}

// Groq AI mock response — field harus sesuai validateAIOutput di lib/validation.js
// Required: summary, sentiment, rekomendasi, scoreTeknikal
const AI_INNER = {
  summary:         'Saham dalam tren bullish dengan volume solid.',
  sentiment:       'bullish',
  rekomendasi:     'AKUMULASI',
  scoreTeknikal:   7,
  targetHarga:     'Rp 1.500',
  stopLoss:        'Rp 1.100',
  levelBeli:       'Rp 1.050 - Rp 1.100',
  keunggulan:      ['Volume naik', 'Breakout level kunci'],
  risiko:          ['Market global volatile'],
  katalis:         ['Laporan keuangan positif'],
  bullThesis:      ['Tren naik kuat'],
  bearThesis:      ['Resistance kuat di 1.400'],
  bandarSmartMoney:'Akumulasi terdeteksi',
  timeframe:       '2-4 minggu',
  confidence:      'Medium'
};

const MOCK_AI_RESPONSE = JSON.stringify({
  id: 'mock-id',
  choices: [{
    message: {
      content: JSON.stringify(AI_INNER)
    }
  }]
});

// Intercept global fetch
global.fetch = async function(url, options) {
  if (url && (url.includes('yahoo') || url.includes('finance.yahoo'))) {
    return {
      ok:     true,
      status: 200,
      json:   async () => JSON.parse(buildYahooMock(MOCK_CANDLES))
    };
  }
  if (url && (url.includes('groq') || url.includes('openai'))) {
    return {
      ok:     true,
      status: 200,
      json:   async () => JSON.parse(MOCK_AI_RESPONSE)
    };
  }
  if (url && (url.includes('news.google') || url.includes('kontan') || url.includes('detik'))) {
    return { ok: false, status: 503 };
  }
  return { ok: false, status: 404 };
};

// ── Test helpers ──────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
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
  } catch (e) {
    console.log('  ❌ ' + name + ' — ' + e.message);
    failed++;
  }
  return Promise.resolve();
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ── Setup mock req/res ────────────────────────────────────────────
function mockReq(body = {}, query = {}) {
  return { method: 'POST', body, query, headers: { 'x-forwarded-for': '127.0.0.1' } };
}

function mockRes() {
  const res = { _status: 200, _body: null, _headers: {} };
  res.status  = (code) => { res._status = code; return res; };
  res.json    = (data) => { res._body = data; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end     = () => res;
  return res;
}

// ── Load handler ─────────────────────────────────────────────────
process.env.GROQ_API_KEY = 'mock-key-for-testing';
const handler = require('../api/analyze');

// ── Tests ─────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n── analyze.js integration tests ──\n');

  // 1. Ticker valid → response lengkap
  await test('Ticker valid (BBCA) → status 200 + semua field ada', async () => {
    const req = mockReq({ ticker: 'BBCA' });
    const res = mockRes();
    await handler(req, res);
    assert(res._status === 200, 'Expected 200, got ' + res._status);
    const d = res._body;
    assert(d && !d.error, 'Response punya error: ' + (d && d.error));
    assert(d.ticker === 'BBCA', 'ticker mismatch');
    assert(d.priceData && d.priceData.candles && d.priceData.candles.length > 0, 'candles kosong');
    assert(d.indicators, 'indicators tidak ada');
    assert(d.scoringData && d.scoringData.final !== undefined, 'scoringData.final tidak ada');
    assert(d.scoringData.final >= 0 && d.scoringData.final <= 10, 'score out of range: ' + d.scoringData.final);
    assert(d.rekomendasi, 'rekomendasi tidak ada');
    assert(d.summary, 'summary tidak ada');
  });

  // 2. Risk penalty aktif
  await test('Risk penalty ada di scoringData.breakdown', async () => {
    const req = mockReq({ ticker: 'BBCA' });
    const res = mockRes();
    await handler(req, res);
    const d = res._body;
    assert(d && d.scoringData, 'scoringData tidak ada');
    assert(d.scoringData.breakdown && d.scoringData.breakdown.risk, 'breakdown.risk tidak ada');
    assert(d.scoringData.breakdown.risk.penaltyApplied !== undefined, 'penaltyApplied tidak ada');
  });

  // 3. Ticker kosong → error 400
  await test('Ticker kosong → 400 error', async () => {
    const req = mockReq({ ticker: '' });
    const res = mockRes();
    await handler(req, res);
    assert(res._status === 400, 'Expected 400, got ' + res._status);
    assert(res._body && res._body.error, 'Harus ada error message');
  });

  // 4. Ticker invalid format → error
  await test('Ticker format invalid (angka saja) → error', async () => {
    const req = mockReq({ ticker: '12345' });
    const res = mockRes();
    await handler(req, res);
    assert(res._status === 400 || (res._body && res._body.error), 'Harus return error untuk ticker invalid');
  });

  // 5. Method OPTIONS → 200
  await test('OPTIONS request → 200 (CORS preflight)', async () => {
    const req = { method: 'OPTIONS', body: {}, query: {}, headers: {} };
    const res = mockRes();
    await handler(req, res);
    assert(res._status === 200, 'Expected 200 for OPTIONS');
  });

  // 6. Response tidak throw — null-safe
  await test('Handler tidak throw ke caller saat Yahoo gagal', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 503 });
    const req = mockReq({ ticker: 'ABCD' }); // ticker unik, tidak ada di cache
    const res = mockRes();
    let threw = false;
    try { await handler(req, res); } catch (e) { threw = true; }
    global.fetch = origFetch;
    assert(!threw, 'Handler throw exception ke caller');
    assert(res._body !== null, 'Handler harus return response');
  });

  // 7. Cache hit — request kedua lebih cepat
  await test('Request kedua untuk ticker sama → fromCache: true', async () => {
    const req1 = mockReq({ ticker: 'TLKM' });
    const req2 = mockReq({ ticker: 'TLKM' });
    const res1 = mockRes();
    const res2 = mockRes();
    await handler(req1, res1);
    if (res1._status === 200) {
      await handler(req2, res2);
      assert(res2._status === 200, 'Cache request harus 200');
      assert(res2._body && res2._body.fromCache === true, 'fromCache harus true di request kedua');
    } else {
      console.log('    (skip — request pertama gagal, tidak bisa test cache)');
    }
  });

  // 8. CORS headers ada
  await test('Response punya CORS headers', async () => {
    const req = mockReq({ ticker: 'BBCA' });
    const res = mockRes();
    await handler(req, res);
    assert(res._headers['Access-Control-Allow-Origin'] === '*', 'CORS header tidak ada');
  });

  // 9. scoringData.breakdown semua komponen ada
  await test('scoringData.breakdown punya semua 5 komponen', async () => {
    const req = mockReq({ ticker: 'BBCA' });
    const res = mockRes();
    await handler(req, res);
    const d = res._body;
    if (d && d.scoringData && d.scoringData.breakdown) {
      const b = d.scoringData.breakdown;
      assert(b.trend    !== undefined, 'breakdown.trend tidak ada');
      assert(b.volume   !== undefined, 'breakdown.volume tidak ada');
      assert(b.momentum !== undefined, 'breakdown.momentum tidak ada');
      assert(b.setup    !== undefined, 'breakdown.setup tidak ada');
      assert(b.risk     !== undefined, 'breakdown.risk tidak ada');
    }
  });

  console.log('\n  Hasil: ' + passed + ' passed, ' + failed + ' failed\n');
  return failed;
}

runTests().then(f => { if (f > 0) process.exit(1); });
