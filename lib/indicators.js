// ══════════════════════════════════════════════════════════════════
// lib/indicators.js — Engine Indikator Teknikal Matematis
// TIDAK ada AI di sini. Semua dihitung deterministik.
// ══════════════════════════════════════════════════════════════════

// ── EXISTING: SMA ─────────────────────────────────────────────────
function sma(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null && !isNaN(v));
  if (slice.length < period) return null;
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

// ── EXISTING: EMA ─────────────────────────────────────────────────
function ema(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    if (closes[i] == null) continue;
    emaVal = closes[i] * k + emaVal * (1 - k);
  }
  return Math.round(emaVal);
}

// ── EXISTING: RSI ─────────────────────────────────────────────────
function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] == null || closes[i - 1] == null) continue;
    changes.push(closes[i] - closes[i - 1]);
  }
  if (changes.length < period) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
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

// ── EXISTING: MACD ────────────────────────────────────────────────
function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!closes || closes.length < slowPeriod + signalPeriod) return null;
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
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
  for (let i = signalPeriod; i < macdSeries.length; i++) {
    signalVal = macdSeries[i] * kSignal + signalVal * (1 - kSignal);
  }
  const macdVal = macdSeries[macdSeries.length - 1];
  const histogram = macdVal - signalVal;
  const prevHistogram = macdSeries.length > 1
    ? macdSeries[macdSeries.length - 2] - signalVal
    : histogram;
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

// ── EXISTING: Bollinger Bands ──────────────────────────────────────
function bollingerBands(closes, period = 20, multiplier = 2) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null);
  if (slice.length < period) return null;
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const stddev = Math.sqrt(variance);
  const upper = Math.round(middle + multiplier * stddev);
  const lower = Math.round(middle - multiplier * stddev);
  const last = closes[closes.length - 1];
  const bandwidth = parseFloat(((upper - lower) / middle * 100).toFixed(2));
  const bandPct = upper === lower ? 50 : Math.round((last - lower) / (upper - lower) * 100);
  return {
    upper,
    middle: Math.round(middle),
    lower,
    bandwidth,
    bandPct,
    position: bandPct > 80 ? 'overbought_zone'
            : bandPct < 20 ? 'oversold_zone'
            : 'neutral_zone'
  };
}

// ── EXISTING: ATR ─────────────────────────────────────────────────
function atr(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trValues = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trValues.push(tr);
  }
  if (trValues.length < period) return null;
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

// ── EXISTING: Stochastic ──────────────────────────────────────────
function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  if (!candles || candles.length < kPeriod) return null;
  const kValues = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest  = Math.min(...slice.map(c => c.low));
    const k = highest === lowest ? 50 : (candles[i].close - lowest) / (highest - lowest) * 100;
    kValues.push(k);
  }
  const k = Math.round(kValues[kValues.length - 1]);
  const dSlice = kValues.slice(-dPeriod);
  const d = Math.round(dSlice.reduce((a, b) => a + b, 0) / dSlice.length);
  return {
    k, d,
    signal: k < 20 && d < 20 ? 'oversold'
          : k > 80 && d > 80 ? 'overbought'
          : k > d             ? 'bullish'
          : 'bearish'
  };
}

// ── EXISTING: Support & Resistance ────────────────────────────────
function supportResistance(candles) {
  if (!candles || candles.length < 10) return { support: [], resistance: [], pivot: 0 };
  const recent = candles.slice(-30);
  const pivotCandidates = [];
  for (let i = 3; i < recent.length - 3; i++) {
    const c = recent[i];
    const isSwingHigh = recent.slice(i - 3, i).every(x => x.high <= c.high)
                     && recent.slice(i + 1, i + 4).every(x => x.high <= c.high);
    const isSwingLow  = recent.slice(i - 3, i).every(x => x.low >= c.low)
                     && recent.slice(i + 1, i + 4).every(x => x.low >= c.low);
    if (isSwingHigh) pivotCandidates.push({ type: 'resistance', price: c.high });
    if (isSwingLow)  pivotCandidates.push({ type: 'support',    price: c.low });
  }
  const last = recent[recent.length - 1];
  const pivot = Math.round((last.high + last.low + last.close) / 3);
  const cluster = (levels) => {
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
  };
  const supports    = pivotCandidates.filter(p => p.type === 'support');
  const resistances = pivotCandidates.filter(p => p.type === 'resistance');
  return {
    support:    supports.length ? cluster(supports) : [],
    resistance: resistances.length ? cluster(resistances) : [],
    pivot
  };
}

// ── EXISTING: MA Crossover ────────────────────────────────────────
function maCrossover(closes) {
  if (!closes || closes.length < 52) {
    return { type: null, ma20: null, ma50: null, aboveMA20: false, aboveMA50: false };
  }
  const ma20Now  = sma(closes, 20);
  const ma50Now  = sma(closes, 50);
  const ma20Prev = sma(closes.slice(0, -1), 20);
  const ma50Prev = sma(closes.slice(0, -1), 50);
  const last = closes[closes.length - 1];
  let crossType = null;
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

// ── EXISTING: Trend Strength (ADX) ────────────────────────────────
function trendStrength(candles, period = 14) {
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
  const adxVal = Math.round(dx.slice(-period).reduce((a, b) => a + b, 0) / period);
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

// ══════════════════════════════════════════════════════════════════
// NEW 1: MFI — Money Flow Index (RSI berbasis volume)
// Lebih akurat dari RSI karena mempertimbangkan volume
// ══════════════════════════════════════════════════════════════════
function mfi(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
  const rawMF = typicalPrices.map((tp, i) => ({
    tp,
    volume: candles[i].volume || 0,
    mf:     tp * (candles[i].volume || 0),
    isUp:   i > 0 ? tp >= typicalPrices[i - 1] : true
  }));

  const recent = rawMF.slice(-period);
  let posMF = 0, negMF = 0;
  recent.forEach(d => {
    if (d.isUp) posMF += d.mf;
    else        negMF += d.mf;
  });

  if (negMF === 0) return { mfi: 100, signal: 'overbought' };
  const mfRatio = posMF / negMF;
  const mfiVal  = Math.round(100 - 100 / (1 + mfRatio));

  return {
    mfi:    mfiVal,
    signal: mfiVal > 80 ? 'overbought'
          : mfiVal < 20 ? 'oversold'
          : mfiVal > 50 ? 'bullish'
          : 'bearish',
    // Divergence hint: MFI oversold tapi price masih turun = akumulasi
    divergenceHint: mfiVal < 30 ? 'possible_accumulation'
                  : mfiVal > 70 ? 'possible_distribution'
                  : null
  };
}

// ══════════════════════════════════════════════════════════════════
// NEW 2: Divergence Detection (RSI & MACD vs Price)
// Sinyal reversal paling powerful — wajib untuk trader pro
// ══════════════════════════════════════════════════════════════════
function detectDivergence(candles, rsiValues, macdData) {
  if (!candles || candles.length < 20) return null;

  const recent    = candles.slice(-20);
  const closes    = recent.map(c => c.close);
  const last      = closes.length - 1;
  const midpoint  = Math.floor(closes.length / 2);

  // Harga: high/low di paruh pertama vs paruh kedua
  const priceHighFirst  = Math.max(...closes.slice(0, midpoint));
  const priceHighSecond = Math.max(...closes.slice(midpoint));
  const priceLowFirst   = Math.min(...closes.slice(0, midpoint));
  const priceLowSecond  = Math.min(...closes.slice(midpoint));

  const divergences = [];

  // RSI divergence
  if (rsiValues != null) {
    // Butuh RSI series — hitung ulang untuk recent candles
    const recentCloses = recent.map(c => c.close);
    const rsiRecent    = [];
    for (let i = 14; i <= recentCloses.length; i++) {
      const val = rsi(recentCloses.slice(0, i), 14);
      if (val != null) rsiRecent.push(val);
    }

    if (rsiRecent.length >= 2) {
      const rsiMid   = Math.floor(rsiRecent.length / 2);
      const rsiFirst = Math.max(...rsiRecent.slice(0, rsiMid));
      const rsiLast  = Math.max(...rsiRecent.slice(rsiMid));
      const rsiFirstL = Math.min(...rsiRecent.slice(0, rsiMid));
      const rsiLastL  = Math.min(...rsiRecent.slice(rsiMid));

      // Bearish divergence: harga HH tapi RSI LH
      if (priceHighSecond > priceHighFirst && rsiLast < rsiFirst) {
        divergences.push({
          type:      'bearish',
          indicator: 'RSI',
          signal:    'Harga buat Higher High tapi RSI buat Lower High — momentum melemah, waspadai reversal turun',
          strength:  'medium'
        });
      }
      // Bullish divergence: harga LL tapi RSI HL
      if (priceLowSecond < priceLowFirst && rsiLastL > rsiFirstL) {
        divergences.push({
          type:      'bullish',
          indicator: 'RSI',
          signal:    'Harga buat Lower Low tapi RSI buat Higher Low — momentum menguat, potensi reversal naik',
          strength:  'high'
        });
      }
    }
  }

  // MACD histogram divergence
  if (macdData && macdData.histogram != null) {
    const currentClose = closes[last];
    const prevClose    = closes[Math.max(0, last - 5)];
    const hist         = macdData.histogram;

    // Harga naik tapi histogram mengecil = bearish divergence
    if (currentClose > prevClose * 1.02 && hist < 0) {
      divergences.push({
        type:      'bearish',
        indicator: 'MACD',
        signal:    'Harga naik tapi MACD histogram negatif — momentum tidak mendukung kenaikan',
        strength:  'medium'
      });
    }
    // Harga turun tapi histogram membesar ke arah positif = bullish divergence
    if (currentClose < prevClose * 0.98 && hist > 0) {
      divergences.push({
        type:      'bullish',
        indicator: 'MACD',
        signal:    'Harga turun tapi MACD histogram positif — momentum mulai berbalik naik',
        strength:  'medium'
      });
    }
  }

  if (!divergences.length) return { detected: false, divergences: [] };

  const hasBullish = divergences.some(d => d.type === 'bullish');
  const hasBearish = divergences.some(d => d.type === 'bearish');

  return {
    detected:   true,
    divergences,
    summary:    hasBullish && hasBearish ? 'Mixed divergence — sinyal bertentangan'
              : hasBullish ? 'Bullish divergence — potensi reversal naik'
              : 'Bearish divergence — potensi reversal turun',
    bias:       hasBullish && !hasBearish ? 'bullish'
              : hasBearish && !hasBullish ? 'bearish'
              : 'mixed'
  };
}

// ══════════════════════════════════════════════════════════════════
// NEW 3: Fibonacci Retracement & Extension
// Level 23.6%, 38.2%, 50%, 61.8%, 78.6% — acuan entry/exit pro
// ══════════════════════════════════════════════════════════════════
function fibonacci(candles, lookback = 50) {
  if (!candles || candles.length < 10) return null;

  const recent   = candles.slice(-Math.min(lookback, candles.length));
  const high     = Math.max(...recent.map(c => c.high));
  const low      = Math.min(...recent.map(c => c.low));
  const diff     = high - low;
  const current  = candles[candles.length - 1].close;

  if (diff === 0) return null;

  // Retracement levels (dari high ke low)
  const levels = {
    r0:    Math.round(high),
    r236:  Math.round(high - diff * 0.236),
    r382:  Math.round(high - diff * 0.382),
    r50:   Math.round(high - diff * 0.500),
    r618:  Math.round(high - diff * 0.618),
    r786:  Math.round(high - diff * 0.786),
    r100:  Math.round(low),
    // Extension levels (target di atas high)
    e1272: Math.round(high + diff * 0.272),
    e1618: Math.round(high + diff * 0.618),
  };

  // Cari level terdekat dengan harga sekarang
  const retraceLevels = [levels.r236, levels.r382, levels.r50, levels.r618, levels.r786];
  const nearestLevel  = retraceLevels.reduce((prev, curr) =>
    Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev
  );

  // Posisi harga relatif ke range
  let position = ((current - low) / diff * 100).toFixed(1);

  // Level support/resistance Fibonacci terdekat
  const nearSupport    = retraceLevels.filter(l => l <= current).sort((a, b) => b - a)[0] || low;
  const nearResistance = retraceLevels.filter(l => l > current).sort((a, b) => a - b)[0] || high;

  return {
    high:          Math.round(high),
    low:           Math.round(low),
    levels,
    nearestLevel,
    nearSupport,
    nearResistance,
    positionPct:   parseFloat(position),
    // Di mana harga sekarang relatif ke Fib
    zone: parseFloat(position) > 76 ? 'near_high'
        : parseFloat(position) > 58 ? 'between_618_786'
        : parseFloat(position) > 45 ? 'near_50pct'
        : parseFloat(position) > 33 ? 'between_382_50'
        : parseFloat(position) > 20 ? 'between_236_382'
        : 'near_low',
    // Apakah harga di dekat level Fibonacci penting (dalam 1.5%)
    atKeyLevel: Math.abs(current - nearestLevel) / current < 0.015,
    narrative:  `Harga di ${position}% dari range ${Math.round(low).toLocaleString('id-ID')}–${Math.round(high).toLocaleString('id-ID')}. Support Fib terdekat: ${nearSupport.toLocaleString('id-ID')}, Resistance: ${nearResistance.toLocaleString('id-ID')}`
  };
}

// ══════════════════════════════════════════════════════════════════
// NEW 4: Candlestick Pattern Recognition
// Doji, Hammer, Engulfing, Morning/Evening Star, Shooting Star
// ══════════════════════════════════════════════════════════════════
function candlestickPatterns(candles) {
  if (!candles || candles.length < 3) return { patterns: [], summary: 'Data tidak cukup' };

  const patterns = [];
  const last  = candles[candles.length - 1];
  const prev  = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const body    = c => Math.abs(c.close - (c.open || c.close));
  const range   = c => c.high - c.low || 1;
  const upper   = c => c.high - Math.max(c.close, c.open || c.close);
  const lower   = c => Math.min(c.close, c.open || c.close) - c.low;
  const isGreen = c => c.close >= (c.open || c.close);
  const isRed   = c => c.close < (c.open || c.close);

  // ── DOJI: body sangat kecil < 5% dari range ──────────────────
  if (body(last) / range(last) < 0.05) {
    patterns.push({
      name:      'Doji',
      type:      'neutral',
      candles:   1,
      signal:    'Ketidakpastian — buyer dan seller seimbang. Perhatikan candle berikutnya untuk konfirmasi arah.',
      strength:  'low'
    });
  }

  // ── HAMMER: lower wick panjang, body kecil, di downtrend ─────
  if (lower(last) > body(last) * 2 && upper(last) < body(last) * 0.5 && isRed(prev)) {
    patterns.push({
      name:      'Hammer',
      type:      'bullish',
      candles:   1,
      signal:    'Hammer — buyer mengambil alih di low. Potensi reversal bullish jika dikonfirmasi candle hijau berikutnya.',
      strength:  'medium'
    });
  }

  // ── SHOOTING STAR: upper wick panjang, body kecil, di uptrend ─
  if (upper(last) > body(last) * 2 && lower(last) < body(last) * 0.5 && isGreen(prev)) {
    patterns.push({
      name:      'Shooting Star',
      type:      'bearish',
      candles:   1,
      signal:    'Shooting Star — seller mendominasi di high. Potensi reversal bearish, waspadai koreksi.',
      strength:  'medium'
    });
  }

  // ── BULLISH ENGULFING: candle hijau besar menelan candle merah ─
  if (isGreen(last) && isRed(prev) &&
      last.close > prev.open && last.open < prev.close &&
      body(last) > body(prev) * 1.1) {
    patterns.push({
      name:      'Bullish Engulfing',
      type:      'bullish',
      candles:   2,
      signal:    'Bullish Engulfing — momentum beli kuat menelan tekanan jual sebelumnya. Sinyal reversal bullish kuat.',
      strength:  'high'
    });
  }

  // ── BEARISH ENGULFING: candle merah besar menelan candle hijau ─
  if (isRed(last) && isGreen(prev) &&
      last.close < prev.open && last.open > prev.close &&
      body(last) > body(prev) * 1.1) {
    patterns.push({
      name:      'Bearish Engulfing',
      type:      'bearish',
      candles:   2,
      signal:    'Bearish Engulfing — tekanan jual kuat menelan momentum beli. Sinyal reversal bearish kuat.',
      strength:  'high'
    });
  }

  // ── MORNING STAR: 3 candle reversal bullish ───────────────────
  if (isRed(prev2) && body(prev) < body(prev2) * 0.5 && isGreen(last) &&
      last.close > (prev2.open + prev2.close) / 2) {
    patterns.push({
      name:      'Morning Star',
      type:      'bullish',
      candles:   3,
      signal:    'Morning Star — pola reversal 3 candle. Sinyal bullish kuat setelah downtrend.',
      strength:  'high'
    });
  }

  // ── EVENING STAR: 3 candle reversal bearish ───────────────────
  if (isGreen(prev2) && body(prev) < body(prev2) * 0.5 && isRed(last) &&
      last.close < (prev2.open + prev2.close) / 2) {
    patterns.push({
      name:      'Evening Star',
      type:      'bearish',
      candles:   3,
      signal:    'Evening Star — pola reversal 3 candle. Sinyal bearish kuat setelah uptrend.',
      strength:  'high'
    });
  }

  // ── MARUBOZU: body penuh tanpa wick (momentum kuat) ──────────
  if (body(last) / range(last) > 0.92) {
    const isBull = isGreen(last);
    patterns.push({
      name:      isBull ? 'Bullish Marubozu' : 'Bearish Marubozu',
      type:      isBull ? 'bullish' : 'bearish',
      candles:   1,
      signal:    isBull
        ? 'Bullish Marubozu — momentum beli sangat kuat, tidak ada tekanan jual sepanjang sesi.'
        : 'Bearish Marubozu — momentum jual sangat kuat, tidak ada perlawanan beli sepanjang sesi.',
      strength:  'high'
    });
  }

  // ── INSIDE BAR: range lebih kecil dari candle sebelumnya ──────
  if (last.high < prev.high && last.low > prev.low) {
    patterns.push({
      name:      'Inside Bar',
      type:      'neutral',
      candles:   2,
      signal:    'Inside Bar — konsolidasi dalam range candle sebelumnya. Breakout dari range ini = sinyal kuat.',
      strength:  'medium'
    });
  }

  const bullish = patterns.filter(p => p.type === 'bullish');
  const bearish = patterns.filter(p => p.type === 'bearish');

  return {
    patterns,
    hasBullish: bullish.length > 0,
    hasBearish: bearish.length > 0,
    topPattern: patterns.sort((a, b) => {
      const w = { high: 3, medium: 2, low: 1 };
      return (w[b.strength] || 0) - (w[a.strength] || 0);
    })[0] || null,
    summary: patterns.length === 0
      ? 'Tidak ada pola candlestick signifikan'
      : patterns.map(p => p.name).join(', ')
  };
}

// ══════════════════════════════════════════════════════════════════
// NEW 5: Relative Strength vs IHSG (proxy)
// Apakah saham ini lebih kuat atau lemah dari market?
// Dihitung dari perbandingan return saham vs IHSG proxy
// ══════════════════════════════════════════════════════════════════
function relativeStrength(candles, period = 20) {
  if (!candles || candles.length < period + 1) return null;

  const recent  = candles.slice(-(period + 1));
  const closes  = recent.map(c => c.close);

  // Return saham dalam periode
  const stockReturn = (closes[closes.length - 1] - closes[0]) / closes[0] * 100;

  // RS Score: berapa % saham ini bergerak
  // Tanpa data IHSG real, kita gunakan konsistensi upday vs downday
  // sebagai proxy relative strength (mirip IBD RS Rating)
  const upDays   = [];
  const downDays = [];
  for (let i = 1; i < closes.length; i++) {
    const ret = (closes[i] - closes[i - 1]) / closes[i - 1] * 100;
    if (ret > 0) upDays.push(ret);
    else         downDays.push(Math.abs(ret));
  }

  const avgUp   = upDays.length   ? upDays.reduce((a, b) => a + b, 0)   / upDays.length   : 0;
  const avgDown = downDays.length ? downDays.reduce((a, b) => a + b, 0) / downDays.length : 0;

  // RS Ratio — mirip RSI tapi untuk relative performance
  const rsRatio = avgDown === 0 ? 100 : (avgUp / avgDown);
  const rsScore = Math.round(Math.min(100, Math.max(0, rsRatio / (rsRatio + 1) * 100)));

  // Trend konsistensi: berapa hari naik dari total
  const upDayPct = Math.round(upDays.length / (period) * 100);

  return {
    stockReturn:  parseFloat(stockReturn.toFixed(2)),
    rsScore,      // 0-100, makin tinggi makin kuat
    upDayPct,     // % hari naik dari period
    trend: rsScore >= 60 ? 'outperform'
         : rsScore >= 40 ? 'inline'
         : 'underperform',
    label: rsScore >= 70 ? 'Saham kuat — konsisten outperform'
         : rsScore >= 50 ? 'Saham netral — inline dengan market'
         : 'Saham lemah — underperform market',
    narrative: `Return ${period}h: ${stockReturn > 0 ? '+' : ''}${stockReturn.toFixed(1)}% | RS Score: ${rsScore}/100 | ${upDayPct}% hari naik`
  };
}

// ══════════════════════════════════════════════════════════════════
// NEW 6: Pivot Points Classic (S1, S2, R1, R2)
// Level universal yang dipakai market maker dan institusi
// ══════════════════════════════════════════════════════════════════
function pivotPoints(candles) {
  if (!candles || candles.length < 2) return null;

  // Gunakan candle kemarin sebagai basis pivot
  const prev = candles[candles.length - 2];
  const H = prev.high, L = prev.low, C = prev.close;

  const P  = (H + L + C) / 3;
  const R1 = 2 * P - L;
  const S1 = 2 * P - H;
  const R2 = P + (H - L);
  const S2 = P - (H - L);
  const R3 = H + 2 * (P - L);
  const S3 = L - 2 * (H - P);

  const current = candles[candles.length - 1].close;

  // Posisi harga relatif ke pivot
  let position;
  if      (current > R2) position = 'above_R2';
  else if (current > R1) position = 'between_R1_R2';
  else if (current > P)  position = 'between_P_R1';
  else if (current > S1) position = 'between_S1_P';
  else if (current > S2) position = 'between_S2_S1';
  else                   position = 'below_S2';

  return {
    P:  Math.round(P),
    R1: Math.round(R1),
    R2: Math.round(R2),
    R3: Math.round(R3),
    S1: Math.round(S1),
    S2: Math.round(S2),
    S3: Math.round(S3),
    position,
    nearestSupport:    current > S1 ? Math.round(S1) : Math.round(S2),
    nearestResistance: current < R1 ? Math.round(R1) : Math.round(R2),
    narrative: `Pivot: ${Math.round(P).toLocaleString('id-ID')} | R1: ${Math.round(R1).toLocaleString('id-ID')} | S1: ${Math.round(S1).toLocaleString('id-ID')} | Posisi: ${position.replace(/_/g,' ')}`
  };
}

// ══════════════════════════════════════════════════════════════════
// COMPUTE ALL — gabungkan semua indikator
// ══════════════════════════════════════════════════════════════════
function computeAll(candles) {
  if (!candles || candles.length < 5) return {};

  const closes  = candles.map(c => c.close);
  const current = closes[closes.length - 1];

  const ma20     = sma(closes, 20);
  const ma50     = sma(closes, 50);
  const ema12    = ema(closes, 12);
  const ema26    = ema(closes, 26);
  const rsi14    = rsi(closes, 14);
  const macdData = macd(closes);
  const bb       = bollingerBands(closes, 20);
  const atrData  = atr(candles, 14);
  const stoch    = stochastic(candles, 14, 3);
  const srLevels = supportResistance(candles);
  const maCross  = maCrossover(closes);
  const strength = trendStrength(candles, 14);

  // NEW indicators
  const mfiData   = candles.length >= 15 ? mfi(candles, 14)               : null;
  const divData   = candles.length >= 20 ? detectDivergence(candles, rsi14, macdData) : null;
  const fibData   = candles.length >= 10 ? fibonacci(candles, 50)          : null;
  const csPatterns = candles.length >= 3  ? candlestickPatterns(candles)    : null;
  const rsData    = candles.length >= 21  ? relativeStrength(candles, 20)   : null;
  const pivots    = candles.length >= 2   ? pivotPoints(candles)             : null;

  return {
    price: {
      current,
      change:    closes.length > 1 ? current - closes[closes.length - 2] : 0,
      changePct: closes.length > 1
        ? parseFloat(((current - closes[closes.length - 2]) / closes[closes.length - 2] * 100).toFixed(2))
        : 0,
    },
    ma:          { ma20, ma50, ema12, ema26, ...maCross },
    rsi:         rsi14,
    macd:        macdData,
    bb,
    atr:         atrData,
    stoch,
    levels:      srLevels,
    trend:       strength,
    // NEW
    mfi:         mfiData,
    divergence:  divData,
    fibonacci:   fibData,
    candlestick: csPatterns,
    relStrength: rsData,
    pivots,
  };
}

module.exports = {
  sma, ema, rsi, macd, bollingerBands, atr, stochastic,
  supportResistance, maCrossover, trendStrength,
  // NEW exports
  mfi, detectDivergence, fibonacci, candlestickPatterns,
  relativeStrength, pivotPoints,
  computeAll
};
