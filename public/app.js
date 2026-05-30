// ── STATE ──────────────────────────────────────────────────────────
let tvChart = null,
  tvSeries = null,
  tvVolSeries = null,
  rsiChart = null,
  rsiSeries = null;
let macdChart = null,
  macdHistSeries = null,
  macdLineSeries = null,
  macdSignalSeries = null;
let currentCandles = [],
  currentChartType = 'candle',
  currentRange = '3mo';
let activeIndicators = { ma20: true, ma50: true, ema9: true, bb: false, rsi: false, macd: false };
let chartSeriesMap = {};

// ── ANALYZE ────────────────────────────────────────────────────────
async function analyzeStock() {
  const input = document.getElementById('stockInput');
  const ticker = input.value.trim().toUpperCase();
  if (!ticker) {
    showToast('Masukkan kode saham terlebih dahulu', 'error');
    return;
  }
  const btn = document.getElementById('analyzeBtn'),
    icon = document.getElementById('btnIcon');
  btn.disabled = true;
  icon.className = 'spin';
  icon.textContent = '↻';
  document
    .querySelectorAll('.chip')
    .forEach((c) => c.classList.toggle('active', c.textContent === ticker));
  const section = document.getElementById('resultsSection'),
    content = document.getElementById('resultsContent');
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  content.innerHTML = buildSkeleton();
  if (tvChart) {
    tvChart.remove();
    tvChart = null;
    tvSeries = null;
    tvVolSeries = null;
  }
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    content.innerHTML = buildResult(ticker, d);
    if (d.priceData?.candles?.length) {
      currentCandles = d.priceData.candles;
      initTVChart(currentCandles, currentChartType);
    }
    showToast(`${d.fromCache ? '⚡ Cache' : '✓ Selesai'} — ${d.latencyMs || 0}ms`, 'ok');
  } catch (err) {
    content.innerHTML = `<div style="text-align:center;padding:4rem 1rem"><div style="font-size:3rem;margin-bottom:1rem">⚠️</div><p style="font-size:1rem;color:var(--red);margin-bottom:8px;font-family:var(--mono);font-weight:700">Gagal menganalisis saham</p><p style="font-size:12px;color:var(--text3)">${esc(String(err.message))}</p></div>`;
    showToast('Error: ' + err.message, 'error');
  }
  btn.disabled = false;
  icon.className = '';
  icon.textContent = '✦';
}

function quickAnalyze(code) {
  document.getElementById('stockInput').value = code;
  analyzeStock();
}

// ── CHART CALCULATIONS ─────────────────────────────────────────────
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const result = [];
  let ema = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    if (ema === null) {
      ema = data.slice(0, period).reduce((a, c) => a + c.close, 0) / period;
    } else {
      ema = data[i].close * k + ema * (1 - k);
    }
    result.push({ time: data[i].date, value: Math.round(ema) });
  }
  return result;
}
function calcSMA(data, period) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const avg = data.slice(i - period + 1, i + 1).reduce((a, c) => a + c.close, 0) / period;
    result.push({ time: data[i].date, value: Math.round(avg) });
  }
  return result;
}
function calcBB(data, period = 20, mult = 2) {
  const upper = [],
    middle = [],
    lower = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, c) => a + c.close, 0) / period;
    const std = Math.sqrt(slice.reduce((a, c) => a + Math.pow(c.close - avg, 2), 0) / period);
    upper.push({ time: data[i].date, value: Math.round(avg + mult * std) });
    middle.push({ time: data[i].date, value: Math.round(avg) });
    lower.push({ time: data[i].date, value: Math.round(avg - mult * std) });
  }
  return { upper, middle, lower };
}
function calcRSI(data, period = 14) {
  const result = [];
  const closes = data.map((c) => c.close);
  if (closes.length < period + 1) return result;
  const changes = closes.slice(1).map((v, i) => v - closes[i]);
  let avgGain =
    changes
      .slice(0, period)
      .filter((v) => v > 0)
      .reduce((a, b) => a + b, 0) / period;
  let avgLoss =
    changes
      .slice(0, period)
      .filter((v) => v < 0)
      .reduce((a, b) => a + Math.abs(b), 0) / period;
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: data[i].date, value: Math.round(100 - 100 / (1 + rs)) });
  }
  return result;
}
function calcMACD(data, fast = 12, slow = 26, signal = 9) {
  const kf = 2 / (fast + 1),
    ks = 2 / (slow + 1),
    kg = 2 / (signal + 1);
  const closes = data.map((c) => c.close);
  if (closes.length < slow + signal) return { macd: [], signal: [], hist: [] };
  let ef = closes.slice(0, fast).reduce((a, b) => a + b) / fast;
  let es = closes.slice(0, slow).reduce((a, b) => a + b) / slow;
  const macdLine = [];
  for (let i = 1; i < fast; i++) ef = closes[i] * kf + ef * (1 - kf);
  for (let i = slow; i < closes.length; i++) {
    ef = closes[i] * kf + ef * (1 - kf);
    es = closes[i] * ks + es * (1 - ks);
    macdLine.push({ time: data[i].date, value: parseFloat((ef - es).toFixed(2)) });
  }
  if (macdLine.length < signal) return { macd: [], signal: [], hist: [] };
  let sg = macdLine.slice(0, signal).reduce((a, b) => a + b.value, 0) / signal;
  const sigLine = [],
    histLine = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (i >= signal) sg = macdLine[i].value * kg + sg * (1 - kg);
    if (i >= signal - 1) {
      sigLine.push({ time: macdLine[i].time, value: parseFloat(sg.toFixed(2)) });
      histLine.push({
        time: macdLine[i].time,
        value: parseFloat((macdLine[i].value - sg).toFixed(2)),
        color: macdLine[i].value - sg >= 0 ? 'rgba(0,230,118,0.5)' : 'rgba(255,82,82,0.5)',
      });
    }
  }
  return { macd: macdLine.slice(signal - 1), signal: sigLine, hist: histLine };
}

function toggleIndicator(ind) {
  activeIndicators[ind] = !activeIndicators[ind];
  const btn = document.getElementById('tog-' + ind);
  if (btn) btn.className = 'ind-toggle ' + (activeIndicators[ind] ? 'on-' : 'off-') + ind;
  if (ind === 'rsi') {
    const p = document.getElementById('panel-rsi');
    if (p) p.classList.toggle('visible', activeIndicators.rsi);
  }
  if (ind === 'macd') {
    const p = document.getElementById('panel-macd');
    if (p) p.classList.toggle('visible', activeIndicators.macd);
  }
  if (currentCandles.length) initTVChart(currentCandles, currentChartType);
}

function initTVChart(allCandles, type) {
  type = type || 'candle';
  const container = document.getElementById('tvChart');
  if (!container || !allCandles || !allCandles.length) return;
  if (tvChart) {
    tvChart.remove();
    tvChart = null;
  }
  if (rsiChart) {
    rsiChart.remove();
    rsiChart = null;
  }
  if (macdChart) {
    macdChart.remove();
    macdChart = null;
  }
  chartSeriesMap = {};
  const data = filterByRange(allCandles, currentRange);
  if (!data.length) return;
  const isUp = data[data.length - 1].close >= data[0].close;
  tvChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: 300,
    layout: { background: { color: 'transparent' }, textColor: '#6b7a8d' },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.03)' },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.05)',
      scaleMargins: { top: 0.08, bottom: 0.28 },
    },
    timeScale: { borderColor: 'rgba(255,255,255,0.05)', timeVisible: true, secondsVisible: false },
    handleScroll: true,
    handleScale: true,
  });
  if (type === 'candle') {
    tvSeries = tvChart.addCandlestickSeries({
      upColor: '#00e676',
      downColor: '#ff5252',
      borderUpColor: '#00e676',
      borderDownColor: '#ff5252',
      wickUpColor: '#00e676',
      wickDownColor: '#ff5252',
    });
    tvSeries.setData(
      data.map((c) => ({
        time: c.date,
        open: c.open || c.close,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
  } else {
    tvSeries = tvChart.addAreaSeries({
      lineColor: isUp ? '#00e676' : '#ff5252',
      topColor: isUp ? 'rgba(0,230,118,0.2)' : 'rgba(255,82,82,0.15)',
      bottomColor: isUp ? 'rgba(0,230,118,0)' : 'rgba(255,82,82,0)',
      lineWidth: 2,
    });
    tvSeries.setData(data.map((c) => ({ time: c.date, value: c.close })));
  }
  if (activeIndicators.ema9 && data.length >= 9) {
    const s = tvChart.addLineSeries({
      color: 'rgba(0,230,118,0.7)',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    s.setData(calcEMA(data, 9));
    chartSeriesMap.ema9 = s;
  }
  if (activeIndicators.ma20 && data.length >= 20) {
    const s = tvChart.addLineSeries({
      color: 'rgba(255,171,64,0.7)',
      lineWidth: 1,
      lineStyle: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    s.setData(calcSMA(data, 20));
    chartSeriesMap.ma20 = s;
  }
  if (activeIndicators.ma50 && data.length >= 50) {
    const s = tvChart.addLineSeries({
      color: 'rgba(68,138,255,0.6)',
      lineWidth: 1,
      lineStyle: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    s.setData(calcSMA(data, 50));
    chartSeriesMap.ma50 = s;
  }
  if (activeIndicators.bb && data.length >= 20) {
    const bb = calcBB(data, 20);
    const bU = tvChart.addLineSeries({
      color: 'rgba(224,64,251,0.5)',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const bM = tvChart.addLineSeries({
      color: 'rgba(224,64,251,0.3)',
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const bL = tvChart.addLineSeries({
      color: 'rgba(224,64,251,0.5)',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    bU.setData(bb.upper);
    bM.setData(bb.middle);
    bL.setData(bb.lower);
    chartSeriesMap.bb = [bU, bM, bL];
  }
  tvVolSeries = tvChart.addHistogramSeries({
    color: 'rgba(255,255,255,0.06)',
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    scaleMargins: { top: 0.75, bottom: 0 },
  });
  tvVolSeries.setData(
    data.map((c) => ({
      time: c.date,
      value: c.volume || 0,
      color: c.close >= (c.open || c.close) ? 'rgba(0,230,118,0.25)' : 'rgba(255,82,82,0.2)',
    })),
  );
  tvChart.timeScale().fitContent();
  if (activeIndicators.rsi) {
    const rc = document.getElementById('rsiChart');
    if (rc && data.length >= 15) {
      rsiChart = LightweightCharts.createChart(rc, {
        width: rc.clientWidth,
        height: 90,
        layout: { background: { color: 'transparent' }, textColor: '#6b7a8d' },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.02)' },
          horzLines: { color: 'rgba(255,255,255,0.02)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.05)',
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: { borderColor: 'rgba(255,255,255,0.05)', timeVisible: false },
        handleScroll: false,
        handleScale: false,
      });
      rsiSeries = rsiChart.addLineSeries({
        color: '#ff5252',
        lineWidth: 1,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      rsiSeries.setData(calcRSI(data, 14));
      const ob = rsiChart.addLineSeries({
        color: 'rgba(255,82,82,0.25)',
        lineWidth: 1,
        lineStyle: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const os = rsiChart.addLineSeries({
        color: 'rgba(0,230,118,0.25)',
        lineWidth: 1,
        lineStyle: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const times = data.map((c) => c.date);
      ob.setData(times.map((t) => ({ time: t, value: 70 })));
      os.setData(times.map((t) => ({ time: t, value: 30 })));
      rsiChart.timeScale().fitContent();
      new ResizeObserver(() => {
        if (rsiChart && rc) rsiChart.applyOptions({ width: rc.clientWidth });
      }).observe(rc);
    }
  }
  if (activeIndicators.macd) {
    const mc = document.getElementById('macdChart');
    if (mc && data.length >= 35) {
      macdChart = LightweightCharts.createChart(mc, {
        width: mc.clientWidth,
        height: 90,
        layout: { background: { color: 'transparent' }, textColor: '#6b7a8d' },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.02)' },
          horzLines: { color: 'rgba(255,255,255,0.02)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.05)',
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: { borderColor: 'rgba(255,255,255,0.05)', timeVisible: false },
        handleScroll: false,
        handleScale: false,
      });
      const md = calcMACD(data);
      macdHistSeries = macdChart.addHistogramSeries({
        lastValueVisible: false,
        priceLineVisible: false,
      });
      macdLineSeries = macdChart.addLineSeries({
        color: '#00e676',
        lineWidth: 1,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      macdSignalSeries = macdChart.addLineSeries({
        color: '#ff5252',
        lineWidth: 1,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      if (md.hist.length) macdHistSeries.setData(md.hist);
      if (md.macd.length) macdLineSeries.setData(md.macd);
      if (md.signal.length) macdSignalSeries.setData(md.signal);
      macdChart.timeScale().fitContent();
      new ResizeObserver(() => {
        if (macdChart && mc) macdChart.applyOptions({ width: mc.clientWidth });
      }).observe(mc);
    }
  }
  new ResizeObserver(() => {
    if (tvChart && container) tvChart.applyOptions({ width: container.clientWidth });
  }).observe(container);
}

function filterByRange(candles, range) {
  if (!candles) return [];
  if (range === '1mo') return candles.slice(-22);
  if (range === '3mo') return candles.slice(-65);
  if (range === '6mo') return candles.slice(-130);
  return candles;
}
function setRange(range, el) {
  document.querySelectorAll('.chart-tab').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
  currentRange = range;
  if (tvChart) {
    tvChart.remove();
    tvChart = null;
  }
  initTVChart(currentCandles, currentChartType);
}
function setChartType(type, el) {
  document.querySelectorAll('.chart-type-tab').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
  currentChartType = type;
  if (tvChart) {
    tvChart.remove();
    tvChart = null;
  }
  initTVChart(currentCandles, type);
}

// ── HELPERS ────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function safe(v, fb = '—') {
  return v != null && v !== '' ? v : fb;
}
function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function safeArr(a) {
  return Array.isArray(a) ? a : [];
}
function fmtPrice(v) {
  if (!v && v !== 0) return '—';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
}
function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'Jt';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return v.toLocaleString('id-ID');
}
function extractNum(str) {
  if (typeof str === 'number') return str;
  const m = String(str || '').match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
function extractPrice(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.replace(/[Rp\s.,]/g, '').replace(/\./g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}
function extractPriceMax(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/[\d\.,]+\s*-\s*([\d\.,]+)/);
  if (match) {
    const num = parseInt(match[1].replace(/[Rp\s.,]/g, ''), 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

// ── BUILD RESULT (STOCKSLY STYLE) ───────────────────────────────────
function buildResult(ticker, d) {
  const pd  = d.priceData     || {};
  const ind = d.indicators    || {};
  const vol = d.volumeData    || {};
  const sc  = d.scoringData   || {};
  
  const finalScore = sc.final ?? extractNum(d.scoreTeknikal) ?? 5;
  const scorePercent = finalScore * 10;
  
  let recLabel = 'TAHAN';
  let recClass = 'neutral';
  if (finalScore >= 8) { recLabel = 'BUY'; recClass = 'buy'; }
  else if (finalScore >= 6) { recLabel = 'BUY ON WEAKNESS'; recClass = 'buy-weakness'; }
  else if (finalScore >= 4) { recLabel = 'NEUTRAL'; recClass = 'neutral'; }
  else if (finalScore >= 2) { recLabel = 'SELL ON STRENGTH'; recClass = 'sell-strength'; }
  else { recLabel = 'AVOID'; recClass = 'avoid'; }
  
  let riskProfile = 'MODERAT';
  let riskClass = 'moderat';
  const atrPct = ind.atr?.atrPct || 0;
  if (atrPct > 5) { riskProfile = 'AGRESIF'; riskClass = 'agresif'; }
  else if (atrPct < 2) { riskProfile = 'KONSERVATIF'; riskClass = 'konservatif'; }
  
  const smfRatio = vol.smartMoneyFlow?.ratio ?? 50;
  const smfBias = vol.smartMoneyFlow?.bias || 'mild_buying';
  
  const lastPrice = pd.current || 0;
  const ma20 = ind.ma?.ma20 || 0;
  const ma50 = ind.ma?.ma50 || 0;
  const aboveMA20 = lastPrice > ma20;
  const aboveMA50 = lastPrice > ma50;
  
  let volBadge = 'NORMAL';
  let volClass = 'normal';
  if (atrPct > 8) { volBadge = 'EXTREME'; volClass = 'extreme'; }
  else if (atrPct > 5) { volBadge = 'HIGH'; volClass = 'high'; }
  else if (atrPct > 2) { volBadge = 'MEDIUM'; volClass = 'medium'; }
  
  const rr = sc.riskReward || 'Moderate';
  let complexity = 'LOW';
  if (atrPct > 8 || vol.spike?.isSpike) complexity = 'HIGH';
  else if (atrPct > 4) complexity = 'MEDIUM';
  
  const entryMin = d.levelBeli ? extractPrice(d.levelBeli) : null;
  const entryMax = d.levelBeli ? extractPriceMax(d.levelBeli) : null;
  
  const chartHtml = pd.current ? `
  <div class="chart-card">
    <div class="chart-hdr">
      <div class="chart-title">📊 PRICE CHART</div>
      <div class="chart-ctrls">
        <div style="display:flex;gap:2px">
          <span class="ctab ctab-type active" onclick="setChartType('candle',this)">Candle</span>
          <span class="ctab ctab-type" onclick="setChartType('area',this)">Area</span>
        </div>
        <div style="display:flex;gap:2px">
          <span class="ctab" onclick="setRange('1mo',this)">1B</span>
          <span class="ctab active" onclick="setRange('3mo',this)">3B</span>
          <span class="ctab" onclick="setRange('6mo',this)">6B</span>
          <span class="ctab" onclick="setRange('all',this)">Max</span>
        </div>
      </div>
    </div>
    <div id="tvChart"></div>
    <div class="ind-toggles">
      <span class="ind-toggle on-ma20" id="tog-ma20" onclick="toggleIndicator('ma20')">MA20</span>
      <span class="ind-toggle on-ma50" id="tog-ma50" onclick="toggleIndicator('ma50')">MA50</span>
      <span class="ind-toggle on-ema9" id="tog-ema9" onclick="toggleIndicator('ema9')">EMA9</span>
      <span class="ind-toggle off-bb"   id="tog-bb" 
