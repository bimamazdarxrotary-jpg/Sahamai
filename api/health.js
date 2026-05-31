// ══════════════════════════════════════════════════════════════════
// api/health.js — Health Check Endpoint
// GET /api/health — untuk monitoring uptime & dependency status
// ══════════════════════════════════════════════════════════════════

const { cacheGet, cacheSet } = require('../lib/cache');
const pkg = require('../package.json');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

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
