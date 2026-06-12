// ══════════════════════════════════════════════════════════════════
// tests/scanner.integration.test.js — Integration Test: api/scanner.js
// Test scan flow, filter backend, universe coverage
// Jalankan: node tests/scanner.integration.test.js
// ══════════════════════════════════════════════════════════════════

// ── Mock candles factory ──────────────────────────────────────────
function buildCandles(basePrice, trend = 'up', n = 65) {
  return Array.from({ length: n }, (_, i) => {
    const delta = trend === 'up' ? i * 2 : trend === 'down' ? -i * 2 : 0;
    const close = basePrice + delta;
    return {
      date:   '2025-01-' + String(i + 1).padStart(2, '0'),
      open:   close - 5,
      high:   close + 15,
      low:    close - 15,
      close,
      volume: 8000000 + (i % 5) * 2000000
    };
  });
}

function buildYahooResponse(candles) {
  return {
    chart: {
      result: [{
        meta:      { symbol: 'TEST.JK', currency: 'IDR' },
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
  };
}

// ── Mock fetch — ticker ganjil bullish, genap bearish, sisanya null ──
let fetchCallCount = 0;
global.fetch = async function(url) {
  fetchCallCount++;
  if (!url.includes('yahoo') && !url.includes('finance.yahoo')) {
    return { ok: false };
  }
  // Simulasi ~80% saham berhasil fetch, 20% timeout/gagal
  if (fetchCallCount % 5 === 0) return { ok: false };

  const trend = fetchCallCount % 2 === 0 ? 'up' : 'neutral';
  const candles = buildCandles(1000, trend);
  return {
    ok:   true,
    json: async () => buildYahooResponse(candles)
  };
};

// ── Test helpers ──────────────────────────────────────────────────
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

function mockReq(body = {}, query = {}) {
  return { method: 'POST', body, query, headers: {} };
}

function mockRes() {
  const res = { _status: 200, _body: null, _headers: {} };
  res.status    = (code) => { res._status = code; return res; };
  res.json      = (data) => { res._body = data; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end       = () => res;
  return res;
}

process.env.GROQ_API_KEY = 'mock-key-for-testing';
const handler = require('../api/scanner');

// ── Tests ─────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n── scanner.js integration tests ──\n');

  // 1. Response struktur lengkap
  await test('Scan all → response punya semua field wajib', async () => {
    const req = mockReq({ filter: 'all' });
    const res = mockRes();
    await handler(req, res);
    assert(res._status === 200, 'Expected 200, got ' + res._status);
    const d = res._body;
    assert(d && !d.error, 'Ada error: ' + (d && d.error));
    assert(Array.isArray(d.results), 'results harus array');
    assert(typeof d.total       === 'number', 'total harus number');
    assert(typeof d.universe    === 'number', 'universe harus number');
    assert(typeof d.utamaCount  === 'number', 'utamaCount harus number');
    assert(typeof d.scannedAt   === 'string', 'scannedAt harus string');
    assert(typeof d.scanMs      === 'number', 'scanMs harus number');
  });

  // 2. Universe lebih dari 200
  await test('Universe mencakup lebih dari 200 saham (fix #7)', async () => {
    const req = mockReq({ filter: 'all' });
    const res = mockRes();
    await handler(req, res);
    const d = res._body;
    assert(d && d.universe > 200, 'Universe harus > 200, dapat: ' + (d && d.universe));
    assert(d.utamaCount >= 300, 'Utama harus >= 300, dapat: ' + (d && d.utamaCount));
  });

  // 3. Tiap result punya field yang dibutuhkan UI
  await test('Setiap result punya field lengkap untuk UI', async () => {
    const req = mockReq({ filter: 'all' });
    const res = mockRes();
    await handler(req, res);
    const d = res._body;
    if (d && d.results && d.results.length > 0) {
      const r = d.results[0];
      assert(r.ticker,         'ticker tidak ada');
      assert(r.name,           'name tidak ada');
      assert(r.sector,         'sector tidak ada');
      assert(r.board,          'board tidak ada'); // field baru di fix #7
      assert(r.lastClose > 0,  'lastClose tidak valid');
      assert(typeof r.changePct === 'number', 'changePct tidak ada');
      assert(typeof r.score === 'number',     'score tidak ada');
      assert(r.score >= 0 && r.score <= 10,   'score out of range: ' + r.score);
      assert(r.recommendation,  'recommendation tidak ada');
      assert(Array.isArray(r.signals), 'signals harus array');
    } else {
      console.log('    (skip — tidak ada hasil scan, mungkin semua mock gagal)');
    }
  });

  // 4. Results diurutkan by score descending
  await test('Results diurutkan score descending', async () => {
    const req = mockReq({ filter: 'all' });
    const res = mockRes();
    await handler(req, res);
    const d = res._body;
    if (d && d.results && d.results.length > 1) {
      for (let i = 0; i < d.results.length - 1; i++) {
        assert(d.results[i].score >= d.results[i+1].score,
          'Urutan score tidak descending di index ' + i);
      }
    }
  });

  // 5. Filter bullish — semua hasil score >= 6 atau rekomendasi BELI/AKUMULASI
  await test('Filter bullish → semua result score >= 6 atau BELI/AKUMULASI', async () => {
    // Reset cache dengan filter berbeda
    const req = mockReq({ filter: 'bullish' });
    const res = mockRes();
    await handler(req, res);
    const d = res._body;
    if (d && d.results && d.results.length > 0) {
      d.results.forEach((r, i) => {
        const ok = r.score >= 6 || r.recommendation === 'BELI' || r.recommendation === 'AKUMULASI';
        assert(ok, 'Result index ' + i + ' tidak memenuhi filter bullish: score=' + r.score + ' rec=' + r.recommendation);
      });
    }
  });

  // 6. Filter naik → semua changePct > 0
  await test('Filter naik → semua result isUp && changePct > 0', async () => {
    const req = mockReq({ filter: 'naik' });
    const res = mockRes();
    await handler(req, res);
    const d = res._body;
    if (d && d.results && d.results.length > 0) {
      d.results.forEach((r, i) => {
        assert(r.isUp && r.changePct > 0,
          'Result index ' + i + ' tidak naik: changePct=' + r.changePct);
      });
    }
  });

  // 7. Handler tidak throw saat semua fetch gagal
  await test('Handler tidak throw ke caller saat semua fetch gagal', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => { throw new Error('network error'); };
    const req = mockReq({ filter: 'all' });
    const res = mockRes();
    let threw = false;
    try { await handler(req, res); } catch (e) { threw = true; }
    global.fetch = origFetch;
    assert(!threw, 'Handler throw exception ke caller');
    assert(res._body !== null, 'Handler harus return response');
  });

  // 8. OPTIONS request → 200
  await test('OPTIONS request → 200 (CORS preflight)', async () => {
    const req = { method: 'OPTIONS', body: {}, query: {}, headers: {} };
    const res = mockRes();
    await handler(req, res);
    assert(res._status === 200, 'Expected 200 for OPTIONS');
  });

  // 9. CORS headers ada
  await test('Response punya CORS headers', async () => {
    const req = mockReq({ filter: 'all' });
    const res = mockRes();
    await handler(req, res);
    assert(res._headers['Access-Control-Allow-Origin'] === '*', 'CORS header tidak ada');
  });

  // 10. Cache hit pada request kedua filter sama
  await test('Request kedua filter sama → fromCache: true', async () => {
    const filter = 'all_cache_test_' + Date.now(); // unique filter agar tidak collision
    // Gunakan filter custom yang tidak dikenal — akan return all
    const req1 = mockReq({ filter });
    const req2 = mockReq({ filter });
    const res1 = mockRes();
    const res2 = mockRes();
    await handler(req1, res1);
    if (res1._status === 200) {
      await handler(req2, res2);
      assert(res2._body && res2._body.fromCache === true, 'fromCache harus true di request kedua');
    }
  });

  console.log('\n  Hasil: ' + passed + ' passed, ' + failed + ' failed\n');
  return failed;
}

runTests().then(f => { if (f > 0) process.exit(1); });
