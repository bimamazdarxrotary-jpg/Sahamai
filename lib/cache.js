// ══════════════════════════════════════════════════════════════════
// lib/cache.js — In-Memory Cache
// ══════════════════════════════════════════════════════════════════

const store = new Map();

const TTL = {
  price:          60  * 1000,        // 1 menit
  analysis:       5   * 60 * 1000,  // 5 menit
  news:           15  * 60 * 1000,  // 15 menit
  foreign:        15  * 60 * 1000,  // 15 menit — data IDX update per hari bursa
  sectorReturns:  10  * 60 * 1000,  // 10 menit — dari hasil scan scanner
  metadata:       24  * 60 * 60 * 1000 // 24 jam
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

// Cleanup expired entries terjadi secara lazy di cacheGet (saat key diakses).
// setInterval TIDAK dipakai — tidak kompatibel dengan Vercel serverless
// (setiap cold start bersih, interval mati saat instance idle).

module.exports = { cacheGet, cacheSet, cacheDelete, cacheClean, cacheTTLRemaining, TTL };
