// ══════════════════════════════════════════════════════════════════
// lib/indicators.js — Engine Indikator Teknikal Matematis
// TIDAK ada AI di sini. Semua dihitung deterministik.
// v3: RSI Wilder, Fibonacci swing, RVOL, 52w position,
//     candlestick dengan konteks, hapus indikator redundan
// ══════════════════════════════════════════════════════════════════

// ── SMA ──────────────────────────────────────────────────────────
function sma(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null && !isNaN(v));
  if (slice.length < period) return null;
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

// ── EMA ──────────────────────────────────────────────────────────
function ema(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = closes.slice(0, period).filter(v => v != null).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    if (closes[i] == null) continue;
    emaVal = closes[i] * k + emaVal * (1 - k);
  }
  return Math.round(emaVal);
}

// ── RSI dengan Wilder Smoothing (RMA) — lebih akurat dari EMA biasa ──
// Wilder pakai smoothing factor α = 1/period (bukan 2/(period+1) seperti EMA)
// Hasilnya identik dengan TradingView dan Bloomberg
function rsi(closes, period) {
  period = period || 14;
  if (!closes || closes.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] == null || closes[i - 1] == null) continue;
    changes.push(closes[i] - closes[i - 1]);
  }
  if (changes.length < period) return null;

  // Seed: rata-rata sederhana periode pertama
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing: RMA = (prevRMA * (period-1) + current) / period
  // α = 1/period (bukan 2/(period+1))
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

// ── MACD ─────────────────────────────────────────────────────────
function macd(closes, fastPeriod, slowPeriod, signalPeriod) {
  fastPeriod   = fastPeriod   || 12;
  slowPeriod   = slowPeriod   || 26;
  signalPeriod = signalPeriod || 9;
  // Guard ketat: butuh minimal slowPeriod + signalPeriod candle
  if (!closes || closes.length < slowPeriod + signalPeriod) return null;

  const kFast   = 2 / (fastPeriod + 1);
  const kSlow   = 2 / (slowPeriod + 1);
  const kSignal = 2 / (signalPeriod + 1);
  const macdSeries = [];

  let ef = closes.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let es = closes.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
  for (let i = 1; i < fastPeriod; i++) ef = closes[i] * kFast + ef * (1 - kFast);

  for (let i = slowPeriod; i < closes.length; i++) {
    ef = closes[i] * kFast + ef * (1 - kFast);
    es = closes[i] * kSlow + es * (1 - kSlow);
    macdSeries.push(ef - es);
  }
  if (macdSeries.length < signalPeriod) return null;

  let signalVal = macdSeries.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
  let prevSignal = signalVal;
  for (let i = signalPeriod; i < macdSeries.length; i++) {
    prevSignal = signalVal;
    signalVal  = macdSeries[i] * kSignal + signalVal * (1 - kSignal);
  }

  const macdVal       = macdSeries[macdSeries.length - 1];
  const histogram     = macdVal - signalVal;
  const prevMacd      = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] : macdVal;
  const prevHistogram = prevMacd - prevSignal;

  return {
    macd:      parseFloat(macdVal.toFixed(2)),
    signal:    parseFloat(signalVal.toFixed(2)),
    histogram: parseFloat(histogram.toFixed(2)),
    trend:     macdVal > signalVal ? 'bullish' : 'bearish',
    crossover: histogram > 0 && prevHistogram <= 0 ? 'golden_cross'
             : histogram < 0 && prevHistogram >= 0 ? 'death_cross'
             : null
  };
}

// ── Bollinger Bands ───────────────────────────────────────────────
function bollingerBands(closes, period, multiplier) {
  period     = period     || 20;
  multiplier = multiplier || 2;
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null);
  if (slice.length < period) return null;
  const middle   = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const stddev   = Math.sqrt(variance);
  const upper    = Math.round(middle + multiplier * stddev);
  const lower    = Math.round(middle - multiplier * stddev);
  const last     = closes[closes.length - 1];
  const bandwidth = parseFloat(((upper - lower) / middle * 100).toFixed(2));
  const bandPct   = upper === lower ? 50 : Math.round((last - lower) / (upper - lower) * 100);
  // Squeeze: BB menyempit — potensi ledakan volatilitas
  const isSqueeze = bandwidth < 5;
  return {
    upper, middle: Math.round(middle), lower, bandwidth, bandPct, isSqueeze,
    position: bandPct > 80 ? 'overbought_zone'
            : bandPct < 20 ? 'oversold_zone'
            : 'neutral_zone'
  };
}

// ── ATR ──────────────────────────────────────────────────────────
function atr(candles, period) {
  period = period || 14;
  if (!candles || candles.length < period + 1) return null;
  const trValues = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    trValues.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close)
    ));
  }
  if (trValues.length < period) return null;
  // Wilder smoothing untuk ATR juga (konsisten dengan TradingView)
  let atrVal = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trValues.length; i++) {
    atrVal = (atrVal * (period - 1) + trValues[i]) / period;
  }
  const lastClose = candles[candles.length - 1].close;
  return {
    atr:    Math.round(atrVal),
    atrPct: parseFloat((atrVal / lastClose * 100).toFixed(2))
  };
}

// ── Support & Resistance dari swing high/low signifikan ──────────
// FIX: pakai swing point, bukan Math.max/min seluruh array
function supportResistance(candles) {
  if (!candles || candles.length < 10) return { support: [], resistance: [], pivot: 0 };
  const recent = candles.slice(-60); // cari swing di 60 candle terakhir
  const pivotCandidates = [];

  // Swing high/low: lookback 3 candle kiri-kanan
  for (let i = 3; i < recent.length - 3; i++) {
    const c = recent[i];
    const isSwingHigh = recent.slice(i - 3, i).every(x => x.high <= c.high)
                     && recent.slice(i + 1, i + 4).every(x => x.high <= c.high);
    const isSwingLow  = recent.slice(i - 3, i).every(x => x.low >= c.low)
                     && recent.slice(i + 1, i + 4).every(x => x.low >= c.low);
    if (isSwingHigh) pivotCandidates.push({ type: 'resistance', price: c.high });
    if (isSwingLow)  pivotCandidates.push({ type: 'support',    price: c.low  });
  }

  const last  = recent[recent.length - 1];
  const pivot = Math.round((last.high + last.low + last.close) / 3);

  // Cluster level yang berdekatan (dalam 1.5%) menjadi satu level
  function cluster(levels) {
    if (!levels.length) return [];
    const sorted = levels.map(l => l.price).sort((a, b) => a - b);
    const clusters = [];
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - group[group.length - 1]) / group[group.length - 1] < 0.015) {
        group.push(sorted[i]);
      } else {
        clusters.push(Math.round(group.reduce((a, b) => a + b) / group.length));
        group = [sorted[i]];
      }
    }
    if (group.length) clusters.push(Math.round(group.reduce((a, b) => a + b) / group.length));
    return clusters.slice(-3);
  }

  const current    = last.close;
  const supports    = pivotCandidates.filter(p => p.type === 'support'    && p.price < current);
  const resistances = pivotCandidates.filter(p => p.type === 'resistance' && p.price > current);

  return {
    support:    supports.length    ? cluster(supports).sort((a, b) => b - a)    : [],
    resistance: resistances.length ? cluster(resistances).sort((a, b) => a - b) : [],
    pivot
  };
}

// ── MA Crossover ─────────────────────────────────────────────────
function maCrossover(closes) {
  if (!closes || closes.length < 52) {
    return { type: null, ma20: null, ma50: null, aboveMA20: false, aboveMA50: false };
  }
  const ma20Now  = sma(closes, 20);
  const ma50Now  = sma(closes, 50);
  const ma20Prev = sma(closes.slice(0, -1), 20);
  const ma50Prev = sma(closes.slice(0, -1), 50);
  const last     = closes[closes.length - 1];
  let crossType  = null;
  if (ma20Prev && ma50Prev) {
    if (ma20Now > ma50Now && ma20Prev <= ma50Prev) crossType = 'golden_cross';
    if (ma20Now < ma50Now && ma20Prev >= ma50Prev) crossType = 'death_cross';
  }
  return {
    type:      crossType,
    ma20:      ma20Now,
    ma50:      ma50Now,
    aboveMA20: last > ma20Now,
    aboveMA50: last > ma50Now,
    ma20vs50:  ma20Now > ma50Now ? 'bullish_alignment' : 'bearish_alignment'
  };
}

// ── ADX (Trend Strength) ─────────────────────────────────────────
function trendStrength(candles, period) {
  period = period || 14;
  if (!candles || candles.length < period * 2) return null;
  const dmPlus = [], dmMinus = [], tr = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i], prev = candles[i - 1];
    dmPlus.push(Math.max(curr.high - prev.high, 0));
    dmMinus.push(Math.max(prev.low - curr.low, 0));
    tr.push(Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close)));
  }
  const smooth = (arr) => {
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const res = [s];
    for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; res.push(s); }
    return res;
  };
  const sTR = smooth(tr), sDMPlus = smooth(dmPlus), sDMMinus = smooth(dmMinus);
  const diPlus  = sDMPlus.map((v, i)  => sTR[i] ? v / sTR[i] * 100 : 0);
  const diMinus = sDMMinus.map((v, i) => sTR[i] ? v / sTR[i] * 100 : 0);
  const dx = diPlus.map((v, i) => {
    const sum = v + diMinus[i];
    return sum ? Math.abs(v - diMinus[i]) / sum * 100 : 0;
  });
  const adxVal      = Math.round(dx.slice(-period).reduce((a, b) => a + b, 0) / period);
  const lastDIPlus  = diPlus[diPlus.length - 1];
  const lastDIMinus = diMinus[diMinus.length - 1];
  return {
    adx:      adxVal,
    trend:    lastDIPlus > lastDIMinus ? 'uptrend' : 'downtrend',
    strength: adxVal > 40 ? 'very_strong'
            : adxVal > 25 ? 'strong'
            : adxVal > 15 ? 'weak'
            : 'no_trend'
  };
}

// ── OBV (On Balance Volume) — konfirmasi akumulasi/distribusi ─────
// Dipindahkan dari volume.js ke indicators.js agar computeAll bisa pakai
function obv(candles) {
  if (!candles || candles.length < 5) return null;
  let obvVal = 0;
  const series = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { series.push(0); continue; }
    const c = candles[i], prev = candles[i - 1];
    if (c.close > prev.close)      obvVal += (c.volume || 0);
    else if (c.close < prev.close) obvVal -= (c.volume || 0);
    series.push(obvVal);
  }
  const last10  = series.slice(-10);
  const first10 = series.slice(0, 10);
  const trend   = last10[last10.length - 1] > last10[0] ? 'rising' : 'falling';
  // OBV divergence: harga turun tapi OBV naik = akumulasi stealth
  const priceTrend = candles[candles.length - 1].close > candles[0].close ? 'up' : 'down';
  const divergence = (trend === 'rising' && priceTrend === 'down') ? 'bullish_divergence'
                   : (trend === 'falling' && priceTrend === 'up')  ? 'bearish_divergence'
                   : null;
  return { value: obvVal, trend, divergence };
}

// ══════════════════════════════════════════════════════════════════
// RELATIVE VOLUME (RVOL) — volume hari ini vs rata-rata median
// Lebih akurat dari simple avg karena tidak terdistorsi outlier
// ══════════════════════════════════════════════════════════════════
function relativeVolume(candles, period) {
  period = period || 20;
  if (!candles || candles.length < period + 1) return null;

  const vols   = candles.slice(-(period + 1), -1).map(c => c.volume || 0);
  const last   = candles[candles.length - 1];

  // Median lebih robust dari mean untuk volume
  const sorted = vols.slice().sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  if (!median) return null;

  const rvol   = parseFloat((last.volume / median).toFixed(2));
  const pct    = Math.round(rvol * 100);

  return {
    rvol,          // 1.0 = normal, 2.0 = 2x normal
    pct,           // 100 = normal, 200 = 2x
    medianVolume:  Math.round(median),
    lastVolume:    last.volume || 0,
    label: rvol >= 3   ? 'Ekstrim (3x+)'
         : rvol >= 2   ? 'Sangat Tinggi (2x+)'
         : rvol >= 1.5 ? 'Tinggi (1.5x+)'
         : rvol >= 0.8 ? 'Normal'
         : 'Rendah (<0.8x)',
    isSpike: rvol >= 2,
    intensity: rvol >= 3 ? 'extreme' : rvol >= 2 ? 'high' : rvol >= 1.5 ? 'medium' : 'low'
  };
}

// ══════════════════════════════════════════════════════════════════
// 52-WEEK POSITION — di mana harga sekarang dalam range 52 minggu
// Konteks penting untuk risk assessment dan entry timing
// ══════════════════════════════════════════════════════════════════
function position52w(candles) {
  if (!candles || candles.length < 2) return null;

  // Ambil maksimal 252 candle (1 tahun trading ~252 hari)
  const recent   = candles.slice(-252);
  const high52w  = Math.max(...recent.map(c => c.high));
  const low52w   = Math.min(...recent.map(c => c.low));
  const current  = candles[candles.length - 1].close;
  const range    = high52w - low52w;

  if (!range) return null;

  const positionPct = Math.round((current - low52w) / range * 100);
  const pctFromHigh = parseFloat(((high52w - current) / high52w * 100).toFixed(1));
  const pctFromLow  = parseFloat(((current - low52w)  / low52w  * 100).toFixed(1));

  return {
    high52w:      Math.round(high52w),
    low52w:       Math.round(low52w),
    positionPct,  // 0 = at 52w low, 100 = at 52w high
    pctFromHigh,  // berapa % di bawah 52w high
    pctFromLow,   // berapa % di atas 52w low
    zone: positionPct >= 80 ? 'near_high'      // rawan profit taking
        : positionPct >= 60 ? 'upper_half'
        : positionPct >= 40 ? 'middle'
        : positionPct >= 20 ? 'lower_half'
        : 'near_low',                           // potensi value
    label: positionPct >= 80 ? '52W High zone — rawan profit taking'
         : positionPct >= 60 ? '52W upper half — momentum kuat'
         : positionPct >= 40 ? '52W midrange — netral'
         : positionPct >= 20 ? '52W lower half — potensi value'
         : '52W Low zone — potensi oversold/value',
    // Apakah harga di dekat all-time low dalam setahun (entry menarik)
    isNearLow:  positionPct <= 15,
    isNearHigh: positionPct >= 85
  };
}

// ══════════════════════════════════════════════════════════════════
// FIBONACCI dari SWING HIGH/LOW — bukan Math.max/min seluruh array
// Lebih akurat: cari swing high/low yang signifikan terlebih dulu
// ══════════════════════════════════════════════════════════════════
function fibonacci(candles, lookback) {
  lookback = lookback || 60;
  if (!candles || candles.length < 10) return null;

  const recent  = candles.slice(-Math.min(lookback, candles.length));
  const current = candles[candles.length - 1].close;

  // Cari swing high dan swing low yang signifikan (lookback 5 candle)
  let swingHigh = null, swingLow = null;
  let swingHighIdx = -1, swingLowIdx = -1;

  for (let i = 5; i < recent.length - 2; i++) {
    const c = recent[i];
    const isSwingHigh = recent.slice(i - 5, i).every(x => x.high <= c.high)
                     && recent.slice(i + 1, i + 3).every(x => x.high <= c.high);
    const isSwingLow  = recent.slice(i - 5, i).every(x => x.low >= c.low)
                     && recent.slice(i + 1, i + 3).every(x => x.low >= c.low);
    if (isSwingHigh && (swingHigh === null || c.high > swingHigh)) {
      swingHigh = c.high; swingHighIdx = i;
    }
    if (isSwingLow && (swingLow === null || c.low < swingLow)) {
      swingLow = c.low; swingLowIdx = i;
    }
  }

  // Fallback ke max/min jika tidak ada swing point terdeteksi
  if (swingHigh === null) swingHigh = Math.max(...recent.map(c => c.high));
  if (swingLow  === null) swingLow  = Math.min(...recent.map(c => c.low));

  const diff = swingHigh - swingLow;
  if (!diff) return null;

  const levels = {
    r0:    Math.round(swingHigh),
    r236:  Math.round(swingHigh - diff * 0.236),
    r382:  Math.round(swingHigh - diff * 0.382),
    r50:   Math.round(swingHigh - diff * 0.500),
    r618:  Math.round(swingHigh - diff * 0.618),
    r786:  Math.round(swingHigh - diff * 0.786),
    r100:  Math.round(swingLow),
    e1272: Math.round(swingHigh + diff * 0.272),
    e1618: Math.round(swingHigh + diff * 0.618),
  };

  const retraceLevels = [levels.r236, levels.r382, levels.r50, levels.r618, levels.r786];
  const nearestLevel  = retraceLevels.reduce((prev, curr) =>
    Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev
  );
  const positionPct   = parseFloat(((current - swingLow) / diff * 100).toFixed(1));
  const nearSupport   = retraceLevels.filter(l => l <= current).sort((a, b) => b - a)[0] || swingLow;
  const nearResistance = retraceLevels.filter(l => l > current).sort((a, b) => a - b)[0] || swingHigh;

  return {
    high:          Math.round(swingHigh),
    low:           Math.round(swingLow),
    levels,
    nearestLevel,
    nearSupport,
    nearResistance,
    positionPct,
    isSwingBased:  swingHighIdx >= 0 && swingLowIdx >= 0,
    zone: positionPct > 76 ? 'near_high'
        : positionPct > 58 ? 'between_618_786'
        : positionPct > 45 ? 'near_50pct'
        : positionPct > 33 ? 'between_382_50'
        : positionPct > 20 ? 'between_236_382'
        : 'near_low',
    atKeyLevel:  Math.abs(current - nearestLevel) / current < 0.015,
    narrative:   `Swing ${Math.round(swingLow).toLocaleString('id-ID')}–${Math.round(swingHigh).toLocaleString('id-ID')} | Posisi: ${positionPct}% | Support Fib: ${nearSupport.toLocaleString('id-ID')} | Resist: ${nearResistance.toLocaleString('id-ID')}`
  };
}

// ══════════════════════════════════════════════════════════════════
// DIVERGENCE (RSI & MACD vs Price)
// ══════════════════════════════════════════════════════════════════
function detectDivergence(candles, rsiVal, macdData) {
  if (!candles || candles.length < 20) return null;

  const recent   = candles.slice(-20);
  const closes   = recent.map(c => c.close);
  const mid      = Math.floor(closes.length / 2);
  const divergences = [];

  const priceHighFirst  = Math.max(...closes.slice(0, mid));
  const priceHighSecond = Math.max(...closes.slice(mid));
  const priceLowFirst   = Math.min(...closes.slice(0, mid));
  const priceLowSecond  = Math.min(...closes.slice(mid));

  // RSI divergence — hitung series RSI untuk 20 candle terakhir
  if (rsiVal != null) {
    const recentCloses = recent.map(c => c.close);
    const rsiSeries    = [];
    for (let i = 14; i <= recentCloses.length; i++) {
      const v = rsi(recentCloses.slice(0, i), 14);
      if (v != null) rsiSeries.push(v);
    }
    if (rsiSeries.length >= 4) {
      const rsiMid   = Math.floor(rsiSeries.length / 2);
      const rsiFirst = Math.max(...rsiSeries.slice(0, rsiMid));
      const rsiLast  = Math.max(...rsiSeries.slice(rsiMid));
      const rsiFirstL = Math.min(...rsiSeries.slice(0, rsiMid));
      const rsiLastL  = Math.min(...rsiSeries.slice(rsiMid));

      if (priceHighSecond > priceHighFirst * 1.005 && rsiLast < rsiFirst - 2) {
        divergences.push({ type: 'bearish', indicator: 'RSI', strength: 'medium',
          signal: 'Harga buat Higher High tapi RSI buat Lower High — momentum melemah' });
      }
      if (priceLowSecond < priceLowFirst * 0.995 && rsiLastL > rsiFirstL + 2) {
        divergences.push({ type: 'bullish', indicator: 'RSI', strength: 'high',
          signal: 'Harga buat Lower Low tapi RSI buat Higher Low — momentum menguat, potensi reversal' });
      }
    }
  }

  // MACD histogram divergence
  if (macdData && macdData.histogram != null) {
    const last5avg    = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const prev5avg    = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const priceUp     = last5avg > prev5avg * 1.015;
    const priceDown   = last5avg < prev5avg * 0.985;

    if (priceUp && macdData.histogram < 0) {
      divergences.push({ type: 'bearish', indicator: 'MACD', strength: 'medium',
        signal: 'Harga naik tapi MACD histogram negatif — momentum tidak mendukung' });
    }
    if (priceDown && macdData.histogram > 0) {
      divergences.push({ type: 'bullish', indicator: 'MACD', strength: 'medium',
        signal: 'Harga turun tapi MACD histogram positif — momentum mulai berbalik' });
    }
  }

  if (!divergences.length) return { detected: false, divergences: [] };

  const hasBullish = divergences.some(d => d.type === 'bullish');
  const hasBearish = divergences.some(d => d.type === 'bearish');

  return {
    detected:    true,
    divergences,
    summary:     hasBullish && hasBearish ? 'Mixed divergence'
               : hasBullish ? 'Bullish divergence — potensi reversal naik'
               : 'Bearish divergence — potensi reversal turun',
    bias:        hasBullish && !hasBearish ? 'bullish'
               : hasBearish && !hasBullish ? 'bearish'
               : 'mixed'
  };
}

// ══════════════════════════════════════════════════════════════════
// CANDLESTICK PATTERNS dengan konfirmasi konteks
// FIX: cek trend sebelumnya sebelum label pola sebagai valid
// ══════════════════════════════════════════════════════════════════
function candlestickPatterns(candles) {
  if (!candles || candles.length < 5) return { patterns: [], topPattern: null };

  const patterns = [];
  const last  = candles[candles.length - 1];
  const prev  = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const body    = c => Math.abs(c.close - (c.open != null ? c.open : c.close));
  const range   = c => (c.high - c.low) || 1;
  const upper   = c => c.high - Math.max(c.close, c.open != null ? c.open : c.close);
  const lower   = c => Math.min(c.close, c.open != null ? c.open : c.close) - c.low;
  const isGreen = c => c.close >= (c.open != null ? c.open : c.close);
  const isRed   = c => c.close < (c.open != null ? c.open : c.close);

  // Cek konteks: apakah 5 candle sebelumnya downtrend atau uptrend
  const ctx5 = candles.slice(-6, -1);
  const ctxCloses = ctx5.map(c => c.close);
  const isDowntrend = ctxCloses[0] > ctxCloses[ctxCloses.length - 1] * 1.01;
  const isUptrend   = ctxCloses[0] < ctxCloses[ctxCloses.length - 1] * 0.99;

  // ── Hammer: hanya valid setelah downtrend ──────────────────────
  if (lower(last) > body(last) * 2 && upper(last) < body(last) * 0.5 && isDowntrend) {
    patterns.push({ name: 'Hammer', type: 'bullish', strength: 'medium',
      signal: 'Hammer setelah downtrend — buyer mengambil alih di low. Tunggu konfirmasi candle hijau.' });
  }

  // ── Shooting Star: hanya valid setelah uptrend ─────────────────
  if (upper(last) > body(last) * 2 && lower(last) < body(last) * 0.5 && isUptrend) {
    patterns.push({ name: 'Shooting Star', type: 'bearish', strength: 'medium',
      signal: 'Shooting Star setelah uptrend — seller dominasi di high. Waspadai reversal.' });
  }

  // ── Bullish Engulfing: candle hijau besar menelan candle merah ─
  if (isGreen(last) && isRed(prev) &&
      last.close > (prev.open != null ? prev.open : prev.close) &&
      (last.open != null ? last.open : last.close) < prev.close &&
      body(last) > body(prev) * 1.1) {
    patterns.push({ name: 'Bullish Engulfing', type: 'bullish', strength: 'high',
      signal: 'Bullish Engulfing — momentum beli menelan tekanan jual. Sinyal reversal kuat.' });
  }

  // ── Bearish Engulfing ──────────────────────────────────────────
  if (isRed(last) && isGreen(prev) &&
      last.close < (prev.open != null ? prev.open : prev.close) &&
      (last.open != null ? last.open : prev.close) > prev.close &&
      body(last) > body(prev) * 1.1) {
    patterns.push({ name: 'Bearish Engulfing', type: 'bearish', strength: 'high',
      signal: 'Bearish Engulfing — tekanan jual menelan momentum beli. Sinyal reversal kuat.' });
  }

  // ── Morning Star: hanya valid setelah downtrend ────────────────
  if (isRed(prev2) && body(prev) < body(prev2) * 0.5 && isGreen(last) &&
      last.close > (prev2.open != null ? prev2.open : prev2.close + prev2.close) / 2 &&
      isDowntrend) {
    patterns.push({ name: 'Morning Star', type: 'bullish', strength: 'high',
      signal: 'Morning Star setelah downtrend — reversal bullish 3 candle. Sinyal kuat.' });
  }

  // ── Evening Star: hanya valid setelah uptrend ──────────────────
  if (isGreen(prev2) && body(prev) < body(prev2) * 0.5 && isRed(last) &&
      last.close < (prev2.open != null ? prev2.open : prev2.close + prev2.close) / 2 &&
      isUptrend) {
    patterns.push({ name: 'Evening Star', type: 'bearish', strength: 'high',
      signal: 'Evening Star setelah uptrend — reversal bearish 3 candle. Sinyal kuat.' });
  }

  // ── Marubozu: momentum kuat tanpa wick ────────────────────────
  if (body(last) / range(last) > 0.92) {
    const isBull = isGreen(last);
    patterns.push({
      name:     isBull ? 'Bullish Marubozu' : 'Bearish Marubozu',
      type:     isBull ? 'bullish' : 'bearish',
      strength: 'high',
      signal:   isBull ? 'Bullish Marubozu — momentum beli sangat kuat sepanjang sesi.'
                       : 'Bearish Marubozu — momentum jual sangat kuat sepanjang sesi.'
    });
  }

  // ── Inside Bar: konsolidasi sebelum breakout ───────────────────
  if (last.high < prev.high && last.low > prev.low) {
    patterns.push({ name: 'Inside Bar', type: 'neutral', strength: 'medium',
      signal: 'Inside Bar — konsolidasi. Breakout dari range ini akan menjadi sinyal kuat.' });
  }

  const topPattern = patterns
    .sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.strength] || 0) - ({ high: 3, medium: 2, low: 1 }[a.strength] || 0))[0]
    || null;

  return {
    patterns,
    topPattern,
    hasBullish: patterns.some(p => p.type === 'bullish'),
    hasBearish: patterns.some(p => p.type === 'bearish'),
    summary:    patterns.length ? patterns.map(p => p.name).join(', ') : 'Tidak ada pola signifikan'
  };
}

// ══════════════════════════════════════════════════════════════════
// RELATIVE STRENGTH vs market (proxy IBD RS Rating)
// ══════════════════════════════════════════════════════════════════
function relativeStrength(candles, period) {
  period = period || 20;
  if (!candles || candles.length < period + 1) return null;

  const recent  = candles.slice(-(period + 1));
  const closes  = recent.map(c => c.close);
  const stockReturn = (closes[closes.length - 1] - closes[0]) / closes[0] * 100;

  const upDays = [], downDays = [];
  for (let i = 1; i < closes.length; i++) {
    const ret = (closes[i] - closes[i - 1]) / closes[i - 1] * 100;
    if (ret > 0) upDays.push(ret);
    else         downDays.push(Math.abs(ret));
  }

  const avgUp   = upDays.length   ? upDays.reduce((a, b) => a + b, 0)   / upDays.length   : 0;
  const avgDown = downDays.length ? downDays.reduce((a, b) => a + b, 0) / downDays.length : 0;
  const rsRatio = avgDown === 0 ? 100 : (avgUp / avgDown);
  const rsScore = Math.round(Math.min(100, Math.max(0, rsRatio / (rsRatio + 1) * 100)));
  const upDayPct = Math.round(upDays.length / period * 100);

  return {
    stockReturn: parseFloat(stockReturn.toFixed(2)),
    rsScore,
    upDayPct,
    trend:  rsScore >= 60 ? 'outperform' : rsScore >= 40 ? 'inline' : 'underperform',
    label:  rsScore >= 70 ? 'Saham kuat — konsisten outperform'
          : rsScore >= 50 ? 'Saham netral — inline dengan market'
          : 'Saham lemah — underperform market',
    narrative: `Return ${period}h: ${stockReturn > 0 ? '+' : ''}${stockReturn.toFixed(1)}% | RS: ${rsScore}/100 | ${upDayPct}% hari naik`
  };
}

// ══════════════════════════════════════════════════════════════════
// COMPUTE ALL — gabungkan semua indikator
// Hapus: Stochastic, MFI standalone, Pivot Points (redundan)
// Tambah: RVOL, 52w position, OBV di sini
// ══════════════════════════════════════════════════════════════════
function computeAll(candles) {
  if (!candles || candles.length < 5) return {};

  const closes  = candles.map(c => c.close);
  const current = closes[closes.length - 1];

  const ma20     = sma(closes, 20);
  const ma50     = sma(closes, 50);
  const ema9     = ema(closes, 9);
  const rsi14    = rsi(closes, 14);
  const macdData = macd(closes);
  const bb       = bollingerBands(closes, 20);
  const atrData  = atr(candles, 14);
  const srLevels = supportResistance(candles);
  const maCross  = maCrossover(closes);
  const strength = trendStrength(candles, 14);
  const obvData  = obv(candles);

  const rvolData   = candles.length >= 21 ? relativeVolume(candles, 20)               : null;
  const pos52w     = candles.length >= 10 ? position52w(candles)                       : null;
  const divData    = candles.length >= 20 ? detectDivergence(candles, rsi14, macdData) : null;
  const fibData    = candles.length >= 10 ? fibonacci(candles, 60)                     : null;
  const csPatterns = candles.length >= 5  ? candlestickPatterns(candles)               : null;
  const rsData     = candles.length >= 21 ? relativeStrength(candles, 20)              : null;

  // Trend summary
  const bullCount = [
    maCross.aboveMA20,
    maCross.aboveMA50,
    maCross.ma20vs50 === 'bullish_alignment',
    macdData && macdData.trend === 'bullish',
    rsi14 != null && rsi14 > 50
  ].filter(Boolean).length;
  const trend = bullCount >= 4 ? 'bullish' : bullCount <= 1 ? 'bearish' : 'neutral';

  return {
    price: {
      current,
      change:    closes.length > 1 ? current - closes[closes.length - 2] : 0,
      changePct: closes.length > 1
        ? parseFloat(((current - closes[closes.length - 2]) / closes[closes.length - 2] * 100).toFixed(2))
        : 0,
    },
    ma:           { ma20, ma50, ema9, ...maCross },
    rsi:          rsi14,
    macd:         macdData,
    bb,
    atr:          atrData,
    levels:       srLevels,
    trend:        strength,
    trendSummary: trend,
    obv:          obvData,
    rvol:         rvolData,
    position52w:  pos52w,
    divergence:   divData,
    fibonacci:    fibData,
    candlestick:  csPatterns,
    relStrength:  rsData,
  };
}

module.exports = {
  sma, ema, rsi, macd, bollingerBands, atr,
  supportResistance, maCrossover, trendStrength,
  obv, relativeVolume, position52w,
  detectDivergence, fibonacci, candlestickPatterns,
  relativeStrength,
  computeAll
};
