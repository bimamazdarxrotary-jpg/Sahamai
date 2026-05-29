// ══════════════════════════════════════════════════════════════════
// api/health.js — Health Check Endpoint
// GET /api/health — untuk monitoring uptime
// ══════════════════════════════════════════════════════════════════

const { cacheGet, cacheSet } = require('../lib/cache');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const uptime    = process.uptime();
  const cacheTest = (() => {
    try {
      cacheSet('health:ping', 'ok', 5000);
      return cacheGet('health:ping') === 'ok';
    } catch (e) {
      return false;
    }
  })();

  const status = {
    status:    'ok',
    version:   require('../package.json').version,
    uptime:    Math.round(uptime) + 's',
    cache:     cacheTest ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
    groq:      !!process.env.GROQ_API_KEY ? 'configured' : 'missing'
  };

  const httpStatus = status.groq === 'missing' ? 503 : 200;
  return res.status(httpStatus).json(status);
};
