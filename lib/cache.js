// ══════════════════════════════════════════════════════════════════
// lib/cache.js — In-Memory Cache
// ══════════════════════════════════════════════════════════════════

const store = new Map();

const TTL = {
  price:    60  * 1000,        // 1 menit
  analysis: 5   * 60 * 1000,  // 5 menit
  news:     15  * 60 * 1000,  // 15 menit — berita TTL sendiri
  metadata: 24  * 60 * 60 * 1000 // 24 jam
};

function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttlMs = TTL.analysis) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    createdAt: Date.now()
  });
}

function cacheDelete(key) {
  store.delete(key);
}

function cacheClean() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

function cacheTTLRemaining(key) {
  const entry = store.get(key);
  if (!entry) return 0;
  return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
}

// Bersihkan cache expired setiap 10 menit otomatis
// CATATAN: di Vercel serverless, setInterval hanya aktif selama instance hidup
// Cache otomatis hilang saat cold start — ini expected behavior
setInterval(cacheClean, 10 * 60 * 1000);

module.exports = { cacheGet, cacheSet, cacheDelete, cacheClean, cacheTTLRemaining, TTL };
