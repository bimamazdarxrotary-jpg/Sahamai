// ══════════════════════════════════════════════════════════════════
// lib/scanner.js — Quick Scan Engine (dipanggil dari analyze.js)
// Upgrade: tambah sinyal MFI, Divergence, Candlestick, Fibonacci
// ══════════════════════════════════════════════════════════════════

function quickScan(ticker, candles, indicators, volumeData, structure, scoring) {
  if (!candles || candles.length < 20) return { signals: [] };

  var signals = [];
  var ind = indicators || {};
  var vol = volumeData  || {};
  var str = structure   || {};
  var sc  = scoring     || {};

  // ── EXISTING: Breakout ────────────────────────────────────────
  if (str.breakout && str.breakout.isBreakout && str.breakout.confirmed) {
    signals.push({
      type:      'breakout',
      label:     'Breakout ' + (str.breakout.type === 'bullish_breakout' ? '↑' : '↓'),
      direction: str.breakout.type === 'bullish_breakout' ? 'long' : 'short',
      detail:    'Breakout di ' + (str.breakout.level ? str.breakout.level.toLocaleString('id-ID') : 'N/A') + ' — volume terkonfirmasi',
      strength:  'high'
    });
  }

  // ── EXISTING: Volume Spike ────────────────────────────────────
  if (vol.spike && vol.spike.isSpike && vol.spike.ratio >= 2) {
    signals.push({
      type:      'volume_spike',
      label:     'Vol Spike ' + vol.spike.ratio + 'x',
      direction: vol.accDist && vol.accDist.bias === 'accumulation' ? 'long' : 'watch',
      detail:    'Volume ' + vol.spike.ratio + 'x rata-rata — ' + (vol.narrative || ''),
      strength:  vol.spike.ratio >= 3 ? 'high' : 'medium'
    });
  }

  // ── EXISTING: RSI Oversold ────────────────────────────────────
  if (ind.rsi != null && ind.rsi < 30) {
    signals.push({
      type:      'oversold',
      label:     'RSI Oversold ' + ind.rsi,
      direction: 'long',
      detail:    'RSI ' + ind.rsi + ' zona oversold' + (ind.stoch && ind.stoch.signal === 'oversold' ? ' + Stoch oversold' : ''),
      strength:  ind.rsi < 20 ? 'high' : 'medium'
    });
  }

  // ── EXISTING: Golden/Death Cross ─────────────────────────────
  if (ind.ma && ind.ma.type === 'golden_cross') {
    signals.push({
      type:      'golden_cross',
      label:     'Golden Cross',
      direction: 'long',
      detail:    'MA20 menembus MA50 ke atas — sinyal uptrend',
      strength:  'high'
    });
  }
  if (ind.ma && ind.ma.type === 'death_cross') {
    signals.push({
      type:      'death_cross',
      label:     'Death Cross',
      direction: 'short',
      detail:    'MA20 menembus MA50 ke bawah — sinyal downtrend',
      strength:  'high'
    });
  }

  // ── EXISTING: Accumulation ────────────────────────────────────
  if (vol.accDist && vol.accDist.bias === 'accumulation' && vol.accDist.accDays >= 5) {
    signals.push({
      type:      'accumulation',
      label:     'Akumulasi ' + vol.accDist.accDays + 'h',
      direction: 'long',
      detail:    'Akumulasi ' + vol.accDist.accDays + ' dari 10 hari — potensi smart money masuk',
      strength:  vol.accDist.accDays >= 7 ? 'high' : 'medium'
    });
  }

  // ── EXISTING: MACD Cross ──────────────────────────────────────
  if (ind.macd && ind.macd.crossover === 'golden_cross') {
    signals.push({
      type:      'macd_cross',
      label:     'MACD Cross ↑',
      direction: 'long',
      detail:    'MACD menembus signal line ke atas — momentum bullish',
      strength:  'medium'
    });
  }
  if (ind.macd && ind.macd.crossover === 'death_cross') {
    signals.push({
      type:      'macd_cross',
      label:     'MACD Cross ↓',
      direction: 'short',
      detail:    'MACD menembus signal line ke bawah — momentum bearish',
      strength:  'medium'
    });
  }

  // ── NEW: MFI Oversold/Overbought ──────────────────────────────
  if (ind.mfi && ind.mfi.mfi != null) {
    if (ind.mfi.mfi < 20) {
      signals.push({
        type:      'mfi_oversold',
        label:     'MFI Oversold ' + ind.mfi.mfi,
        direction: 'long',
        detail:    'Money Flow Index oversold (' + ind.mfi.mfi + ') — tekanan jual berbasis volume ekstrim, potensi reversal',
        strength:  'high'
      });
    } else if (ind.mfi.mfi > 80) {
      signals.push({
        type:      'mfi_overbought',
        label:     'MFI Overbought ' + ind.mfi.mfi,
        direction: 'short',
        detail:    'Money Flow Index overbought (' + ind.mfi.mfi + ') — tekanan beli mengering, waspadai koreksi',
        strength:  'medium'
      });
    }
  }

  // ── NEW: Divergence ───────────────────────────────────────────
  if (ind.divergence && ind.divergence.detected) {
    signals.push({
      type:      'divergence',
      label:     ind.divergence.bias === 'bullish' ? 'Bullish Divergence' : 'Bearish Divergence',
      direction: ind.divergence.bias === 'bullish' ? 'long' : 'short',
      detail:    ind.divergence.summary,
      strength:  'high'
    });
  }

  // ── NEW: Candlestick Pattern Kuat ─────────────────────────────
  if (ind.candlestick && ind.candlestick.topPattern && ind.candlestick.topPattern.strength === 'high') {
    var p = ind.candlestick.topPattern;
    signals.push({
      type:      'candlestick',
      label:     p.name,
      direction: p.type === 'bullish' ? 'long' : p.type === 'bearish' ? 'short' : 'watch',
      detail:    p.signal,
      strength:  'high'
    });
  }

  // ── NEW: Fibonacci Key Level ──────────────────────────────────
  if (ind.fibonacci && ind.fibonacci.atKeyLevel) {
    var zone = ind.fibonacci.zone || '';
    var isSupport = ind.fibonacci.positionPct < 50;
    signals.push({
      type:      'fib_level',
      label:     'Level Fib Kunci',
      direction: isSupport ? 'long' : 'watch',
      detail:    'Harga di level Fibonacci kritis — ' + zone.replace(/_/g, ' ') + '. ' + ind.fibonacci.narrative,
      strength:  'medium'
    });
  }

  // ── NEW: Relative Strength Kuat ───────────────────────────────
  if (ind.relStrength && ind.relStrength.trend === 'outperform' && ind.relStrength.rsScore >= 70) {
    signals.push({
      type:      'rs_strong',
      label:     'RS Kuat ' + ind.relStrength.rsScore,
      direction: 'long',
      detail:    ind.relStrength.label + ' — ' + ind.relStrength.narrative,
      strength:  'medium'
    });
  }

  // ── NEW: Pivot Bounce ─────────────────────────────────────────
  if (ind.pivots) {
    if (ind.pivots.position === 'between_S1_P') {
      signals.push({
        type:      'pivot_support',
        label:     'Di Zona Pivot',
        direction: 'long',
        detail:    'Harga di antara S1 (' + (ind.pivots.S1 ? ind.pivots.S1.toLocaleString('id-ID') : 'N/A') + ') dan Pivot (' + (ind.pivots.P ? ind.pivots.P.toLocaleString('id-ID') : 'N/A') + ') — zona support kuat',
        strength:  'medium'
      });
    }
  }

  return { signals };
}

module.exports = { quickScan };
