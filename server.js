// ══════════════════════════════════════════════════════════════════
// server.js — Local Development Server
// Jalankan: node server.js atau npm run dev
// ══════════════════════════════════════════════════════════════════

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

// Load .env
try {
  const env = fs.readFileSync('.env', 'utf8');
  env.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, ''); // strip quotes
    if (key && !process.env[key]) process.env[key] = val; // jangan override env yg sudah ada
  });
  console.log('[ENV] .env loaded');
} catch (e) {
  console.log('[ENV] No .env file found, using system env');
}

if (!process.env.GROQ_API_KEY) {
  console.warn('[WARN] GROQ_API_KEY tidak diset — AI tidak akan jalan');
}

const PORT = parseInt(process.env.PORT || '3000', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.woff': 'font/woff'
};

// API handlers — lazy load agar error 1 handler tidak crash server
function loadHandler(filePath) {
  try { return require(filePath); }
  catch (e) { return null; }
}

const ROUTES = {
  '/api/analyze': './api/analyze',
  '/api/scanner': './api/scanner',
  '/api/health':  './api/health'
};

// Parse body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

// Mock Vercel res — support json, status, setHeader, end
function mockRes(res) {
  let _status = 200;
  const _headers = { 'Access-Control-Allow-Origin': '*' };
  return {
    setHeader(k, v) { _headers[k] = v; return this; },
    status(code) { _status = code; return this; },
    json(data) {
      const body = JSON.stringify(data);
      res.writeHead(_status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ..._headers });
      res.end(body);
    },
    end() { res.writeHead(_status, _headers); res.end(); }
  };
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/$/, '') || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400'
    });
    return res.end();
  }

  // API routes
  const routePath = ROUTES[pathname];
  if (routePath) {
    const handler = loadHandler(routePath);
    if (!handler) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Handler gagal dimuat: ' + routePath }));
    }
    try {
      const body   = await parseBody(req);
      const mockReq = { method: req.method, headers: req.headers, body, query: parsed.query, url: req.url };
      await handler(mockReq, mockRes(res));
    } catch (err) {
      console.error('[API ERROR]', pathname, err.message);
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // Static files dari public/
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, 'public', filePath);

  // Security: cegah path traversal
  const publicDir = path.join(__dirname, 'public');
  if (!fullPath.startsWith(publicDir)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // SPA fallback ke index.html
      fs.readFile(path.join(publicDir, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); return res.end('Not Found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }
    const ext  = path.extname(fullPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    // Cache static assets 1 jam
    const isStatic = ['.js','.css','.png','.ico','.svg','.woff2','.woff'].includes(ext);
    res.writeHead(200, {
      'Content-Type':  mime,
      'Cache-Control': isStatic ? 'public, max-age=3600' : 'no-cache'
    });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} sudah dipakai. Coba PORT=${PORT+1} node server.js`);
  } else {
    console.error('[ERROR] Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n🚀 SahamAI Dev Server — http://localhost:${PORT}`);
  console.log(`   API Analyze : http://localhost:${PORT}/api/analyze`);
  console.log(`   API Scanner : http://localhost:${PORT}/api/scanner`);
  console.log(`   API Health  : http://localhost:${PORT}/api/health`);
  console.log(`\n   Press Ctrl+C to stop\n`);
});
