// ══════════════════════════════════════════════════════════════════
// lib/scanner.js — Quick Scan Engine
// ══════════════════════════════════════════════════════════════════

function quickScan(ticker, candles, indicators, volumeData, structure, scoring) {
  if (!candles || candles.length < 20) return { signals: [] };

  const signals = [];
  const ind = indicators || {};
  const vol = volumeData  || {};
  const str = structure   || {};
  const sc  = scoring     || {};

  // ── Helper push sinyal (hindari duplikasi type) ───────────────
  const pushed = new Set();
  function push(sig) {
    if (pushed.has(sig.type)) return;
    pushed.add(sig.type);
    signals.push(sig);
  }

  // ── Breakout ──────────────────────────────────────────────────
  if (str.breakout && str.breakout.isBreakout && str.breakout.confirmed) {
    push({
      type:      'breakout',
      label:     'Breakout ' + (str.breakout.type === 'bullish_breakout' ? '↑' : '↓'),
      direction: str.breakout.type === 'bullish_breakout' ? 'long' : 'short',
      detail:    'Breakout di ' + (str.breakout.level ? str.breakout.level.toLocaleString('id-ID') : 'N/A') + ' — volume terkonfirmasi',
      strength:  'high'
    });
  }

  // ── Fake Breakout Warning ─────────────────────────────────────
  if (str.breakout && str.breakout.isBreakout && str.breakout.isFake) {
    push({
      type:      'fake_breakout',
      label:     'Fake Breakout ⚠️',
      direction: 'watch',
      detail:    'Breakout tanpa konfirmasi volume — waspadai bull trap',
      strength:  'medium'
    });
  }

  // ── Volume Spike ──────────────────────────────────────────────
  if (vol.spike && vol.spike.isSpike && vol.spike.ratio >= 2) {
    push({
      type:      'volume_spike',
      label:     'Vol Spike ' + vol.spike.ratio + 'x',
      direction: vol.accDist && vol.accDist.bias === 'accumulation' ? 'long' : 'watch',
      detail:    'Volume ' + vol.spike.ratio + 'x rata-rata — ' + (vol.narrative || ''),
      strength:  vol.spike.ratio >= 3 ? 'high' : 'medium'
    });
  }

  // ── RSI Oversold ──────────────────────────────────────────────
  if (ind.rsi != null && ind.rsi < 30) {
    push({
      type:      'oversold',
      label:     'RSI Oversold ' + ind.rsi,
      direction: 'long',
      detail:    'RSI ' + ind.rsi + ' zona oversold' + (ind.stoch && ind.stoch.signal === 'oversold' ? ' + Stoch oversold' : ''),
      strength:  ind.rsi < 20 ? 'high' : 'medium'
    });
  }

  // ── RSI Overbought ────────────────────────────────────────────
  if (ind.rsi != null && ind.rsi > 70) {
    push({
      type:      'overbought',
      label:     'RSI Overbought ' + ind.rsi,
      direction: 'short',
      detail:    'RSI ' + ind.rsi + ' zona overbought — waspadai koreksi',
      strength:  ind.rsi > 80 ? 'high' : 'medium'
    });
  }

  // ── Golden/Death Cross ────────────────────────────────────────
  if (ind.ma && ind.ma.type === 'golden_cross') {
    push({
      type:      'golden_cross',
      label:     'Golden Cross',
      direction: 'long',
      detail:    'MA20 menembus MA50 ke atas — sinyal uptrend',
      strength:  'high'
    });
  }
  if (ind.ma && ind.ma.type === 'death_cross') {
    push({
      type:      'death_cross',
      label:     'Death Cross',
      direction: 'short',
      detail:    'MA20 menembus MA50 ke bawah — sinyal downtrend',
      strength:  'high'
    });
  }

  // ── Accumulation ──────────────────────────────────────────────
  if (vol.accDist && vol.accDist.bias === 'accumulation' && vol.accDist.accDays >= 5) {
    push({
      type:      'accumulation',
      label:     'Akumulasi ' + vol.accDist.accDays + 'h',
      direction: 'long',
      detail:    'Akumulasi ' + vol.accDist.accDays + ' dari 10 hari — potensi smart money masuk',
      strength:  vol.accDist.accDays >= 7 ? 'high' : 'medium'
    });
  }

  // ── Distribution ──────────────────────────────────────────────
  if (vol.accDist && vol.accDist.bias === 'distribution' && vol.accDist.distDays >= 5) {
    push({
      type:      'distribution',
      label:     'Distribusi ' + vol.accDist.distDays + 'h',
      direction: 'short',
      detail:    'Distribusi ' + vol.accDist.distDays + ' dari 10 hari — potensi smart money keluar',
      strength:  vol.accDist.distDays >= 7 ? 'high' : 'medium'
    });
  }

  // ── MACD Cross ────────────────────────────────────────────────
  if (ind.macd && ind.macd.crossover === 'golden_cross') {
    push({
      type:      'macd_cross',
      label:     'MACD Cross ↑',
      direction: 'long',
      detail:    'MACD menembus signal line ke atas — momentum bullish',
      strength:  'medium'
    });
  }
  if (ind.macd && ind.macd.crossover === 'death_cross') {
    push({
      type:      'macd_cross',
      label:     'MACD Cross ↓',
      direction: 'short',
      detail:    'MACD menembus signal line ke bawah — momentum bearish',
      strength:  'medium'
    });
  }

  // ── MFI ──────────────────────────────────────────────────────
  if (ind.mfi && ind.mfi.mfi != null) {
    if (ind.mfi.mfi < 20) {
      push({
        type:      'mfi_oversold',
        label:     'MFI Oversold ' + ind.mfi.mfi,
        direction: 'long',
        detail:    'MFI oversold (' + ind.mfi.mfi + ') — tekanan jual berbasis volume ekstrim, potensi reversal',
        strength:  'high'
      });
    } else if (ind.mfi.mfi > 80) {
      push({
        type:      'mfi_overbought',
        label:     'MFI Overbought ' + ind.mfi.mfi,
        direction: 'short',
        detail:    'MFI overbought (' + ind.mfi.mfi + ') — tekanan beli mengering, waspadai koreksi',
        strength:  'medium'
      });
    }
  }

  // ── Divergence ────────────────────────────────────────────────
  if (ind.divergence && ind.divergence.detected) {
    push({
      type:      'divergence',
      label:     ind.divergence.bias === 'bullish' ? 'Bullish Divergence' : 'Bearish Divergence',
      direction: ind.divergence.bias === 'bullish' ? 'long' : 'short',
      detail:    ind.divergence.summary,
      strength:  'high'
    });
  }

  // ── Candlestick Pattern ───────────────────────────────────────
  if (ind.candlestick && ind.candlestick.topPattern && ind.candlestick.topPattern.strength === 'high') {
    const p = ind.candlestick.topPattern;
    push({
      type:      'candlestick',
      label:     p.name,
      direction: p.type === 'bullish' ? 'long' : p.type === 'bearish' ? 'short' : 'watch',
      detail:    p.signal,
      strength:  'high'
    });
  }

  // ── Fibonacci Key Level ───────────────────────────────────────
  if (ind.fibonacci && ind.fibonacci.atKeyLevel) {
    const zone = ind.fibonacci.zone || '';
    push({
      type:      'fib_level',
      label:     'Level Fib Kunci',
      direction: ind.fibonacci.positionPct < 50 ? 'long' : 'watch',
      detail:    'Harga di level Fibonacci kritis — ' + zone.replace(/_/g, ' ') + '. ' + (ind.fibonacci.narrative || ''),
      strength:  'medium'
    });
  }

  // ── Relative Strength ─────────────────────────────────────────
  if (ind.relStrength && ind.relStrength.trend === 'outperform' && ind.relStrength.rsScore >= 70) {
    push({
      type:      'rs_strong',
      label:     'RS Kuat ' + ind.relStrength.rsScore,
      direction: 'long',
      detail:    (ind.relStrength.label || '') + ' — ' + (ind.relStrength.narrative || ''),
      strength:  'medium'
    });
  }

  // ── Pivot Support ─────────────────────────────────────────────
  if (ind.pivots && ind.pivots.position === 'between_S1_P') {
    push({
      type:      'pivot_support',
      label:     'Di Zona Pivot',
      direction: 'long',
      detail:    'Harga di antara S1 (' + (ind.pivots.S1 ? ind.pivots.S1.toLocaleString('id-ID') : 'N/A') + ') dan Pivot (' + (ind.pivots.P ? ind.pivots.P.toLocaleString('id-ID') : 'N/A') + ') — zona support kuat',
      strength:  'medium'
    });
  }

  // ── Selling Climax (reversal peluang) ─────────────────────────
  if (vol.climax && vol.climax.isClimax && vol.climax.type === 'selling_climax') {
    push({
      type:      'selling_climax',
      label:     'Selling Climax',
      direction: 'long',
      detail:    'Volume ekstrim + candle merah besar — potensi capitulation & reversal naik',
      strength:  'high'
    });
  }

  // ── Ready to Pump composite ───────────────────────────────────
  const bullishSignals = signals.filter(function(s) { return s.direction === 'long'; });
  const rsiVal         = ind.rsi;
  const hasAccum       = vol.accDist && vol.accDist.bias === 'accumulation';
  const scoreVal       = sc.final || 0;
  const notDowntrend   = !str.trend || str.trend.direction !== 'downtrend' || str.trend.strength === 'weak' || str.trend.strength === 'no_trend';

  if (bullishSignals.length >= 2 && rsiVal != null && rsiVal < 45 && rsiVal > 10 && scoreVal >= 6 && notDowntrend) {
    let reasons = bullishSignals.slice(0, 2).map(function(s) { return s.label; }).join(' + ');
    if (hasAccum) reasons += ' + Akumulasi';
    signals.unshift({
      type:      'ready_pump',
      label:     '🎯 Ready to Pump',
      direction: 'long',
      detail:    'Setup matang: ' + reasons + '. RSI ' + rsiVal + ', skor ' + scoreVal + '/10.',
      strength:  scoreVal >= 8 ? 'high' : 'medium'
    });
  }

  return { signals };
}

module.exports = { quickScan };
