// ══════════════════════════════════════════════════════════════════
// server.js — Local Development Server
// Jalankan: node server.js atau npm run dev
// ══════════════════════════════════════════════════════════════════

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

// Load env dari .env kalau ada
try {
  const env = fs.readFileSync('.env', 'utf8');
  env.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
  console.log('[ENV] .env loaded');
} catch (e) {
  console.log('[ENV] No .env file found, using system env');
}

// Validasi env
if (!process.env.GROQ_API_KEY) {
  console.warn('[WARN] GROQ_API_KEY tidak diset — AI tidak akan jalan');
}

const PORT = process.env.PORT || 3000;

// MIME types
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml'
};

// API handlers
const handlers = {
  '/api/analyze': require('./api/analyze'),
  '/api/scanner': require('./api/scanner')
};

// Parse body helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

// Mock res object (mirip Express/Vercel)
function mockRes(res) {
  const headers = {};
  return {
    statusCode: 200,
    setHeader: (k, v) => { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) {
      res.writeHead(this.statusCode, {
        'Content-Type': 'application/json',
        ...headers
      });
      res.end(JSON.stringify(data));
    },
    end() { res.writeHead(this.statusCode, headers); res.end(); }
  };
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // API routes
  const handler = handlers[pathname];
  if (handler) {
    try {
      const body    = await parseBody(req);
      const mockReq = {
        method:  req.method,
        headers: req.headers,
        body,
        query:   parsed.query
      };
      await handler(mockReq, mockRes(res));
    } catch (err) {
      console.error('[API ERROR]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static files dari public/
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, 'public', filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // Fallback ke index.html untuk SPA
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); return res.end('Not Found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      });
      return;
    }
    const ext  = path.extname(fullPath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 SahamAI Dev Server running at http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/analyze`);
  console.log(`   Scanner: http://localhost:${PORT}/api/scanner`);
  console.log(`\n   Press Ctrl+C to stop\n`);
});
