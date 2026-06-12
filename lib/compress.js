// ══════════════════════════════════════════════════════════════════
// lib/compress.js — Gzip compression middleware untuk API responses
// Node 18+ punya built-in zlib — tidak perlu dependency tambahan
// ══════════════════════════════════════════════════════════════════

const zlib = require('zlib');

/**
 * Wrap res.json() dengan gzip compression jika client support
 * Dipanggil di awal setiap handler: applyCompression(req, res)
 */
function applyCompression(req, res) {
  const acceptEncoding = (req.headers && req.headers['accept-encoding']) || '';
  if (!acceptEncoding.includes('gzip')) return; // client tidak support, skip

  const originalJson = res.json.bind(res);

  res.json = function(data) {
    try {
      const json   = JSON.stringify(data);
      const buffer = Buffer.from(json, 'utf8');

      // Hanya compress jika response > 1KB (overhead tidak worth it untuk yang kecil)
      if (buffer.length < 1024) {
        return originalJson(data);
      }

      zlib.gzip(buffer, { level: 6 }, function(err, compressed) {
        if (err) {
          return originalJson(data); // fallback ke uncompressed
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', compressed.length);
        res.status(200).end(compressed);
      });
    } catch (e) {
      return originalJson(data); // fallback
    }
  };
}

module.exports = { applyCompression };
