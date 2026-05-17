// ══════════════════════════════════════════════════════════════════
// lib/validation.js — Input & Output Validation
// ══════════════════════════════════════════════════════════════════

import IDX_STOCKS from '../data/idx-stocks.json' assert { type: 'json' };

const VALID_TICKER_PATTERN = /^[A-Z]{1,4}[0-9A-Z]{0,2}$/;
const INDEX_TICKERS = new Set(['IHSG', 'LQ45']);

/**
 * Validasi + normalisasi ticker input
 */
export function validateTicker(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Kode saham tidak boleh kosong.' };
  }

  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!clean) {
    return { valid: false, error: 'Kode saham tidak valid.' };
  }

  if (clean.length > 6) {
    return { valid: false, error: `Kode saham terlalu panjang: "${clean}". Maksimal 6 karakter.` };
  }

  if (!VALID_TICKER_PATTERN.test(clean) && !INDEX_TICKERS.has(clean)) {
    return { valid: false, error: `Format kode saham tidak valid: "${clean}".` };
  }

  const isIndex = INDEX_TICKERS.has(clean);
  const metadata = IDX_STOCKS[clean] || null;

  return {
    valid:    true,
    ticker:   clean,
    isIndex,
    metadata,           // data dari IDX DB jika ada
    inDatabase: !!metadata
  };
}

/**
 * Validasi & parse output JSON dari AI
 * Schema sederhana tanpa dependency eksternal
 */
export function validateAIOutput(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Output AI kosong' };
  }

  // Strip markdown fences
  let cleaned = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```$/im, '')
    .trim();

  // Coba ekstrak JSON dari teks (fallback jika ada prefix)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  // Parse
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Coba sanitasi karakter kontrol
    try {
      const sanitized = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
      parsed = JSON.parse(sanitized);
    } catch (e2) {
      return { valid: false, error: 'JSON tidak valid dari AI', raw: cleaned.slice(0, 200) };
    }
  }

  // Validasi field wajib
  const required = ['summary', 'sentiment', 'rekomendasi'];
  const missing  = required.filter(f => !parsed[f]);

  if (missing.length) {
    return { valid: false, error: `Field wajib tidak ada: ${missing.join(', ')}`, parsed };
  }

  // Sanitasi sentiment
  const sentimentMap = { beli: 'BELI', tahan: 'TAHAN', jual: 'JUAL', bullish: 'BELI', bearish: 'JUAL', netral: 'TAHAN' };
  const rawSentiment = (parsed.sentiment || '').toLowerCase();
  parsed.sentiment = sentimentMap[rawSentiment] || parsed.sentiment?.toUpperCase() || 'TAHAN';

  // Sanitasi arrays
  for (const field of ['keunggulan', 'risiko', 'katalis']) {
    if (!Array.isArray(parsed[field])) {
      parsed[field] = parsed[field] ? [String(parsed[field])] : [];
    }
  }

  return { valid: true, parsed };
}

/**
 * Sanitasi string — buang karakter berbahaya
 */
export function sanitizeString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, maxLen);
}
