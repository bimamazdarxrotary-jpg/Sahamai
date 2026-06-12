// ══════════════════════════════════════════════════════════════════
// lib/indicators.js — Engine Indikator Teknikal v4
// Set indikator yang fokus dan proven untuk IHSG swing trading
//
// TREND:     EMA9, SMA50, MA Crossover (EMA9/SMA50)
// MOMENTUM:  RSI14 (Wilder), MACD(12,26,9), Bollinger Bands(20,2)
// VOLATILITAS: ATR14 (Wilder)
// VOLUME:    RVOL (median-based), OBV, Smart Money Flow
// STRUKTUR:  Support/Resistance (swing-based), Fibonacci (swing-based), 52W Position
// SINYAL:    Divergence (RSI+MACD), Candlestick Patterns (dengan konteks)
// ══════════════════════════════════════════════════════════════════

// ── EMA ──────────────────────────────────────────────────────────
function ema(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  const valid = closes.filter(v => v != null && !isNaN(v));
  if (valid.length < period) return null;
  let emaVal = valid.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < valid.length; i++) {
    emaVal = valid[i] * k + emaVal * (1 - k);
  }
  return Math.round(emaVal);
}

// ── SMA ──────────────────────────────────────────────────────────
function sma(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null && !isNaN(v));
  if (slice.length < period) return null;
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

// ── MA CROSSOVER (EMA9 / SMA50) ───────────────────────────────────
// Crossover EMA9/SMA50 lebih sensitif dari MA20/MA50 untuk swing
function maCrossover(closes) {
  if (!closes || closes.length < 52) {
    return {
      type: null, ema9: null, sma50: null,
      aboveEMA9: false, aboveSMA50: false,
      alignment: 'unknown'
    };
  }
  const ema9Now   = ema(closes, 9);
  const sma50Now  = sma(closes, 50);
  const ema9Prev  = ema(closes.slice(0, -1), 9);
  const sma50Prev = sma(closes.slice(0, -1), 50);
  const last      = closes[closes.length - 1];

  let crossType = null;
  if (ema9Prev != null && sma50Prev != null) {
    if (ema9Now > sma50Now && ema9Prev <= sma50Prev) crossType = 'golden_cross';
    if (ema9Now < sma50Now && ema9Prev >= sma50Prev) crossType = 'death_cross';
  }

  return {
    type:       crossType,
    ema9:       ema9Now,
    sma50:      sma50Now,
    aboveEMA9:  last > ema9Now,
    aboveSMA50: last > sma50Now,
    alignment:  ema9Now > sma50Now ? 'bullish' : 'bearish',
    // backward compat fields
    ma20:       ema9Now,
    ma50:       sma50Now,
    aboveMA20:  last > ema9Now,
    aboveMA50:  last > sma50Now,
    ma20vs50:   ema9Now > sma50Now ? 'bullish_alignment' : 'bearish_alignment'
  };
}

// ── RSI dengan Wilder Smoothing (RMA) ────────────────────────────
// α = 1/period — identik dengan TradingView dan Bloomberg
function rsi(closes, period) {
  period = period || 14;
  if (!closes || closes.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] == null || closes[i-1] == null) continue;
    changes.push(closes[i] - closes[i-1]);
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
  return Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

// ── MACD (12, 26, 9) ─────────────────────────────────────────────
function macd(closes, fastPeriod, slowPeriod, signalPeriod) {
  fastPeriod   = fastPeriod   || 12;
  slowPeriod   = slowPeriod   || 26;
  signalPeriod = signalPeriod || 9;
  if (!closes || closes.length < slowPeriod + signalPeriod) return null;

  const kFast   = 2 / (fastPeriod + 1);
  const kSlow   = 2 / (slowPeriod + 1);
  const kSig    = 2 / (signalPeriod + 1);
  const series  = [];

  let ef = closes.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let es = closes.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
  for (let i = 1; i < fastPeriod; i++) ef = closes[i] * kFast + ef * (1 - kFast);

  for (let i = slowPeriod; i < closes.length; i++) {
    ef = closes[i] * kFast + ef * (1 - kFast);
    es = closes[i] * kSlow + es * (1 - kSlow);
    series.push(ef - es);
  }
  if (series.length < signalPeriod) return null;

  let sig = series.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
  let prevSig = sig;
  for (let i = signalPeriod; i < series.length; i++) {
    prevSig = sig;
    sig     = series[i] * kSig + sig * (1 - kSig);
  }

  const macdVal    = series[series.length - 1];
  const hist       = macdVal - sig;
  const prevMacd   = series.length > 1 ? series[series.length - 2] : macdVal;
  const prevHist   = prevMacd - prevSig;

  return {
    macd:      parseFloat(macdVal.toFixed(2)),
    signal:    parseFloat(sig.toFixed(2)),
    histogram: parseFloat(hist.toFixed(2)),
    trend:     macdVal > sig ? 'bullish' : 'bearish',
    crossover: hist > 0 && prevHist <= 0 ? 'golden_cross'
             : hist < 0 && prevHist >= 0 ? 'death_cross'
             : null
  };
}

// ── BOLLINGER BANDS (20, 2) ───────────────────────────────────────
function bollingerBands(closes, period, multiplier) {
  period     = period     || 20;
  multiplier = multiplier || 2;
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null);
  if (slice.length < period) return null;
  const mid   = slice.reduce((a, b) => a + b, 0) / period;
  const std   = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mid, 2), 0) / period);
  const upper = Math.round(mid + multiplier * std);
  const lower = Math.round(mid - multiplier * std);
  const last  = closes[closes.length - 1];
  const bw    = parseFloat(((upper - lower) / mid * 100).toFixed(2));
  const pct   = upper === lower ? 50 : Math.round((last - lower) / (upper - lower) * 100);
  return {
    upper, middle: Math.round(mid), lower,
    bandwidth: bw,
    bandPct:   pct,
    isSqueeze: bw < 5,
    position:  pct > 80 ? 'overbought_zone' : pct < 20 ? 'oversold_zone' : 'neutral_zone'
  };
}

// ── ATR (14) dengan Wilder Smoothing ─────────────────────────────
function atr(candles, period) {
  period = period || 14;
  if (!candles || candles.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i-1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  if (tr.length < period) return null;
  let atrVal = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    atrVal = (atrVal * (period - 1) + tr[i]) / period;
  }
  const last = candles[candles.length - 1].close;
  return { atr: Math.round(atrVal), atrPct: parseFloat((atrVal / last * 100).toFixed(2)) };
}

// ── RELATIVE VOLUME (RVOL) — median-based ────────────────────────
function relativeVolume(candles, period) {
  period = period || 20;
  if (!candles || candles.length < period + 1) return null;
  const vols   = candles.slice(-(period + 1), -1).map(c => c.volume || 0);
  const last   = candles[candles.length - 1];
  const sorted = vols.slice().sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid-1] + sorted[mid]) / 2 : sorted[mid];
  if (!median) return null;
  const rvol = parseFloat((last.volume / median).toFixed(2));
  return {
    rvol,
    pct:          Math.round(rvol * 100),
    medianVolume: Math.round(median),
    lastVolume:   last.volume || 0,
    label: rvol >= 3   ? 'Ekstrim (3x+)'
         : rvol >= 2   ? 'Sangat Tinggi (2x+)'
         : rvol >= 1.5 ? 'Tinggi (1.5x+)'
         : rvol >= 0.8 ? 'Normal'
         : 'Rendah (<0.8x)',
    isSpike:   rvol >= 2,
    intensity: rvol >= 3 ? 'extreme' : rvol >= 2 ? 'high' : rvol >= 1.5 ? 'medium' : 'low'
  };
}

// ── OBV (On Balance Volume) ───────────────────────────────────────
function obv(candles) {
  if (!candles || candles.length < 5) return null;
  let val = 0;
  const series = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { series.push(0); continue; }
    const c = candles[i], p = candles[i-1];
    if (c.close > p.close)      val += (c.volume || 0);
    else if (c.close < p.close) val -= (c.volume || 0);
    series.push(val);
  }
  const last10 = series.slice(-10);
  const trend  = last10[last10.length - 1] > last10[0] ? 'rising' : 'falling';
  const priceUp = candles[candles.length-1].close > candles[0].close;
  return {
    value:     val,
    trend,
    divergence: (trend === 'rising'  && !priceUp) ? 'bullish_divergence'
              : (trend === 'falling' &&  priceUp)  ? 'bearish_divergence'
              : null
  };
}

// ── SMART MONEY FLOW ─────────────────────────────────────────────
// Proxy: bandingkan close position dalam range candle terhadap volume
// Close di upper half = smart money buying, lower half = selling
function smartMoneyFlow(candles, period) {
  period = period || 20;
  if (!candles || candles.length < period) return null;
  const recent = candles.slice(-period);
  let buyVol = 0, sellVol = 0;
  for (const c of recent) {
    const range = c.high - c.low;
    if (!range || !c.volume) continue;
    const closePos = (c.close - c.low) / range; // 0–1, 1 = close di high
    if (closePos >= 0.5) buyVol  += c.volume * closePos;
    else                 sellVol += c.volume * (1 - closePos);
  }
  const total = buyVol + sellVol;
  if (!total) return null;
  const ratio = Math.round(buyVol / total * 100);
  return {
    ratio,
    buyVol:   Math.round(buyVol),
    sellVol:  Math.round(sellVol),
    bias:     ratio >= 65 ? 'strong_buying'
            : ratio >= 55 ? 'mild_buying'
            : ratio >= 45 ? 'neutral'
            : ratio >= 35 ? 'mild_selling'
            : 'strong_selling',
    label:    ratio >= 65 ? 'Smart money beli kuat'
            : ratio >= 55 ? 'Smart money cenderung beli'
            : ratio >= 45 ? 'Smart money netral'
            : ratio >= 35 ? 'Smart money cenderung jual'
            : 'Smart money jual kuat'
  };
}

// ── SUPPORT & RESISTANCE (swing high/low) ────────────────────────
function supportResistance(candles) {
  if (!candles || candles.length < 10) return { support: [], resistance: [], pivot: 0 };
  const recent   = candles.slice(-60);
  const pivots   = [];
  for (let i = 3; i < recent.length - 3; i++) {
    const c = recent[i];
    const isHigh = recent.slice(i-3, i).every(x => x.high <= c.high)
                && recent.slice(i+1, i+4).every(x => x.high <= c.high);
    const isLow  = recent.slice(i-3, i).every(x => x.low >= c.low)
                && recent.slice(i+1, i+4).every(x => x.low >= c.low);
    if (isHigh) pivots.push({ type: 'resistance', price: c.high });
    if (isLow)  pivots.push({ type: 'support',    price: c.low  });
  }
  const last    = recent[recent.length - 1];
  const pivot   = Math.round((last.high + last.low + last.close) / 3);
  const current = last.close;

  function cluster(levels) {
    if (!levels.length) return [];
    const sorted = levels.map(l => l.price).sort((a, b) => a - b);
    const result = [];
    let group    = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - group[group.length-1]) / group[group.length-1] < 0.015) {
        group.push(sorted[i]);
      } else {
        result.push(Math.round(group.reduce((a, b) => a + b) / group.length));
        group = [sorted[i]];
      }
    }
    if (group.length) result.push(Math.round(group.reduce((a, b) => a + b) / group.length));
    return result.slice(-3);
  }

  return {
    support:    cluster(pivots.filter(p => p.type === 'support'    && p.price < current)).sort((a, b) => b - a),
    resistance: cluster(pivots.filter(p => p.type === 'resistance' && p.price > current)).sort((a, b) => a - b),
    pivot
  };
}

// ── FIBONACCI (dari swing high/low signifikan) ────────────────────
function fibonacci(candles, lookback) {
  lookback = lookback || 60;
  if (!candles || candles.length < 10) return null;
  const recent  = candles.slice(-Math.min(lookback, candles.length));
  const current = candles[candles.length - 1].close;

  let swingHigh = null, swingLow = null, hiIdx = -1, loIdx = -1;
  for (let i = 5; i < recent.length - 2; i++) {
    const c = recent[i];
    if (recent.slice(i-5,i).every(x => x.high <= c.high) && recent.slice(i+1,i+3).every(x => x.high <= c.high)) {
      if (swingHigh === null || c.high > swingHigh) { swingHigh = c.high; hiIdx = i; }
    }
    if (recent.slice(i-5,i).every(x => x.low >= c.low) && recent.slice(i+1,i+3).every(x => x.low >= c.low)) {
      if (swingLow === null || c.low < swingLow) { swingLow = c.low; loIdx = i; }
    }
  }
  if (swingHigh === null) swingHigh = Math.max(...recent.map(c => c.high));
  if (swingLow  === null) swingLow  = Math.min(...recent.map(c => c.low));

  const diff = swingHigh - swingLow;
  if (!diff) return null;

  const levels = {
    r0:   Math.round(swingHigh),
    r236: Math.round(swingHigh - diff * 0.236),
    r382: Math.round(swingHigh - diff * 0.382),
    r50:  Math.round(swingHigh - diff * 0.500),
    r618: Math.round(swingHigh - diff * 0.618),
    r786: Math.round(swingHigh - diff * 0.786),
    r100: Math.round(swingLow),
    e1272: Math.round(swingHigh + diff * 0.272),
    e1618: Math.round(swingHigh + diff * 0.618)
  };

  const retrace  = [levels.r236, levels.r382, levels.r50, levels.r618, levels.r786];
  const nearest  = retrace.reduce((p, c) => Math.abs(c - current) < Math.abs(p - current) ? c : p);
  const posPct   = parseFloat(((current - swingLow) / diff * 100).toFixed(1));
  const nearSup  = retrace.filter(l => l <= current).sort((a, b) => b - a)[0] || swingLow;
  const nearRes  = retrace.filter(l => l >  current).sort((a, b) => a - b)[0] || swingHigh;

  return {
    high: Math.round(swingHigh), low: Math.round(swingLow),
    levels, nearestLevel: nearest, nearSupport: nearSup, nearResistance: nearRes,
    positionPct: posPct,
    isSwingBased: hiIdx >= 0 && loIdx >= 0,
    atKeyLevel: Math.abs(current - nearest) / current < 0.015,
    zone: posPct > 76 ? 'near_high'
        : posPct > 58 ? 'between_618_786'
        : posPct > 45 ? 'near_50pct'
        : posPct > 33 ? 'between_382_50'
        : posPct > 20 ? 'between_236_382'
        : 'near_low',
    narrative: 'Swing ' + Math.round(swingLow).toLocaleString('id-ID') + '–' +
               Math.round(swingHigh).toLocaleString('id-ID') +
               ' | Posisi: ' + posPct + '% | Sup: ' + nearSup.toLocaleString('id-ID') +
               ' | Res: ' + nearRes.toLocaleString('id-ID')
  };
}

// ── 52-WEEK POSITION ─────────────────────────────────────────────
function position52w(candles) {
  if (!candles || candles.length < 2) return null;
  const recent  = candles.slice(-252);
  const high52w = Math.max(...recent.map(c => c.high));
  const low52w  = Math.min(...recent.map(c => c.low));
  const current = candles[candles.length - 1].close;
  const range   = high52w - low52w;
  if (!range) return null;
  const posPct    = Math.round((current - low52w) / range * 100);
  const fromHigh  = parseFloat(((high52w - current) / high52w * 100).toFixed(1));
  const fromLow   = parseFloat(((current - low52w)  / low52w  * 100).toFixed(1));
  return {
    high52w:      Math.round(high52w),
    low52w:       Math.round(low52w),
    positionPct:  posPct,
    pctFromHigh:  fromHigh,
    pctFromLow:   fromLow,
    isNearHigh:   posPct >= 85,
    isNearLow:    posPct <= 15,
    zone: posPct >= 80 ? 'near_high'   : posPct >= 60 ? 'upper_half'
        : posPct >= 40 ? 'middle'       : posPct >= 20 ? 'lower_half' : 'near_low',
    label: posPct >= 80 ? '52W High zone — rawan profit taking'
         : posPct >= 60 ? '52W upper half — momentum kuat'
         : posPct >= 40 ? '52W midrange — netral'
         : posPct >= 20 ? '52W lower half — potensi value'
         : '52W Low zone — potensi oversold/value'
  };
}

// ── DIVERGENCE (RSI + MACD vs Price) ─────────────────────────────
function detectDivergence(candles, rsiVal, macdData) {
  if (!candles || candles.length < 20) return null;
  const recent = candles.slice(-20);
  const closes = recent.map(c => c.close);
  const mid    = Math.floor(closes.length / 2);
  const divs   = [];

  const hiFirst  = Math.max(...closes.slice(0, mid));
  const hiSecond = Math.max(...closes.slice(mid));
  const loFirst  = Math.min(...closes.slice(0, mid));
  const loSecond = Math.min(...closes.slice(mid));

  // RSI divergence
  if (rsiVal != null) {
    const rsiSeries = [];
    for (let i = 14; i <= recent.length; i++) {
      const v = rsi(recent.slice(0, i).map(c => c.close), 14);
      if (v != null) rsiSeries.push(v);
    }
    if (rsiSeries.length >= 4) {
      const rm   = Math.floor(rsiSeries.length / 2);
      const rHi1 = Math.max(...rsiSeries.slice(0, rm));
      const rHi2 = Math.max(...rsiSeries.slice(rm));
      const rLo1 = Math.min(...rsiSeries.slice(0, rm));
      const rLo2 = Math.min(...rsiSeries.slice(rm));
      if (hiSecond > hiFirst * 1.005 && rHi2 < rHi1 - 2)
        divs.push({ type: 'bearish', indicator: 'RSI', strength: 'medium',
          signal: 'Harga Higher High tapi RSI Lower High — momentum melemah' });
      if (loSecond < loFirst * 0.995 && rLo2 > rLo1 + 2)
        divs.push({ type: 'bullish', indicator: 'RSI', strength: 'high',
          signal: 'Harga Lower Low tapi RSI Higher Low — momentum menguat, potensi reversal' });
    }
  }

  // MACD divergence
  if (macdData && macdData.histogram != null) {
    const l5  = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const p5  = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    if (l5 > p5 * 1.015 && macdData.histogram < 0)
      divs.push({ type: 'bearish', indicator: 'MACD', strength: 'medium',
        signal: 'Harga naik tapi MACD histogram negatif — momentum tidak mendukung' });
    if (l5 < p5 * 0.985 && macdData.histogram > 0)
      divs.push({ type: 'bullish', indicator: 'MACD', strength: 'medium',
        signal: 'Harga turun tapi MACD histogram positif — momentum mulai berbalik' });
  }

  if (!divs.length) return { detected: false, divergences: [] };
  const hasBull = divs.some(d => d.type === 'bullish');
  const hasBear = divs.some(d => d.type === 'bearish');
  return {
    detected:    true,
    divergences: divs,
    summary:     hasBull && hasBear ? 'Mixed divergence'
               : hasBull ? 'Bullish divergence — potensi reversal naik'
               : 'Bearish divergence — potensi reversal turun',
    bias:        hasBull && !hasBear ? 'bullish' : hasBear && !hasBull ? 'bearish' : 'mixed'
  };
}

// ── CANDLESTICK PATTERNS (dengan konfirmasi konteks) ──────────────
function candlestickPatterns(candles) {
  if (!candles || candles.length < 5) return { patterns: [], topPattern: null };
  const pats = [];
  const last  = candles[candles.length - 1];
  const prev  = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const body  = c => Math.abs(c.close - (c.open != null ? c.open : c.close));
  const range = c => (c.high - c.low) || 1;
  const upper = c => c.high - Math.max(c.close, c.open != null ? c.open : c.close);
  const lower = c => Math.min(c.close, c.open != null ? c.open : c.close) - c.low;
  const green = c => c.close >= (c.open != null ? c.open : c.close);
  const red   = c => c.close <  (c.open != null ? c.open : c.close);

  const ctx   = candles.slice(-6, -1).map(c => c.close);
  const isDn  = ctx[0] > ctx[ctx.length - 1] * 1.01;
  const isUp  = ctx[0] < ctx[ctx.length - 1] * 0.99;

  // Hammer (setelah downtrend)
  if (lower(last) > body(last) * 2 && upper(last) < body(last) * 0.5 && isDn)
    pats.push({ name: 'Hammer', type: 'bullish', strength: 'medium',
      signal: 'Hammer setelah downtrend — buyer ambil alih di low' });

  // Shooting Star (setelah uptrend)
  if (upper(last) > body(last) * 2 && lower(last) < body(last) * 0.5 && isUp)
    pats.push({ name: 'Shooting Star', type: 'bearish', strength: 'medium',
      signal: 'Shooting Star setelah uptrend — seller dominasi di high' });

  // Bullish Engulfing
  if (green(last) && red(prev) &&
      last.close > (prev.open != null ? prev.open : prev.close) &&
      (last.open != null ? last.open : last.close) < prev.close &&
      body(last) > body(prev) * 1.1)
    pats.push({ name: 'Bullish Engulfing', type: 'bullish', strength: 'high',
      signal: 'Bullish Engulfing — momentum beli menelan tekanan jual' });

  // Bearish Engulfing
  if (red(last) && green(prev) &&
      last.close < (prev.open != null ? prev.open : prev.close) &&
      (last.open != null ? last.open : prev.close) > prev.close &&
      body(last) > body(prev) * 1.1)
    pats.push({ name: 'Bearish Engulfing', type: 'bearish', strength: 'high',
      signal: 'Bearish Engulfing — tekanan jual menelan momentum beli' });

  // Morning Star (setelah downtrend)
  if (red(prev2) && body(prev) < body(prev2) * 0.5 && green(last) &&
      last.close > (prev2.open != null ? prev2.open : prev2.close * 2) / 2 && isDn)
    pats.push({ name: 'Morning Star', type: 'bullish', strength: 'high',
      signal: 'Morning Star setelah downtrend — reversal bullish 3 candle' });

  // Evening Star (setelah uptrend)
  if (green(prev2) && body(prev) < body(prev2) * 0.5 && red(last) &&
      last.close < (prev2.open != null ? prev2.open : prev2.close * 2) / 2 && isUp)
    pats.push({ name: 'Evening Star', type: 'bearish', strength: 'high',
      signal: 'Evening Star setelah uptrend — reversal bearish 3 candle' });

  // Marubozu
  if (body(last) / range(last) > 0.92) {
    const bull = green(last);
    pats.push({ name: bull ? 'Bullish Marubozu' : 'Bearish Marubozu',
      type: bull ? 'bullish' : 'bearish', strength: 'high',
      signal: bull ? 'Bullish Marubozu — momentum beli kuat sepanjang sesi'
                   : 'Bearish Marubozu — momentum jual kuat sepanjang sesi' });
  }

  // Inside Bar
  if (last.high < prev.high && last.low > prev.low)
    pats.push({ name: 'Inside Bar', type: 'neutral', strength: 'medium',
      signal: 'Inside Bar — konsolidasi sebelum breakout' });

  const order = { high: 3, medium: 2, low: 1 };
  const top   = pats.sort((a, b) => (order[b.strength]||0) - (order[a.strength]||0))[0] || null;
  return {
    patterns:   pats,
    topPattern: top,
    hasBullish: pats.some(p => p.type === 'bullish'),
    hasBearish: pats.some(p => p.type === 'bearish'),
    summary:    pats.length ? pats.map(p => p.name).join(', ') : 'Tidak ada pola signifikan'
  };
}

// ══════════════════════════════════════════════════════════════════
// COMPUTE ALL — gabungkan semua 18 indikator
// ══════════════════════════════════════════════════════════════════
function computeAll(candles) {
  if (!candles || candles.length < 5) return {};

  const closes  = candles.map(c => c.close);
  const current = closes[closes.length - 1];

  // Trend
  const ema9Val  = ema(closes, 9);
  const sma50Val = sma(closes, 50);
  const maCross  = maCrossover(closes);

  // Momentum
  const rsi14    = rsi(closes, 14);
  const macdData = macd(closes);
  const bb       = bollingerBands(closes, 20);

  // Volatilitas
  const atrData  = atr(candles, 14);

  // Volume
  const rvolData = candles.length >= 21 ? relativeVolume(candles, 20) : null;
  const obvData  = obv(candles);
  const smfData  = candles.length >= 20 ? smartMoneyFlow(candles, 20) : null;

  // Struktur
  const srLevels = supportResistance(candles);
  const fibData  = candles.length >= 10 ? fibonacci(candles, 60) : null;
  const pos52w   = candles.length >= 10 ? position52w(candles)   : null;

  // Sinyal
  const divData  = candles.length >= 20 ? detectDivergence(candles, rsi14, macdData) : null;
  const csData   = candles.length >= 5  ? candlestickPatterns(candles)                : null;

  // Trend summary (berdasarkan EMA9/SMA50)
  const bullCount = [
    maCross.aboveEMA9,
    maCross.aboveSMA50,
    maCross.alignment === 'bullish',
    macdData && macdData.trend === 'bullish',
    rsi14 != null && rsi14 > 50
  ].filter(Boolean).length;
  const trendSummary = bullCount >= 4 ? 'bullish' : bullCount <= 1 ? 'bearish' : 'neutral';

  return {
    // Trend
    ma:           maCross,   // includes ema9, sma50, alignment, crossover type
    // Momentum
    rsi:          rsi14,
    macd:         macdData,
    bb,
    // Volatilitas
    atr:          atrData,
    // Volume
    rvol:         rvolData,
    obv:          obvData,
    smartMoney:   smfData,
    // Struktur
    levels:       srLevels,
    fibonacci:    fibData,
    position52w:  pos52w,
    // Sinyal
    divergence:   divData,
    candlestick:  csData,
    // Summary
    trendSummary,
    // Convenience
    price: {
      current,
      change:    closes.length > 1 ? current - closes[closes.length - 2] : 0,
      changePct: closes.length > 1
        ? parseFloat(((current - closes[closes.length-2]) / closes[closes.length-2] * 100).toFixed(2))
        : 0
    }
  };
}

module.exports = {
  ema, sma, rsi, macd, bollingerBands, atr,
  maCrossover, relativeVolume, obv, smartMoneyFlow,
  supportResistance, fibonacci, position52w,
  detectDivergence, candlestickPatterns,
  computeAll
};
