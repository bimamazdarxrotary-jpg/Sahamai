// ══════════════════════════════════════════════════════════════════
// lib/scanner.js — Quick Scan Engine
// ══════════════════════════════════════════════════════════════════

// ── Konstanta kualifikasi sinyal ──────────────────────────────────
const MIN_SCORE_AKUMULASI  = 6;   // score minimal untuk rekomendasi AKUMULASI
const MAX_DROP_AKUMULASI   = -8;  // changePct di bawah ini → tidak bisa AKUMULASI
const MAX_DROP_TAHAN       = -15; // changePct di bawah ini → force JUAL/KURANGI
const RSI_CRASH_THRESHOLD  = 20;  // RSI di bawah ini dalam downtrend = bukan oversold biasa
const MIN_BULLISH_FOR_PUMP = 2;   // minimal sinyal bullish untuk ready_pump

/**
 * Hitung changePct dari candles terakhir
 * Dipakai untuk market regime filter
 */
function getChangePct(candles) {
  if (!candles || candles.length < 2) return 0;
  const last = candles[candles.length - 1].close;
  const prev = candles[candles.length - 2].close;
  return prev ? parseFloat(((last - prev) / prev * 100).toFixed(2)) : 0;
}

function quickScan(ticker, candles, indicators, volumeData, structure, scoring, changePctOverride) {
  if (!candles || candles.length < 20) return { signals: [] };

  const signals = [];
  const ind = indicators || {};
  const vol = volumeData  || {};
  const str = structure   || {};
  const sc  = scoring     || {};

  // changePct: pakai override dari scanner (sudah pakai meta Yahoo) atau hitung dari candles
  const changePct = changePctOverride !== undefined ? changePctOverride : getChangePct(candles);
  const isCrashing  = changePct <= MAX_DROP_AKUMULASI;   // turun > 8%
  const isCollapse  = changePct <= MAX_DROP_TAHAN;        // turun > 15%
  const isDowntrend = str.trend && str.trend.direction === 'downtrend' && str.trend.strength !== 'weak';

  // ── Helper push sinyal (hindari duplikasi type) ───────────────
  const pushed = new Set();
  function push(sig) {
    if (pushed.has(sig.type)) return;
    pushed.add(sig.type);
    signals.push(sig);
  }

  // ── Collapse warning — prioritas tertinggi ────────────────────
  if (isCollapse) {
    push({
      type:      'collapse',
      label:     'Penurunan Ekstrem ' + changePct + '%',
      direction: 'short',
      detail:    'Saham turun ' + changePct + '% hari ini — hindari catch falling knife',
      strength:  'high'
    });
  }

  // ── Breakout ──────────────────────────────────────────────────
  if (str.breakout && str.breakout.isBreakout && str.breakout.confirmed) {
    // Breakout bullish tidak valid jika saham sedang crash
    if (!isCrashing || str.breakout.type !== 'bullish_breakout') {
      push({
        type:      'breakout',
        label:     'Breakout ' + (str.breakout.type === 'bullish_breakout' ? '↑' : '↓'),
        direction: str.breakout.type === 'bullish_breakout' ? 'long' : 'short',
        detail:    'Breakout di ' + (str.breakout.level ? str.breakout.level.toLocaleString('id-ID') : 'N/A') + ' — volume terkonfirmasi',
        strength:  'high'
      });
    }
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
    // Volume spike di tengah crash = distribusi/panik, bukan akumulasi
    const dir = (isCrashing && vol.accDist && vol.accDist.bias !== 'accumulation')
      ? 'short'
      : (vol.accDist && vol.accDist.bias === 'accumulation' ? 'long' : 'watch');
    push({
      type:      'volume_spike',
      label:     'Vol Spike ' + vol.spike.ratio + 'x',
      direction: dir,
      detail:    'Volume ' + vol.spike.ratio + 'x rata-rata — ' + (vol.narrative || ''),
      strength:  vol.spike.ratio >= 3 ? 'high' : 'medium'
    });
  }

  // ── RSI Oversold ──────────────────────────────────────────────
  // RSI oversold dalam downtrend kuat = "falling knife", bukan peluang beli
  if (ind.rsi != null && ind.rsi < 30) {
    const isKnife = isDowntrend && ind.rsi < RSI_CRASH_THRESHOLD;
    push({
      type:      'oversold',
      label:     'RSI Oversold ' + ind.rsi,
      direction: isKnife ? 'watch' : 'long',  // jika knife, jangan langsung long
      detail:    isKnife
        ? 'RSI ' + ind.rsi + ' oversold dalam downtrend kuat — waspadai falling knife'
        : 'RSI ' + ind.rsi + ' zona oversold' + (ind.stoch && ind.stoch.signal === 'oversold' ? ' + Stoch oversold' : ''),
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
    // Golden cross tidak valid jika harga crash hari ini
    if (!isCrashing) {
      push({
        type:      'golden_cross',
        label:     'Golden Cross',
        direction: 'long',
        detail:    'MA20 menembus MA50 ke atas — sinyal uptrend',
        strength:  'high'
      });
    }
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
  // Akumulasi tidak valid jika saham sedang crash atau distribusi hari ini
  if (vol.accDist && vol.accDist.bias === 'accumulation' && vol.accDist.accDays >= 5 && !isCrashing) {
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
    if (!isCrashing) { // MACD bullish tidak relevan saat crash
      push({
        type:      'macd_cross',
        label:     'MACD Cross ↑',
        direction: 'long',
        detail:    'MACD menembus signal line ke atas — momentum bullish',
        strength:  'medium'
      });
    }
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
        direction: isDowntrend ? 'watch' : 'long', // downtrend = tidak langsung long
        detail:    'MFI oversold (' + ind.mfi.mfi + ') — tekanan jual berbasis volume ekstrim' +
                   (isDowntrend ? ', tapi downtrend masih aktif' : ', potensi reversal'),
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
    const isBullDiv = ind.divergence.bias === 'bullish';
    // Bullish divergence tidak valid saat crash
    if (!(isBullDiv && isCrashing)) {
      push({
        type:      'divergence',
        label:     isBullDiv ? 'Bullish Divergence' : 'Bearish Divergence',
        direction: isBullDiv ? 'long' : 'short',
        detail:    ind.divergence.summary,
        strength:  'high'
      });
    }
  }

  // ── Candlestick Pattern ───────────────────────────────────────
  if (ind.candlestick && ind.candlestick.topPattern && ind.candlestick.topPattern.strength === 'high') {
    const p = ind.candlestick.topPattern;
    // Bullish candlestick tidak valid saat crash
    if (!(p.type === 'bullish' && isCrashing)) {
      push({
        type:      'candlestick',
        label:     p.name,
        direction: p.type === 'bullish' ? 'long' : p.type === 'bearish' ? 'short' : 'watch',
        detail:    p.signal,
        strength:  'high'
      });
    }
  }

  // ── Fibonacci Key Level ───────────────────────────────────────
  if (ind.fibonacci && ind.fibonacci.atKeyLevel) {
    const zone = ind.fibonacci.zone || '';
    // Level fib sebagai support tidak relevan saat collapse
    if (!isCollapse) {
      push({
        type:      'fib_level',
        label:     'Level Fib Kunci',
        direction: ind.fibonacci.positionPct < 50 ? 'long' : 'watch',
        detail:    'Harga di level Fibonacci kritis — ' + zone.replace(/_/g, ' ') + '. ' + (ind.fibonacci.narrative || ''),
        strength:  'medium'
      });
    }
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
    if (!isCollapse) { // zona pivot tidak relevan saat collapse
      push({
        type:      'pivot_support',
        label:     'Di Zona Pivot',
        direction: 'long',
        detail:    'Harga di antara S1 (' + (ind.pivots.S1 ? ind.pivots.S1.toLocaleString('id-ID') : 'N/A') + ') dan Pivot (' + (ind.pivots.P ? ind.pivots.P.toLocaleString('id-ID') : 'N/A') + ') — zona support kuat',
        strength:  'medium'
      });
    }
  }

  // ── Selling Climax ────────────────────────────────────────────
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
  // Syarat lebih ketat: tidak boleh crash, tidak downtrend kuat
  const bullishSignals = signals.filter(function(s) { return s.direction === 'long'; });
  const rsiVal         = ind.rsi;
  const hasAccum       = vol.accDist && vol.accDist.bias === 'accumulation';
  const scoreVal       = sc.final || 0;
  const notDowntrend   = !isDowntrend;
  const notCrashing    = !isCrashing;

  if (
    bullishSignals.length >= MIN_BULLISH_FOR_PUMP &&
    rsiVal != null && rsiVal < 45 && rsiVal > 10 &&
    scoreVal >= MIN_SCORE_AKUMULASI &&
    notDowntrend &&
    notCrashing
  ) {
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
