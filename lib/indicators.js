// ══════════════════════════════════════════════════════════════════
// lib/indicators.js — Engine Indikator Teknikal Matematis
// TIDAK ada AI di sini. Semua dihitung deterministik.
// ══════════════════════════════════════════════════════════════════

/**
 * Simple Moving Average
 * @param {number[]} closes
 * @param {number} period
 * @returns {number|null}
 */
function sma(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null && !isNaN(v));
  if (slice.length < period) return null;
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

/**
 * Exponential Moving Average (Wilder's method)
 * @param {number[]} closes
 * @param {number} period
 * @returns {number|null}
 */
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

/**
 * RSI — Wilder's Smoothed Method (standar industri)
 * @param {number[]} closes
 * @param {number} period default 14
 * @returns {number|null}
 */
function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] == null || closes[i - 1] == null) continue;
    changes.push(closes[i] - closes[i - 1]);
  }

  if (changes.length < period) return null;

  // Seed: simple avg gain/loss pada periode pertama
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing untuk sisa data
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

/**
 * MACD — Moving Average Convergence Divergence
 * @param {number[]} closes
 * @param {number} fastPeriod default 12
 * @param {number} slowPeriod default 26
 * @param {number} signalPeriod default 9
 * @returns {{ macd: number, signal: number, histogram: number, trend: string }|null}
 */
function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!closes || closes.length < slowPeriod + signalPeriod) return null;

  // Hitung EMA series untuk MACD line
  const macdLine = [];
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);

  let emaFast = closes.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let emaSlow = closes.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;

  for (let i = slowPeriod; i < closes.length; i++) {
    // Update fast EMA dari index fastPeriod
    for (let j = fastPeriod; j <= i; j++) {
      emaFast = closes[j] * kFast + emaFast * (1 - kFast);
    }
    emaSlow = closes[i] * kSlow + emaSlow * (1 - kSlow);
    macdLine.push(emaFast - emaSlow);
    break; // hanya butuh yang terakhir untuk efisiensi
  }

  // Hitung ulang secara proper untuk semua titik
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

  const kSignal = 2 / (signalPeriod + 1);
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

/**
 * Bollinger Bands
 * @param {number[]} closes
 * @param {number} period default 20
 * @param {number} multiplier default 2
 * @returns {{ upper: number, middle: number, lower: number, bandwidth: number, position: string }|null}
 */
function bollingerBands(closes, period = 20, multiplier = 2) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null);
  if (slice.length < period) return null;

  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const stddev = Math.sqrt(variance);

  const upper = Math.round(middle + multiplier * stddev);
  const lower = Math.round(middle - multiplier * stddev);
  const last  = closes[closes.length - 1];
  const bandwidth = parseFloat(((upper - lower) / middle * 100).toFixed(2));

  // Posisi harga dalam band (0% = lower, 100% = upper)
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

/**
 * ATR — Average True Range (Wilder)
 * @param {{ high: number, low: number, close: number }[]} candles
 * @param {number} period default 14
 * @returns {{ atr: number, atrPct: number }|null}
 */
function atr(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const trValues = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close)
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

/**
 * Stochastic Oscillator
 * @param {{ high: number, low: number, close: number }[]} candles
 * @param {number} kPeriod default 14
 * @param {number} dPeriod default 3
 * @returns {{ k: number, d: number, signal: string }|null}
 */
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
    k,
    d,
    signal: k < 20 && d < 20 ? 'oversold'
          : k > 80 && d > 80 ? 'overbought'
          : k > d             ? 'bullish'
          : 'bearish'
  };
}

/**
 * Support & Resistance levels dari pivot points
 * @param {{ high: number, low: number, close: number }[]} candles
 * @returns {{ support: number[], resistance: number[], pivot: number }}
 */
function supportResistance(candles) {
  if (!candles || candles.length < 10) return { support: [], resistance: [], pivot: 0 };

  const recent = candles.slice(-30);
  const pivotCandidates = [];

  // Deteksi swing highs & lows dengan lookback 3
  for (let i = 3; i < recent.length - 3; i++) {
    const c = recent[i];
    const isSwingHigh = recent.slice(i - 3, i).every(x => x.high <= c.high)
                     && recent.slice(i + 1, i + 4).every(x => x.high <= c.high);
    const isSwingLow  = recent.slice(i - 3, i).every(x => x.low >= c.low)
                     && recent.slice(i + 1, i + 4).every(x => x.low >= c.low);
    if (isSwingHigh) pivotCandidates.push({ type: 'resistance', price: c.high });
    if (isSwingLow)  pivotCandidates.push({ type: 'support',    price: c.low });
  }

  // Classic pivot (High + Low + Close) / 3 dari candle terakhir
  const last = recent[recent.length - 1];
  const pivot = Math.round((last.high + last.low + last.close) / 3);

  // Cluster level yang berdekatan (dalam 1%)
  const cluster = (levels, type) => {
    const sorted = levels.map(l => l.price).sort((a, b) => a - b);
    const clusters = [];
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - group[group.length - 1]) / group[group.length - 1] < 0.01) {
        group.push(sorted[i]);
      } else {
        clusters.push(Math.round(group.reduce((a, b) => a + b) / group.length));
        group = [sorted[i]];
      }
    }
    if (group.length) clusters.push(Math.round(group.reduce((a, b) => a + b) / group.length));
    return clusters.slice(-3); // ambil 3 level terdekat
  };

  const supports    = pivotCandidates.filter(p => p.type === 'support');
  const resistances = pivotCandidates.filter(p => p.type === 'resistance');

  return {
    support:    supports.length ? cluster(supports, 'support') : [],
    resistance: resistances.length ? cluster(resistances, 'resistance') : [],
    pivot
  };
}

/**
 * MA Crossover Detection
 * @param {number[]} closes
 * @returns {{ type: string|null, ma20: number, ma50: number, aboveMA20: boolean, aboveMA50: boolean }}
 */
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
    type:       crossType,
    ma20:       ma20Now,
    ma50:       ma50Now,
    aboveMA20:  last > ma20Now,
    aboveMA50:  last > ma50Now,
    ma20vs50:   ma20Now > ma50Now ? 'bullish_alignment' : 'bearish_alignment'
  };
}

/**
 * Trend Strength menggunakan ADX sederhana
 * @param {{ high: number, low: number, close: number }[]} candles
 * @param {number} period default 14
 * @returns {{ adx: number, trend: string, strength: string }|null}
 */
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
    for (let i = period; i < arr.length; i++) {
      s = s - s / period + arr[i];
      res.push(s);
    }
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

/**
 * Gabungkan semua indikator dari data OHLCV
 * @param {{ date: string, open?: number, high: number, low: number, close: number, volume: number }[]} candles
 * @returns {Object} semua indikator yang sudah dihitung
 */
function computeAll(candles) {
  if (!candles || candles.length < 5) return {};

  const closes  = candles.map(c => c.close);
  const current = closes[closes.length - 1];

  const ma20      = sma(closes, 20);
  const ma50      = sma(closes, 50);
  const ema12     = ema(closes, 12);
  const ema26     = ema(closes, 26);
  const rsi14     = rsi(closes, 14);
  const macdData  = macd(closes);
  const bb        = bollingerBands(closes, 20);
  const atrData   = atr(candles, 14);
  const stoch     = stochastic(candles, 14, 3);
  const srLevels  = supportResistance(candles);
  const maCross   = maCrossover(closes);
  const strength  = trendStrength(candles, 14);

  return {
    price: {
      current,
      change:    closes.length > 1 ? current - closes[closes.length - 2] : 0,
      changePct: closes.length > 1
        ? parseFloat(((current - closes[closes.length - 2]) / closes[closes.length - 2] * 100).toFixed(2))
        : 0,
    },
    ma:     { ma20, ma50, ema12, ema26, ...maCross },
    rsi:    rsi14,
    macd:   macdData,
    bb,
    atr:    atrData,
    stoch,
    levels: srLevels,
    trend:  strength,
  };
}

module.exports = { sma, ema, rsi, macd, bollingerBands, atr, stochastic, supportResistance, maCrossover, trendStrength, computeAll };
