// ══════════════════════════════════════════════════════════════════
// lib/cache.js — In-Memory Cache
// Vercel serverless: cache hidup selama instance hidup
// Cukup untuk 1–5 user aktif, tidak perlu Redis
// ══════════════════════════════════════════════════════════════════

const store = new Map();

const TTL = {
  price:    60  * 1000,   // 1 menit — harga berubah cepat
  analysis: 5   * 60 * 1000, // 5 menit — analisis AI lebih stabil
  metadata: 24  * 60 * 60 * 1000 // 24 jam — metadata emiten statis
};

/**
 * Get dari cache
 * @returns {any|null}
 */
function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Set ke cache dengan TTL
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs TTL dalam milliseconds
 */
function cacheSet(key, value, ttlMs = TTL.analysis) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    createdAt: Date.now()
  });
}

/**
 * Hapus cache entry
 */
function cacheDelete(key) {
  store.delete(key);
}

/**
 * Clear semua cache yang expired
 */
function cacheClean() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

/**
 * Berapa lama lagi cache ini valid (dalam detik)
 */
function cacheTTLRemaining(key) {
  const entry = store.get(key);
  if (!entry) return 0;
  return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
}



module.exports = { cacheGet, cacheSet, cacheDelete, cacheClean, cacheTTLRemaining, TTL };
