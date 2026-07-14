// ══════════════════════════════════════════════════════════════════
// lib/candleUtils.js — Utilitas candle yang aman terhadap open null
//
// Bug fix: sebelumnya lib/indicators.js, lib/volume.js, dan lib/bandar.js
// masing-masing punya pola fallback `c.open != null ? c.open : c.close`
// atau `c.open || c.close` untuk menghitung body/wick/arah candle. Saat
// `open` benar-benar null (data provider tidak selalu mengisi field ini),
// fallback ini diam-diam membuat body candle jadi 0 dan/atau membuat
// perbandingan seperti `close >= close` yang SELALU true atau SELALU false
// — bukan "tidak diketahui", tapi salah secara aktif (klasifikasi
// bullish/bearish yang keliru, atau pola yang jadi mustahil terdeteksi).
//
// Modul ini menyediakan helper yang mengembalikan `null` (bukan angka/
// boolean yang menyesatkan) ketika data open tidak tersedia, sehingga
// pemanggil WAJIB menangani kasus "tidak diketahui" secara eksplisit
// alih-alih diam-diam salah.
// ══════════════════════════════════════════════════════════════════

function hasOpen(c) {
  return !!c && c.open != null && !isNaN(c.open);
}

function candleBody(c) {
  if (!hasOpen(c)) return null;
  return Math.abs(c.close - c.open);
}

function isGreenCandle(c) {
  if (!hasOpen(c)) return null; // tidak diketahui — BUKAN true/false
  return c.close >= c.open;
}

function isRedCandle(c) {
  if (!hasOpen(c)) return null;
  return c.close < c.open;
}

function upperWick(c) {
  if (!hasOpen(c)) return null;
  return c.high - Math.max(c.close, c.open);
}

function lowerWick(c) {
  if (!hasOpen(c)) return null;
  return Math.min(c.close, c.open) - c.low;
}

module.exports = { hasOpen, candleBody, isGreenCandle, isRedCandle, upperWick, lowerWick };
