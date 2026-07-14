// ══════════════════════════════════════════════════════════════════
// api/health.js — Health Check Endpoint
// GET /api/health — untuk monitoring uptime & dependency status
// ══════════════════════════════════════════════════════════════════

const { cacheGet, cacheSet, TTL } = require('../lib/cache');
const { fetchPriceDataWithFallback } = require('../lib/datasource');
const pkg = require('../package.json');

// ── Prefetch saham populer di background saat cold start ──────────
// Tujuan: warming cache agar analisis pertama user tidak kena cold fetch
const POPULAR_PREFETCH = ['BBCA', 'TLKM', 'BBRI', 'BMRI', 'ASII', 'GOTO'];
let _prefetchDone = false;

function warmupCache() {
  if (_prefetchDone) return;
  _prefetchDone = true;
  // Fire and forget — tidak blocking health response
  setTimeout(async function() {
    for (const ticker of POPULAR_PREFETCH) {
      const cacheKey = 'price:' + ticker;
      if (cacheGet(cacheKey)) continue; // sudah ada di cache
      try {
        const data = await fetchPriceDataWithFallback(ticker, false);
        if (data) {
          // Bug fix: sebelumnya hardcode 5 menit di sini, padahal api/analyze.js
          // memakai TTL.price (1 menit) untuk key cache yang SAMA ('price:'+ticker).
          // Ini membuat saham hasil prefetch bisa dianggap "masih segar" hingga 4 menit
          // lebih lama dari kebijakan TTL.price yang sebenarnya. Sekarang disatukan.
          cacheSet(cacheKey, data, TTL.price);
          console.log('[PREFETCH] Cached', ticker, data.current);
        }
      } catch (e) {
        console.warn('[PREFETCH] Gagal untuk', ticker, e.message);
      }
    }
    console.log('[PREFETCH] Warmup selesai untuk', POPULAR_PREFETCH.length, 'saham');
  }, 100); // delay 100ms agar health response tidak terganggu
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  // Trigger warmup di background
  warmupCache();

  // Cache test
  const cacheOk = (() => {
    try {
      cacheSet('health:ping', 'ok', 5000);
      return cacheGet('health:ping') === 'ok';
    } catch (e) { return false; }
  })();

  // GROQ connectivity check — quick HEAD request, timeout 3s
  const groqKey = !!process.env.GROQ_API_KEY;
  let groqReach = 'skipped';
  if (groqKey) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch('https://api.groq.com', { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(timer);
      groqReach = r.ok || r.status < 500 ? 'reachable' : 'error';
    } catch (e) {
      groqReach = e.name === 'AbortError' ? 'timeout' : 'unreachable';
    }
  }

  const uptime = process.uptime();
  const status = {
    status:    'ok',
    version:   pkg.version,
    uptime:    Math.round(uptime) + 's',
    cache:     cacheOk ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
    prefetch:  _prefetchDone ? 'done' : 'pending',
    groq: {
      configured: groqKey,
      reachable:  groqReach
    },
    dependencies: {
      node: process.version,
    }
  };

  const httpStatus = !groqKey ? 503 : 200;
  return res.status(httpStatus).json(status);
};
