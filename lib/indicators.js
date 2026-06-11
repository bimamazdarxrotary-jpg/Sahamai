// ══════════════════════════════════════════════════════════════════
// lib/indicators.js — Layer 2 & 3: Price Action + Momentum
// Semua deterministik. Tidak ada AI di sini.
// ══════════════════════════════════════════════════════════════════

// ── Primitif ──────────────────────────────────────────────────────
function sma(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null && !isNaN(v));
  if (slice.length < period) return null;
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

function ema(closes, period) {
  if (!closes || closes.length < period) return null;
  const valid = closes.filter(v => v != null && !isNaN(v));
  if (valid.length < period) return null;
  const k = 2 / (period + 1);
  let val = valid.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < valid.length; i++) val = valid[i] * k + val * (1 - k);
  return Math.round(val);
}

// RSI — Wilder smoothing (identik TradingView)
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
    avgGain = (avgGain * (period - 1) + Math.max(0,  changes[i])) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -changes[i])) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

// MACD — kembalikan histogram series lengkap untuk slope
function macd(closes, fast, slow, signal) {
  fast   = fast   || 12;
  slow   = slow   || 26;
  signal = signal || 9;
  if (!closes || closes.length < slow + signal) return null;
  const kf = 2 / (fast + 1), ks = 2 / (slow + 1), kg = 2 / (signal + 1);
  let ef = closes.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let es = closes.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  for (let i = 1; i < fast; i++) ef = closes[i] * kf + ef * (1 - kf);
  const macdLine = [];
  for (let i = slow; i < closes.length; i++) {
    ef = closes[i] * kf + ef * (1 - kf);
    es = closes[i] * ks + es * (1 - ks);
    macdLine.push(ef - es);
  }
  if (macdLine.length < signal) return null;
  let sg = macdLine.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  let prevSg = sg;
  const histSeries = [];
  for (let i = signal; i < macdLine.length; i++) {
    prevSg = sg;
    sg = macdLine[i] * kg + sg * (1 - kg);
    histSeries.push(macdLine[i] - sg);
  }
  const macdVal  = macdLine[macdLine.length - 1];
  const hist     = macdVal - sg;
  const prevHist = macdLine[macdLine.length - 2] != null ? macdLine[macdLine.length - 2] - prevSg : hist;
  // Slope histogram: rata-rata perubahan 3 bar terakhir
  const recentHist = histSeries.slice(-4);
  let slope = 0;
  if (recentHist.length >= 2) {
    const diffs = [];
    for (let i = 1; i < recentHist.length; i++) diffs.push(recentHist[i] - recentHist[i-1]);
    slope = parseFloat((diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(3));
  }
  return {
    macd:      parseFloat(macdVal.toFixed(2)),
    signal:    parseFloat(sg.toFixed(2)),
    histogram: parseFloat(hist.toFixed(2)),
    slope,
    slopeLabel: slope > 0.5 ? 'rising_fast' : slope > 0 ? 'rising' : slope < -0.5 ? 'falling_fast' : 'falling',
    trend:     macdVal > sg ? 'bullish' : 'bearish',
    crossover: hist > 0 && prevHist <= 0 ? 'golden_cross'
             : hist < 0 && prevHist >= 0 ? 'death_cross'
             : null
  };
}

// Bollinger Bands
function bollingerBands(closes, period, mult) {
  period = period || 20; mult = mult || 2;
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period).filter(v => v != null);
  if (slice.length < period) return null;
  const mid  = slice.reduce((a, b) => a + b, 0) / period;
  const std  = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
  const upper = Math.round(mid + mult * std);
  const lower = Math.round(mid - mult * std);
  const last  = closes[closes.length - 1];
  const bw    = parseFloat(((upper - lower) / mid * 100).toFixed(2));
  const pct   = upper === lower ? 50 : Math.round((last - lower) / (upper - lower) * 100);
  return {
    upper, middle: Math.round(mid), lower,
    bandwidth: bw,
    bandPct: pct,
    isSqueeze: bw < 5,
    position: pct > 80 ? 'overbought_zone' : pct < 20 ? 'oversold_zone' : 'neutral_zone'
  };
}

// ATR — Wilder
function atr(candles, period) {
  period = period || 14;
  if (!candles || candles.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i-1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  if (tr.length < period) return null;
  let val = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) val = (val * (period - 1) + tr[i]) / period;
  const lastClose = candles[candles.length - 1].close;
  return { atr: Math.round(val), atrPct: parseFloat((val / lastClose * 100).toFixed(2)) };
}

// EMA array lengkap (untuk multi-TF trend check)
function emaArray(closes, period) {
  if (!closes || closes.length < period) return [];
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [];
  for (let i = 0; i < period - 1; i++) result.push(null);
  result.push(Math.round(val));
  for (let i = period; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k);
    result.push(Math.round(val));
  }
  return result;
}

// ── Layer 2: Price Action ─────────────────────────────────────────

// Support & Resistance — swing-based clustering
function supportResistance(candles) {
  if (!candles || candles.length < 10) return { support: [], resistance: [], pivot: 0 };
  const recent = candles.slice(-60);
  const pivots = [];
  for (let i = 3; i < recent.length - 3; i++) {
    const c = recent[i];
    const isHigh = recent.slice(i-3, i).every(x => x.high <= c.high)
                && recent.slice(i+1, i+4).every(x => x.high <= c.high);
    const isLow  = recent.slice(i-3, i).every(x => x.low >= c.low)
                && recent.slice(i+1, i+4).every(x => x.low >= c.low);
    if (isHigh) pivots.push({ type: 'resistance', price: c.high });
    if (isLow)  pivots.push({ type: 'support',    price: c.low  });
  }
  const last  = recent[recent.length - 1];
  const pivot = Math.round((last.high + last.low + last.close) / 3);
  function cluster(levels) {
    if (!levels.length) return [];
    const sorted = levels.map(l => l.price).sort((a, b) => a - b);
    const groups = []; let grp = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - grp[grp.length-1]) / grp[grp.length-1] < 0.015) grp.push(sorted[i]);
      else { groups.push(Math.round(grp.reduce((a,b)=>a+b)/grp.length)); grp = [sorted[i]]; }
    }
    if (grp.length) groups.push(Math.round(grp.reduce((a,b)=>a+b)/grp.length));
    return groups.slice(-3);
  }
  const cur = last.close;
  return {
    support:    cluster(pivots.filter(p => p.type==='support'    && p.price < cur)).sort((a,b)=>b-a),
    resistance: cluster(pivots.filter(p => p.type==='resistance' && p.price > cur)).sort((a,b)=>a-b),
    pivot
  };
}

// Trend direction scoring berdasarkan EMA alignment
function trendDirectionScore(closes, candles) {
  const ema20  = ema(closes, 20);
  const ema50  = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const last   = closes[closes.length - 1];
  let score = 0; const signals = [];

  if (ema20 && last > ema20)  { score += 1; signals.push('harga > EMA20'); }
  else if (ema20)              { score -= 1; signals.push('harga < EMA20'); }
  if (ema50 && last > ema50)  { score += 1; signals.push('harga > EMA50'); }
  else if (ema50)              { score -= 1; signals.push('harga < EMA50'); }
  if (ema200 && last > ema200) { score += 2; signals.push('harga > EMA200 (tren panjang bullish)'); }
  else if (ema200)             { score -= 2; signals.push('harga < EMA200 (tren panjang bearish)'); }
  if (ema20 && ema50 && ema20 > ema50)   { score += 1; signals.push('EMA20 > EMA50 (alignment bullish)'); }
  else if (ema20 && ema50)               { score -= 1; signals.push('EMA20 < EMA50 (alignment bearish)'); }
  if (ema50 && ema200 && ema50 > ema200) { score += 1; signals.push('EMA50 > EMA200'); }
  else if (ema50 && ema200)              { score -= 1; signals.push('EMA50 < EMA200'); }

  // Crossover detection
  let crossover = null;
  if (closes.length >= 52) {
    const ema20Prev = ema(closes.slice(0,-1), 20);
    const ema50Prev = ema(closes.slice(0,-1), 50);
    if (ema20 && ema50 && ema20Prev && ema50Prev) {
      if (ema20 > ema50 && ema20Prev <= ema50Prev) crossover = 'golden_cross';
      if (ema20 < ema50 && ema20Prev >= ema50Prev) crossover = 'death_cross';
    }
  }

  const normalized = Math.max(0, Math.min(10, score + 5));
  return {
    score: normalized,
    raw: score,
    ema20, ema50, ema200,
    crossover,
    aboveEMA20: last > (ema20 || 0),
    aboveEMA50: last > (ema50 || 0),
    aboveEMA200: last > (ema200 || 0),
    signals,
    label: normalized >= 7 ? 'Tren naik kuat'
         : normalized >= 5 ? 'Tren netral cenderung naik'
         : normalized >= 3 ? 'Tren netral cenderung turun'
         : 'Tren turun kuat'
  };
}

// Volume ratio vs MA20
function volumeRatio(candles) {
  if (!candles || candles.length < 21) return null;
  const vols = candles.slice(-21, -1).map(c => c.volume || 0).filter(v => v > 0);
  if (!vols.length) return null;
  const ma20Vol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const lastVol = candles[candles.length - 1].volume || 0;
  const ratio   = parseFloat((lastVol / ma20Vol).toFixed(2));
  return {
    ratio,
    ma20Vol:  Math.round(ma20Vol),
    lastVol,
    label: ratio >= 3   ? 'Ekstrim (3x+)'
         : ratio >= 2   ? 'Sangat Tinggi (2x+)'
         : ratio >= 1.5 ? 'Tinggi (1.5x+)'
         : ratio >= 0.8 ? 'Normal'
         : 'Rendah',
    isSpike: ratio >= 1.5
  };
}

// 52-Week Position
function position52w(candles) {
  if (!candles || candles.length < 2) return null;
  const recent = candles.slice(-252);
  const high52w = Math.max(...recent.map(c => c.high));
  const low52w  = Math.min(...recent.map(c => c.low));
  const current = candles[candles.length - 1].close;
  const range   = high52w - low52w;
  if (!range) return null;
  const positionPct  = Math.round((current - low52w) / range * 100);
  const pctFromHigh  = parseFloat(((high52w - current) / high52w * 100).toFixed(1));
  const pctFromLow   = parseFloat(((current - low52w)  / low52w  * 100).toFixed(1));
  return {
    high52w: Math.round(high52w), low52w: Math.round(low52w),
    positionPct, pctFromHigh, pctFromLow,
    isNearHigh: positionPct >= 85,
    isNearLow:  positionPct <= 15,
    zone: positionPct >= 80 ? 'near_high' : positionPct >= 60 ? 'upper_half'
        : positionPct >= 40 ? 'middle'    : positionPct >= 20 ? 'lower_half' : 'near_low',
    label: positionPct >= 80 ? '52W High zone — rawan profit taking'
         : positionPct >= 60 ? '52W upper half — momentum kuat'
         : positionPct >= 40 ? '52W midrange — netral'
         : positionPct >= 20 ? '52W lower half — potensi value'
         : '52W Low zone — potensi oversold/value'
  };
}

// Fibonacci dari swing high/low
function fibonacci(candles, lookback) {
  lookback = lookback || 60;
  if (!candles || candles.length < 10) return null;
  const recent  = candles.slice(-Math.min(lookback, candles.length));
  const current = candles[candles.length - 1].close;
  let swingHigh = null, swingLow = null;
  for (let i = 5; i < recent.length - 2; i++) {
    const c = recent[i];
    if (recent.slice(i-5,i).every(x=>x.high<=c.high) && recent.slice(i+1,i+3).every(x=>x.high<=c.high))
      if (!swingHigh || c.high > swingHigh) swingHigh = c.high;
    if (recent.slice(i-5,i).every(x=>x.low>=c.low)  && recent.slice(i+1,i+3).every(x=>x.low>=c.low))
      if (!swingLow  || c.low  < swingLow)  swingLow  = c.low;
  }
  if (!swingHigh) swingHigh = Math.max(...recent.map(c=>c.high));
  if (!swingLow)  swingLow  = Math.min(...recent.map(c=>c.low));
  const diff = swingHigh - swingLow;
  if (!diff) return null;
  const levels = {
    r0:   Math.round(swingHigh),
    r236: Math.round(swingHigh - diff*0.236),
    r382: Math.round(swingHigh - diff*0.382),
    r50:  Math.round(swingHigh - diff*0.500),
    r618: Math.round(swingHigh - diff*0.618),
    r786: Math.round(swingHigh - diff*0.786),
    r100: Math.round(swingLow),
    e1272: Math.round(swingHigh + diff*0.272),
    e1618: Math.round(swingHigh + diff*0.618),
  };
  const retrace     = [levels.r236,levels.r382,levels.r50,levels.r618,levels.r786];
  const nearLevel   = retrace.reduce((p,c) => Math.abs(c-current)<Math.abs(p-current)?c:p);
  const positionPct = parseFloat(((current-swingLow)/diff*100).toFixed(1));
  const nearSupport = retrace.filter(l=>l<=current).sort((a,b)=>b-a)[0] || swingLow;
  const nearResist  = retrace.filter(l=>l> current).sort((a,b)=>a-b)[0] || swingHigh;
  return {
    high: Math.round(swingHigh), low: Math.round(swingLow),
    levels, nearLevel, nearSupport, nearResist, positionPct,
    atKeyLevel: Math.abs(current-nearLevel)/current < 0.015,
    narrative: `Swing ${Math.round(swingLow).toLocaleString('id-ID')}–${Math.round(swingHigh).toLocaleString('id-ID')} | Posisi: ${positionPct}% | Support Fib: ${nearSupport.toLocaleString('id-ID')} | Resist: ${nearResist.toLocaleString('id-ID')}`
  };
}

// RSI Divergence
function detectDivergence(candles, rsiVal, macdData) {
  if (!candles || candles.length < 20) return null;
  const recent = candles.slice(-20);
  const closes = recent.map(c => c.close);
  const mid    = Math.floor(closes.length / 2);
  const divs   = [];
  const phH = Math.max(...closes.slice(0,mid)), phL = Math.max(...closes.slice(mid));
  const plL = Math.min(...closes.slice(0,mid)), plH = Math.min(...closes.slice(mid));

  if (rsiVal != null) {
    const rc = recent.map(c => c.close);
    const rs = [];
    for (let i = 14; i <= rc.length; i++) { const v = rsi(rc.slice(0,i),14); if (v!=null) rs.push(v); }
    if (rs.length >= 4) {
      const rm = Math.floor(rs.length/2);
      const rfH = Math.max(...rs.slice(0,rm)), rlH = Math.max(...rs.slice(rm));
      const rfL = Math.min(...rs.slice(0,rm)), rlL = Math.min(...rs.slice(rm));
      if (phL > phH*1.005 && rlH < rfH-2) divs.push({ type:'bearish', indicator:'RSI', strength:'medium', signal:'Higher High harga tapi Lower High RSI' });
      if (plH < plL*0.995 && rlL > rfL+2) divs.push({ type:'bullish', indicator:'RSI', strength:'high',   signal:'Lower Low harga tapi Higher Low RSI — potensi reversal' });
    }
  }
  if (macdData && macdData.histogram != null) {
    const l5a = closes.slice(-5).reduce((a,b)=>a+b,0)/5;
    const p5a = closes.slice(-10,-5).reduce((a,b)=>a+b,0)/5;
    if (l5a > p5a*1.015 && macdData.histogram < 0) divs.push({ type:'bearish', indicator:'MACD', strength:'medium', signal:'Harga naik tapi MACD histogram negatif' });
    if (l5a < p5a*0.985 && macdData.histogram > 0) divs.push({ type:'bullish', indicator:'MACD', strength:'medium', signal:'Harga turun tapi MACD histogram positif' });
  }
  if (!divs.length) return { detected: false, divergences: [] };
  const hasBull = divs.some(d=>d.type==='bullish'), hasBear = divs.some(d=>d.type==='bearish');
  return {
    detected: true, divergences: divs,
    summary: hasBull && hasBear ? 'Mixed divergence' : hasBull ? 'Bullish divergence — potensi reversal naik' : 'Bearish divergence — potensi reversal turun',
    bias: hasBull && !hasBear ? 'bullish' : hasBear && !hasBull ? 'bearish' : 'mixed'
  };
}

// Candlestick patterns dengan validasi konteks
function candlestickPatterns(candles) {
  if (!candles || candles.length < 5) return { patterns: [], topPattern: null };
  const patterns = [];
  const last = candles[candles.length-1], prev = candles[candles.length-2], prev2 = candles[candles.length-3];
  const body  = c => Math.abs(c.close-(c.open!=null?c.open:c.close));
  const range = c => (c.high-c.low)||1;
  const upper = c => c.high - Math.max(c.close, c.open!=null?c.open:c.close);
  const lower = c => Math.min(c.close, c.open!=null?c.open:c.close) - c.low;
  const isGreen = c => c.close >= (c.open!=null?c.open:c.close);
  const isRed   = c => c.close <  (c.open!=null?c.open:c.close);
  const ctx5    = candles.slice(-6,-1).map(c=>c.close);
  const isDT    = ctx5[0] > ctx5[ctx5.length-1]*1.01;
  const isUT    = ctx5[0] < ctx5[ctx5.length-1]*0.99;
  if (lower(last)>body(last)*2 && upper(last)<body(last)*0.5 && isDT)
    patterns.push({ name:'Hammer', type:'bullish', strength:'medium', signal:'Hammer setelah downtrend — buyer ambil alih di low.' });
  if (upper(last)>body(last)*2 && lower(last)<body(last)*0.5 && isUT)
    patterns.push({ name:'Shooting Star', type:'bearish', strength:'medium', signal:'Shooting Star setelah uptrend — waspadai reversal.' });
  if (isGreen(last)&&isRed(prev)&&last.close>(prev.open!=null?prev.open:prev.close)&&(last.open!=null?last.open:last.close)<prev.close&&body(last)>body(prev)*1.1)
    patterns.push({ name:'Bullish Engulfing', type:'bullish', strength:'high', signal:'Bullish Engulfing — momentum beli menelan tekanan jual.' });
  if (isRed(last)&&isGreen(prev)&&last.close<(prev.open!=null?prev.open:prev.close)&&(last.open!=null?last.open:prev.close)>prev.close&&body(last)>body(prev)*1.1)
    patterns.push({ name:'Bearish Engulfing', type:'bearish', strength:'high', signal:'Bearish Engulfing — tekanan jual menelan momentum beli.' });
  if (isRed(prev2)&&body(prev)<body(prev2)*0.5&&isGreen(last)&&last.close>(prev2.close+prev2.close)/2&&isDT)
    patterns.push({ name:'Morning Star', type:'bullish', strength:'high', signal:'Morning Star — reversal bullish 3 candle.' });
  if (isGreen(prev2)&&body(prev)<body(prev2)*0.5&&isRed(last)&&last.close<(prev2.close+prev2.close)/2&&isUT)
    patterns.push({ name:'Evening Star', type:'bearish', strength:'high', signal:'Evening Star — reversal bearish 3 candle.' });
  if (body(last)/range(last)>0.92)
    patterns.push({ name: isGreen(last)?'Bullish Marubozu':'Bearish Marubozu', type: isGreen(last)?'bullish':'bearish', strength:'high', signal: isGreen(last)?'Momentum beli kuat sepanjang sesi.':'Momentum jual kuat sepanjang sesi.' });
  if (last.high<prev.high && last.low>prev.low)
    patterns.push({ name:'Inside Bar', type:'neutral', strength:'medium', signal:'Inside Bar — konsolidasi, breakout akan jadi sinyal kuat.' });
  const sorted = patterns.sort((a,b)=>({high:3,medium:2,low:1}[b.strength]||0)-({high:3,medium:2,low:1}[a.strength]||0));
  return { patterns: sorted, topPattern: sorted[0]||null, hasBullish: patterns.some(p=>p.type==='bullish'), hasBearish: patterns.some(p=>p.type==='bearish'), summary: patterns.length?patterns.map(p=>p.name).join(', '):'Tidak ada pola signifikan' };
}

// ADX
function trendStrength(candles, period) {
  period = period||14;
  if (!candles || candles.length < period*2) return null;
  const dp=[],dm=[],tr=[];
  for (let i=1;i<candles.length;i++) {
    const c=candles[i],p=candles[i-1];
    dp.push(Math.max(c.high-p.high,0));
    dm.push(Math.max(p.low-c.low,0));
    tr.push(Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close)));
  }
  const smooth=arr=>{ let s=arr.slice(0,period).reduce((a,b)=>a+b,0); const r=[s]; for(let i=period;i<arr.length;i++){s=s-s/period+arr[i];r.push(s);} return r; };
  const sTR=smooth(tr),sDp=smooth(dp),sDm=smooth(dm);
  const diP=sDp.map((v,i)=>sTR[i]?v/sTR[i]*100:0);
  const diM=sDm.map((v,i)=>sTR[i]?v/sTR[i]*100:0);
  const dx=diP.map((v,i)=>{ const s=v+diM[i]; return s?Math.abs(v-diM[i])/s*100:0; });
  const adxVal=Math.round(dx.slice(-period).reduce((a,b)=>a+b,0)/period);
  return { adx:adxVal, trend:diP[diP.length-1]>diM[diM.length-1]?'uptrend':'downtrend', strength:adxVal>40?'very_strong':adxVal>25?'strong':adxVal>15?'weak':'no_trend' };
}

// OBV
function obv(candles) {
  if (!candles || candles.length < 5) return null;
  let val=0; const series=[];
  for (let i=0;i<candles.length;i++) {
    if (i===0){series.push(0);continue;}
    const c=candles[i],p=candles[i-1];
    if (c.close>p.close) val+=c.volume||0;
    else if (c.close<p.close) val-=c.volume||0;
    series.push(val);
  }
  const last10=series.slice(-10);
  const trend=last10[last10.length-1]>last10[0]?'rising':'falling';
  const ptUp=candles[candles.length-1].close>candles[0].close;
  const div=(trend==='rising'&&!ptUp)?'bullish_divergence':(trend==='falling'&&ptUp)?'bearish_divergence':null;
  return { value:val, trend, divergence: div };
}

// ── computeAll — entry point utama ────────────────────────────────
// candles = daily (wajib), weeklyCandles & monthlyCandles opsional
function computeAll(candles, weeklyCandles, monthlyCandles) {
  if (!candles || candles.length < 5) return {};
  const closes  = candles.map(c => c.close);
  const current = closes[closes.length - 1];

  // Layer 2: Price Action
  const trendDir  = trendDirectionScore(closes, candles);
  const bb        = bollingerBands(closes, 20);
  const srLevels  = supportResistance(candles);
  const atrData   = atr(candles, 14);
  const pos52w    = position52w(candles);
  const fibData   = candles.length >= 10  ? fibonacci(candles, 60)  : null;
  const csData    = candles.length >= 5   ? candlestickPatterns(candles) : null;

  // Layer 3: Momentum
  const rsi14     = rsi(closes, 14);
  const macdData  = macd(closes);
  const volRatio  = volumeRatio(candles);
  const obvData   = obv(candles);
  const divData   = candles.length >= 20 ? detectDivergence(candles, rsi14, macdData) : null;
  const adxData   = trendStrength(candles, 14);

  // Multi-TF context (jika tersedia)
  let weeklyCtx = null, monthlyCtx = null;
  if (weeklyCandles && weeklyCandles.length >= 20) {
    const wc = weeklyCandles.map(c=>c.close);
    weeklyCtx = {
      ema20:  ema(wc, 20),
      ema50:  ema(wc, 50),
      rsi:    rsi(wc, 14),
      trend:  wc[wc.length-1] > (ema(wc,20)||0) ? 'above_ema20' : 'below_ema20',
      macd:   macd(wc)
    };
  }
  if (monthlyCandles && monthlyCandles.length >= 10) {
    const mc = monthlyCandles.map(c=>c.close);
    monthlyCtx = {
      ema20: ema(mc, 20),
      rsi:   rsi(mc, 14),
      trend: mc[mc.length-1] > (ema(mc,20)||0) ? 'above_ema20' : 'below_ema20'
    };
  }

  // Trend summary (bullish/bearish/neutral) — ringkasan cepat untuk scoring
  const bullSignals = [
    trendDir.aboveEMA20,
    trendDir.aboveEMA50,
    trendDir.aboveEMA200,
    macdData && macdData.trend === 'bullish',
    rsi14 != null && rsi14 > 50
  ].filter(Boolean).length;
  const trendSummary = bullSignals >= 4 ? 'bullish' : bullSignals <= 1 ? 'bearish' : 'neutral';

  return {
    price:    { current, change: closes.length>1?current-closes[closes.length-2]:0, changePct: closes.length>1?parseFloat(((current-closes[closes.length-2])/closes[closes.length-2]*100).toFixed(2)):0 },
    // Layer 2
    trend:      trendDir,
    ma:         { ema20: trendDir.ema20, ema50: trendDir.ema50, ema200: trendDir.ema200, crossover: trendDir.crossover, aboveEMA20: trendDir.aboveEMA20, aboveEMA50: trendDir.aboveEMA50, aboveEMA200: trendDir.aboveEMA200 },
    bb,
    levels:     srLevels,
    atr:        atrData,
    position52w: pos52w,
    fibonacci:  fibData,
    candlestick: csData,
    adx:        adxData,
    // Layer 3
    rsi:        rsi14,
    macd:       macdData,
    volumeRatio: volRatio,
    obv:        obvData,
    divergence: divData,
    // Multi-TF
    weekly:     weeklyCtx,
    monthly:    monthlyCtx,
    // Summary
    trendSummary
  };
}

module.exports = {
  sma, ema, emaArray, rsi, macd, bollingerBands, atr,
  supportResistance, trendDirectionScore, volumeRatio,
  position52w, fibonacci, detectDivergence, candlestickPatterns,
  trendStrength, obv,
  computeAll
};
