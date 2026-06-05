// ══════════════════════════════════════════════════════════════════
// lib/scanner.js — quickScan Engine
// Hasilkan sinyal trading dari data teknikal satu saham
// Dipanggil oleh api/analyze.js dan api/scanner.js
// ══════════════════════════════════════════════════════════════════

const IDX_STOCKS = require('../data/idx-stocks.json');

// ── Threshold ─────────────────────────────────────────────────────
const CRASH_THRESHOLD = -8; // IHSG turun > 8% = blokir sinyal bullish

// ── Cek apakah IHSG sedang crash ─────────────────────────────────
// Pakai cache sector:returns yang di-set oleh api/scanner.js
// Jika tidak ada data IHSG, default false (tidak blokir)
function isMarketCrashing(cacheGet) {
  if (!cacheGet) return false;
  try {
    const ihsgData = cacheGet('ihsg:changePct');
    if (ihsgData == null) return false;
    return typeof ihsgData === 'number' && ihsgData < CRASH_THRESHOLD;
  } catch (e) {
    return false;
  }
}

// ── Label sinyal ──────────────────────────────────────────────────
const SIGNAL_LABELS = {
  breakout:       'Breakout',
  volume_spike:   'Volume Spike',
  oversold:       'Oversold',
  golden_cross:   'Golden Cross',
  death_cross:    'Death Cross',
  accumulation:   'Akumulasi',
  macd_cross:     'MACD Cross',
  divergence:     'Divergence',
  mfi_oversold:   'MFI Oversold',
  candlestick:    'Pola Candle',
  fib_level:      'Fib Level',
  squeeze:        'BB Squeeze',
};

// ── quickScan — hasilkan array sinyal dari semua indikator ────────
/**
 * @param {string}  ticker
 * @param {Array}   candles
 * @param {Object}  indicators  — hasil computeAll()
 * @param {Object}  volumeData  — hasil analyzeVolume()
 * @param {Object}  structure   — hasil analyzeStructure()
 * @param {Object}  scoring     — hasil computeScore()
 * @param {number}  [changePct] — perubahan harga hari ini (%)
 * @param {Function} [cacheGet] — opsional, untuk cek crash IHSG
 * @returns {{ signals: Array }}
 */
function quickScan(ticker, candles, indicators, volumeData, structure, scoring, changePct, cacheGet) {
  const signals = [];
  if (!candles || candles.length < 20) return { signals };

  const ind  = indicators  || {};
  const vol  = volumeData  || {};
  const str  = structure   || {};
  const sc   = scoring     || {};

  const isCrash    = isMarketCrashing(cacheGet);
  const isLongOk   = !isCrash; // blokir sinyal bullish/long saat crash

  // ── 1. BREAKOUT ──────────────────────────────────────────────────
  if (str.breakout && str.breakout.isBreakout && str.breakout.type === 'bullish_breakout') {
    if (isLongOk) {
      signals.push({
        type:      'breakout',
        label:     SIGNAL_LABELS.breakout,
        direction: 'long',
        strength:  str.breakout.confirmed ? 'high' : 'medium',
        reason:    str.breakout.confirmed
          ? 'Breakout di level ' + (str.breakout.level ? str.breakout.level.toLocaleString('id-ID') : '—') + ' dengan konfirmasi volume'
          : 'Breakout di level ' + (str.breakout.level ? str.breakout.level.toLocaleString('id-ID') : '—') + ' — volume belum konfirmasi'
      });
    }
  }
  if (str.breakout && str.breakout.isBreakout && str.breakout.type === 'bearish_breakdown') {
    signals.push({
      type:      'breakout',
      label:     'Breakdown',
      direction: 'short',
      strength:  str.breakout.confirmed ? 'high' : 'medium',
      reason:    'Breakdown di level ' + (str.breakout.level ? str.breakout.level.toLocaleString('id-ID') : '—')
    });
  }

  // ── 2. VOLUME SPIKE ──────────────────────────────────────────────
  if (vol.spike && vol.spike.isSpike) {
    const isAcc  = vol.accDist && vol.accDist.bias === 'accumulation';
    const isDist = vol.accDist && vol.accDist.bias === 'distribution';
    if (isAcc && isLongOk) {
      signals.push({
        type:      'volume_spike',
        label:     SIGNAL_LABELS.volume_spike,
        direction: 'long',
        strength:  vol.spike.intensity === 'extreme' || vol.spike.intensity === 'high' ? 'high' : 'medium',
        reason:    'Volume ' + vol.spike.ratio + '× rata-rata dengan pola akumulasi'
      });
    } else if (isDist) {
      signals.push({
        type:      'volume_spike',
        label:     'Volume Distribusi',
        direction: 'short',
        strength:  'medium',
        reason:    'Volume ' + vol.spike.ratio + '× rata-rata dengan pola distribusi'
      });
    } else {
      signals.push({
        type:      'volume_spike',
        label:     SIGNAL_LABELS.volume_spike,
        direction: 'neutral',
        strength:  'low',
        reason:    'Volume spike ' + vol.spike.ratio + '× — arah belum jelas'
      });
    }
  }

  // ── 3. OVERSOLD ──────────────────────────────────────────────────
  const rsi = ind.rsi;
  if (rsi != null && rsi < 30 && isLongOk) {
    signals.push({
      type:      'oversold',
      label:     SIGNAL_LABELS.oversold,
      direction: 'long',
      strength:  rsi < 20 ? 'high' : 'medium',
      reason:    'RSI oversold (' + rsi + ')' + (rsi < 20 ? ' — level ekstrim' : '')
    });
  }

  // ── 4. GOLDEN CROSS / DEATH CROSS ────────────────────────────────
  if (ind.ma && ind.ma.type === 'golden_cross' && isLongOk) {
    signals.push({
      type:      'golden_cross',
      label:     SIGNAL_LABELS.golden_cross,
      direction: 'long',
      strength:  'high',
      reason:    'MA20 memotong ke atas MA50 — sinyal uptrend kuat'
    });
  }
  if (ind.ma && ind.ma.type === 'death_cross') {
    signals.push({
      type:      'death_cross',
      label:     SIGNAL_LABELS.death_cross,
      direction: 'short',
      strength:  'high',
      reason:    'MA20 memotong ke bawah MA50 — sinyal downtrend kuat'
    });
  }

  // ── 5. AKUMULASI ─────────────────────────────────────────────────
  if (vol.accDist && vol.accDist.bias === 'accumulation' && vol.accDist.accDays >= 6 && isLongOk) {
    const alreadyHasVolSpike = signals.some(s => s.type === 'volume_spike' && s.direction === 'long');
    if (!alreadyHasVolSpike) {
      signals.push({
        type:      'accumulation',
        label:     SIGNAL_LABELS.accumulation,
        direction: 'long',
        strength:  vol.accDist.accDays >= 8 ? 'high' : 'medium',
        reason:    'Pola akumulasi ' + vol.accDist.accDays + ' hari — volume beli konsisten di atas rata-rata'
      });
    }
  }

  // ── 6. MACD CROSS ────────────────────────────────────────────────
  if (ind.macd && ind.macd.crossover === 'golden_cross' && isLongOk) {
    signals.push({
      type:      'macd_cross',
      label:     SIGNAL_LABELS.macd_cross,
      direction: 'long',
      strength:  'medium',
      reason:    'MACD golden cross — histogram berbalik positif'
    });
  }
  if (ind.macd && ind.macd.crossover === 'death_cross') {
    signals.push({
      type:      'macd_cross',
      label:     'MACD Death Cross',
      direction: 'short',
      strength:  'medium',
      reason:    'MACD death cross — histogram berbalik negatif'
    });
  }

  // ── 7. DIVERGENCE ────────────────────────────────────────────────
  if (ind.divergence && ind.divergence.detected) {
    if (ind.divergence.bias === 'bullish' && isLongOk) {
      signals.push({
        type:      'divergence',
        label:     SIGNAL_LABELS.divergence,
        direction: 'long',
        strength:  'high',
        reason:    ind.divergence.summary || 'Bullish divergence — potensi reversal naik'
      });
    } else if (ind.divergence.bias === 'bearish') {
      signals.push({
        type:      'divergence',
        label:     'Bearish Divergence',
        direction: 'short',
        strength:  'medium',
        reason:    ind.divergence.summary || 'Bearish divergence — potensi reversal turun'
      });
    }
  }

  // ── 8. MFI OVERSOLD ──────────────────────────────────────────────
  if (ind.mfi && ind.mfi.mfi != null && ind.mfi.mfi < 20 && isLongOk) {
    signals.push({
      type:      'mfi_oversold',
      label:     SIGNAL_LABELS.mfi_oversold,
      direction: 'long',
      strength:  'medium',
      reason:    'MFI oversold (' + ind.mfi.mfi + ') — volume selling exhaustion'
    });
  }

  // ── 9. CANDLESTICK PATTERN ───────────────────────────────────────
  if (ind.candlestick && ind.candlestick.topPattern) {
    const p = ind.candlestick.topPattern;
    if (p.type === 'bullish' && p.strength !== 'low' && isLongOk) {
      signals.push({
        type:      'candlestick',
        label:     p.name,
        direction: 'long',
        strength:  p.strength,
        reason:    p.signal
      });
    } else if (p.type === 'bearish' && p.strength !== 'low') {
      signals.push({
        type:      'candlestick',
        label:     p.name,
        direction: 'short',
        strength:  p.strength,
        reason:    p.signal
      });
    }
  }

  // ── 10. FIBONACCI LEVEL KUNCI ────────────────────────────────────
  if (ind.fibonacci && ind.fibonacci.atKeyLevel) {
    const posUp = ind.fibonacci.positionPct < 50; // di bawah 50% = zona beli potensial
    if (posUp && isLongOk) {
      signals.push({
        type:      'fib_level',
        label:     SIGNAL_LABELS.fib_level,
        direction: 'long',
        strength:  'medium',
        reason:    'Harga di level Fibonacci kunci — ' + (ind.fibonacci.zone || '').replace(/_/g, ' ')
      });
    }
  }

  // ── 11. BOLLINGER SQUEEZE ────────────────────────────────────────
  if (ind.bb && ind.bb.bandwidth < 5) {
    signals.push({
      type:      'squeeze',
      label:     SIGNAL_LABELS.squeeze,
      direction: 'neutral',
      strength:  'low',
      reason:    'BB menyempit (bandwidth ' + ind.bb.bandwidth + '%) — potensi ledakan volatilitas'
    });
  }

  // ── Crash warning — tambah sinyal peringatan jika market crash ───
  if (isCrash) {
    signals.push({
      type:      'market_crash',
      label:     '⚠️ Market Crash',
      direction: 'short',
      strength:  'high',
      reason:    'IHSG turun lebih dari 8% — sinyal bullish diblokir, prioritas capital preservation'
    });
  }

  // ── Sort: high → medium → low, lalu long sebelum short ──────────
  const strengthOrder = { high: 0, medium: 1, low: 2 };
  const dirOrder      = { long: 0, neutral: 1, short: 2 };
  signals.sort(function(a, b) {
    const sd = (strengthOrder[a.strength] || 2) - (strengthOrder[b.strength] || 2);
    if (sd !== 0) return sd;
    return (dirOrder[a.direction] || 1) - (dirOrder[b.direction] || 1);
  });

  return { signals };
}

module.exports = { quickScan, isMarketCrashing };
