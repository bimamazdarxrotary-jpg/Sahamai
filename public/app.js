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
function getBadgeClass(s) {
  if (!s) return 'sent-tahan';
  const u = (s || '').toUpperCase();
  if (u === 'BELI' || u === 'BULLISH' || u === 'AKUMULASI') return 'sent-beli';
  if (u === 'JUAL' || u === 'BEARISH' || u === 'KURANGI') return 'sent-jual';
  return 'sent-tahan';
}
function getScoreColor(n) {
  n = parseFloat(n) || 0;
  if (n >= 7) return '#00e676';
  if (n >= 5) return '#ffab40';
  return '#ff5252';
}
function getScoreGrad(n) {
  if (n >= 7) return 'linear-gradient(90deg,#00c853,#00e676)';
  if (n >= 5) return 'linear-gradient(90deg,#e65100,#ffab40)';
  return 'linear-gradient(90deg,#b71c1c,#ff5252)';
}
function extractNum(str) {
  if (typeof str === 'number') return str;
  const m = String(str || '').match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
function phaseColor(p) {
  const m = {
    markup: 'g',
    markdown: 'r',
    accumulation: 'gold',
    distribution: 'r',
    consolidation: 'blue',
  };
  return m[p] || 'blue';
}
function trendIcon(d) {
  return d === 'uptrend' ? '↑' : d === 'downtrend' ? '↓' : '→';
}

// ── BUILD RESULT ───────────────────────────────────────────────────
function buildResult(ticker, d) {
  const pd  = d.priceData     || {};
  const ind = d.indicators    || {};
  const vol = d.volumeData    || {};
  const str = d.structureData || {};
  const sc  = d.scoringData   || {};
  const isIndex = ['IHSG','LQ45'].includes(ticker);
  const sentiment = safe(d.sentiment, 'TAHAN');
  const today = new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  const finalScore = sc.final ?? extractNum(d.scoreTeknikal) ?? 5;
  const hasNews = !!(d.newsData && (d.newsData.emiten?.length || d.newsData.makro?.length));

  // ── SIGNAL STRIP ─────────────────────────────────────────────────
  const signalsHtml = d.scanSignals && d.scanSignals.length
    ? `<div class="signals">${d.scanSignals.map(s => {
        const icons = {breakout:'🚀',volume_spike:'📊',oversold:'🔻',golden_cross:'✨',
          accumulation:'📦',macd_cross:'⚡',ready_pump:'🎯',death_cross:'💀',
          divergence:'🔁',mfi_oversold:'💧',candlestick:'🕯️',fib_level:'📐'};
        return `<span class="sig ${s.strength||'medium'}">${icons[s.type]||'🔔'} ${esc(s.label)}</span>`;
      }).join('')}</div>` : '';

  // ── TICKER HEADER ─────────────────────────────────────────────────
  const tickerCard = `
  <div class="card" style="margin-bottom:8px">
    <div class="ticker-hdr">
      <div>
        <div class="t-code">${ticker}</div>
        <div class="t-name">${esc(d.namaLengkap || ticker)}</div>
        <span class="t-sector">${esc(d.sektor || 'IDX')}</span>
      </div>
      <div>
        ${pd.current ? `
        <div class="t-price">${fmtPrice(pd.current)}</div>
        <div class="t-chg ${pd.isUp?'up':'down'}">${pd.isUp?'+':''}${fmtPrice(pd.change)} (${pd.isUp?'+':''}${pd.changePct}%)</div>` : ''}
        <div style="display:flex;align-items:center;gap:5px;margin-top:7px;justify-content:flex-end;flex-wrap:wrap">
          <span class="badge ${getBadgeClass(sentiment)}">${sentiment}</span>
          <span class="conf conf-${(sc.confidence||'medium').toLowerCase()}">${sc.confidence||'Medium'}</span>
        </div>
        ${!isIndex ? `<div style="text-align:right;margin-top:7px"><span class="wl-add-btn" onclick="addToWatchlist('${ticker}')">⭐ Watchlist</span></div>` : ''}
      </div>
    </div>
    <div style="border-top:1px solid var(--bdr);padding-top:.9rem;margin-top:.5rem">
      <div style="font-size:8px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:2px;margin-bottom:7px">SKOR SENTIMEN</div>
      <div class="score-hero">
        <div class="score-num" style="color:${getScoreColor(finalScore)}">${finalScore}<span class="score-denom">/10</span></div>
        <div class="score-meta">
          <div class="score-track"><div class="score-fill" style="width:${finalScore*10}%;background:${getScoreGrad(finalScore)}"></div></div>
          <div class="score-lbl">${esc(sc.recommendation||'TAHAN')} · ${esc(sc.confidence||'Medium')} Confidence · R/R: ${esc(sc.riskReward||'—')}</div>
        </div>
      </div>
    </div>
  </div>`;

  // ── 4-PANEL GRID (Stocksly-style) ─────────────────────────────────
  // Panel 1: Score Sentimen visual
  const smfData = vol.smartMoneyFlow || {};
  const obvTrend = vol.obv ? vol.obv.trend : 'unknown';
  const smfRatio = smfData.ratio || 50;
  const smfBull = smfData.bias === 'strong_buying' || smfData.bias === 'mild_buying';

  const p1 = `
  <div class="panel-score">
    <div class="panel-lbl g">📊 Score Sentimen</div>
    <div class="panel-big g">${finalScore}<span style="font-size:1rem;color:var(--text3)">/10</span></div>
    <div class="panel-sub">${esc(sc.recommendation||'TAHAN')} · ${esc(sc.riskReward||'Moderate')}</div>
    <div style="margin-top:.5rem;display:flex;flex-wrap:wrap;gap:3px">
      ${sc.breakdown ? `
        <span class="pill pill-${sc.breakdown.trend?.score>=6?'g':'r'}">Tren ${sc.breakdown.trend?.score||'—'}</span>
        <span class="pill pill-${sc.breakdown.volume?.score>=6?'g':'r'}">Vol ${sc.breakdown.volume?.score||'—'}</span>
        <span class="pill pill-${sc.breakdown.momentum?.score>=6?'g':'r'}">Mom ${sc.breakdown.momentum?.score||'—'}</span>
      ` : ''}
    </div>
  </div>`;

  // Panel 2: Smart Money Flow (pengganti Dana Asing)
  const p2 = `
  <div class="panel-smf">
    <div class="panel-lbl gold">🧠 Smart Money Flow</div>
    <div class="panel-big ${smfBull?'gold':'r'}">${smfRatio}<span style="font-size:.9rem">%</span></div>
    <div class="panel-sub">${esc(smfData.label||'—')}</div>
    <div class="smf-bar">
      <div class="smf-row">
        <span class="smf-lbl" style="color:var(--emerald)">BUY</span>
        <div class="smf-track"><div class="smf-fill-g" style="width:${smfRatio}%"></div></div>
        <span class="smf-val" style="color:var(--emerald)">${smfRatio}%</span>
      </div>
      <div class="smf-row">
        <span class="smf-lbl" style="color:var(--red)">SELL</span>
        <div class="smf-track"><div class="smf-fill-r" style="width:${100-smfRatio}%"></div></div>
        <span class="smf-val" style="color:var(--red)">${100-smfRatio}%</span>
      </div>
    </div>
    <div style="margin-top:.4rem"><span class="pill ${obvTrend==='rising'?'pill-g':'pill-r'}">OBV ${esc(obvTrend)}</span> ${vol.accDist ? `<span class="pill ${vol.accDist.bias==='accumulation'?'pill-g':'pill-r'}">${esc(vol.accDist.bias||'').toUpperCase()}</span>` : ''}</div>
  </div>`;

  // Panel 3: Kondisi Harga
  const ma20ok = ind.ma && pd.current && ind.ma.ma20 && pd.current > ind.ma.ma20;
  const ma50ok = ind.ma && pd.current && ind.ma.ma50 && pd.current > ind.ma.ma50;
  const macdOk = ind.macd && ind.macd.trend === 'bullish';
  const volOk  = vol.spike ? !vol.spike.isSpike || vol.accDist?.bias === 'accumulation' : true;

  const p3 = `
  <div class="panel-kondisi">
    <div class="panel-lbl text2">⚡ Kondisi Harga</div>
    <div style="display:flex;align-items:baseline;gap:5px;margin:.3rem 0">
      <span style="font-family:var(--mono);font-size:1.5rem;font-weight:800">${ind.rsi??'—'}</span>
      <span style="font-size:9px;color:var(--text3);font-family:var(--mono)">RSI</span>
      <span style="font-size:1.1rem;font-weight:700;font-family:var(--mono);margin-left:8px">${ind.ma?.ma20?fmtPrice(ind.ma.ma20):'—'}</span>
      <span style="font-size:9px;color:var(--text3);font-family:var(--mono)">MA20</span>
    </div>
    <div class="cond-chips">
      <span class="cond-chip ${ma20ok?'cond-ok':'cond-bad'}">MA20 ${ma20ok?'✓':'✗'}</span>
      <span class="cond-chip ${ma50ok?'cond-ok':'cond-bad'}">MA50 ${ma50ok?'✓':'✗'}</span>
      <span class="cond-chip ${macdOk?'cond-ok':'cond-warn'}">MACD ${macdOk?'BULL':'BEAR'}</span>
      <span class="cond-chip ${volOk?'cond-ok':'cond-warn'}">VOL ${volOk?'OK':'SPIKE'}</span>
      ${ind.atr ? `<span class="cond-chip ${ind.atr.atrPct>4?'cond-bad':ind.atr.atrPct>2?'cond-warn':'cond-ok'}">ATR ${ind.atr.atrPct}%</span>` : ''}
    </div>
  </div>`;

  // Panel 4: Entry Area
  const p4 = `
  <div class="panel-entry">
    <div class="panel-lbl b">🎯 Entry Area</div>
    <div class="entry-range">${esc(d.levelBeli||'—')}</div>
    <div class="entry-sub">RECOMMENDED ZONE</div>
    <div style="display:flex;gap:6px;margin-top:.5rem;flex-wrap:wrap">
      ${d.stopLoss ? `<span class="pill pill-r">SL: ${esc(d.stopLoss)}</span>` : ''}
      ${d.targetHarga ? `<span class="pill pill-g">TP: ${esc(d.targetHarga)}</span>` : ''}
    </div>
    ${vol.vwap ? `<div style="margin-top:.4rem;font-size:9px;color:var(--text3);font-family:var(--mono)">VWAP: ${fmtPrice(vol.vwap)}</div>` : ''}
  </div>`;

  const panelGrid = !isIndex ? `
  <div class="grid-2" style="margin-bottom:8px">
    ${p1}${p2}
  </div>
  <div class="grid-2" style="margin-bottom:8px">
    ${p3}${p4}
  </div>` : `
  <div class="grid-2" style="margin-bottom:8px">
    ${p1}${p2}
  </div>`;

  // ── RISK MANAGEMENT ────────────────────────────────────────────────
  const riskPanel = !isIndex && (d.targetHarga || d.stopLoss || d.levelBeli) ? `
  <div class="risk-panel">
    <div class="card-lbl" style="margin-bottom:.75rem">⚠️ MANAJEMEN RISIKO</div>
    <div class="risk-grid">
      <div class="risk-item">
        <div class="risk-lbl">STOP LOSS</div>
        <div class="risk-val r">${esc(d.stopLoss||'—')}</div>
        <div class="risk-note">Batas cut loss</div>
      </div>
      <div class="risk-item">
        <div class="risk-lbl">TARGET 1</div>
        <div class="risk-val g">${esc(d.targetHarga||'—')}</div>
        <div class="risk-note">Profit taking</div>
      </div>
      <div class="risk-item">
        <div class="risk-lbl">HARGA WAJAR</div>
        <div class="risk-val gold">${esc(d.priceEst||'—')}</div>
        <div class="risk-note">Fair value est.</div>
      </div>
    </div>
    ${sc.riskReward ? `<div style="margin-top:.6rem;font-size:9px;color:var(--text3);font-family:var(--mono)">Risk/Reward: ${esc(sc.riskReward)}</div>` : ''}
  </div>` : '';

  // ── CHART ──────────────────────────────────────────────────────────
  const chartCard = pd.current ? `
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
      <span class="ind-toggle off-bb"   id="tog-bb"   onclick="toggleIndicator('bb')">BB</span>
      <span class="ind-toggle off-rsi"  id="tog-rsi"  onclick="toggleIndicator('rsi')">RSI</span>
      <span class="ind-toggle off-macd" id="tog-macd" onclick="toggleIndicator('macd')">MACD</span>
    </div>
    <div class="subpanel" id="panel-rsi"><div class="subpanel-lbl">RSI(14)</div><div id="rsiChart"></div></div>
    <div class="subpanel" id="panel-macd"><div class="subpanel-lbl">MACD(12,26,9)</div><div id="macdChart"></div></div>
  </div>` : '';

  // ── STAT ROW ───────────────────────────────────────────────────────
  const statRow = pd.current ? `
  <div class="grid-4" style="margin-bottom:8px">
    <div class="stat"><div class="stat-l">52W HIGH</div><div class="stat-v g">${fmtPrice(pd.high52w)}</div></div>
    <div class="stat"><div class="stat-l">52W LOW</div><div class="stat-v">${fmtPrice(pd.low52w)}</div></div>
    <div class="stat"><div class="stat-l">RSI(14)</div><div class="stat-v ${ind.rsi<30?'g':ind.rsi>70?'r':'gold'}">${ind.rsi??'—'}</div></div>
    <div class="stat"><div class="stat-l">VOLUME</div><div class="stat-v">${fmtVol(pd.volume)}</div></div>
  </div>` : '';

  // ── WHY NOW ────────────────────────────────────────────────────────
  const whyNow = d.whyNow ? `
  <div class="why-now">
    <div class="why-lbl">⚡ WHY NOW</div>
    <div class="why-text">${esc(d.whyNow)}</div>
  </div>` : '';

  // ── SCORE BREAKDOWN ────────────────────────────────────────────────
  const scorePanel = sc.breakdown ? `
  <div class="card">
    <div class="card-hdr">
      <div class="card-lbl">Scoring Deterministik</div>
      <div style="font-family:var(--mono);font-size:1.3rem;font-weight:700;color:${getScoreColor(finalScore)}">${finalScore}<span style="font-size:.8rem;color:var(--text3)">/10</span></div>
    </div>
    <div class="breakdown-grid">
      ${['trend','volume','momentum','risk','setup'].map(k => {
        const item = sc.breakdown[k];
        if (!item) return '';
        const isRisk = k === 'risk';
        const ds = isRisk ? 10-item.score : item.score;
        const labels = {trend:'TREN',volume:'VOLUME',momentum:'MOMENTUM',risk:'SAFETY',setup:'SETUP'};
        return `<div class="bk-item">
          <div class="bk-lbl">${labels[k]}</div>
          <div class="bk-num" style="color:${getScoreColor(ds)}">${ds}</div>
          <div class="bk-bar"><div class="bk-fill" style="width:${ds*10}%;background:${getScoreGrad(ds)}"></div></div>
          <div class="bk-reasons">${(item.reasons||[]).slice(0,2).map(r=>'• '+esc(r)).join('<br>')}</div>
        </div>`;
      }).join('')}
    </div>
  </div>` : '';

  // ── INTEL GRID ─────────────────────────────────────────────────────
  const intelGrid = ind.bb || ind.macd || ind.stoch || ind.atr ? `
  <div class="grid-2" style="margin-bottom:8px">
    ${ind.bb ? `<div class="intel"><div class="intel-l">BOLLINGER BANDS</div><div class="intel-v" style="color:${ind.bb.position==='overbought_zone'?'var(--red)':ind.bb.position==='oversold_zone'?'var(--emerald)':'var(--text)'}">${(ind.bb.position||'').replace(/_/g,' ')}</div><div class="intel-s">BW: ${ind.bb.bandwidth}% · U: ${fmtPrice(ind.bb.upper)} / L: ${fmtPrice(ind.bb.lower)}</div></div>` : ''}
    ${ind.macd ? `<div class="intel"><div class="intel-l">MACD</div><span class="pill pill-${ind.macd.trend==='bullish'?'g':'r'}">${(ind.macd.trend||'').toUpperCase()}</span>${ind.macd.crossover?`<span class="pill pill-gold" style="margin-left:3px">${ind.macd.crossover.replace(/_/g,' ').toUpperCase()}</span>`:''}<div class="intel-s" style="margin-top:4px">Hist: ${ind.macd.histogram??'—'}</div></div>` : ''}
    ${ind.stoch ? `<div class="intel"><div class="intel-l">STOCHASTIC</div><span class="pill pill-${ind.stoch.signal==='oversold'?'g':ind.stoch.signal==='overbought'?'r':'gold'}">${(ind.stoch.signal||'').toUpperCase()}</span><div class="intel-s" style="margin-top:4px">K: ${ind.stoch.k} · D: ${ind.stoch.d}</div></div>` : ''}
    ${ind.atr ? `<div class="intel"><div class="intel-l">VOLATILITAS ATR</div><div class="intel-v">${fmtPrice(ind.atr.atr)}</div><div class="intel-s">${ind.atr.atrPct}% — ${ind.atr.atrPct>4?'⚠️ Sangat Volatil':ind.atr.atrPct>2?'Volatil':'Stabil'}</div></div>` : ''}
  </div>` : '';

  // ── S&R ────────────────────────────────────────────────────────────
  const srCard = ind.levels && (ind.levels.support?.length || ind.levels.resistance?.length) ? `
  <div class="grid-2" style="margin-bottom:8px">
    <div class="card" style="margin-bottom:0"><div class="card-lbl">Support</div><div style="margin-top:.6rem">${(ind.levels.support||[]).map(l=>`<div style="font-family:var(--mono);font-size:.88rem;font-weight:700;color:var(--emerald);margin-bottom:3px">${fmtPrice(l)}</div>`).join('')||'<span style="color:var(--text3);font-size:11px">—</span>'}</div></div>
    <div class="card" style="margin-bottom:0"><div class="card-lbl red">Resistance</div><div style="margin-top:.6rem">${(ind.levels.resistance||[]).map(l=>`<div style="font-family:var(--mono);font-size:.88rem;font-weight:700;color:var(--red);margin-bottom:3px">${fmtPrice(l)}</div>`).join('')||'<span style="color:var(--text3);font-size:11px">—</span>'}</div></div>
  </div>` : '';

  // ── SETUPS ─────────────────────────────────────────────────────────
  const setupsSection = safeArr(str.setups).length ? `
  <div class="card">
    <div class="card-lbl">Setup Terdeteksi</div>
    <div style="margin-top:.75rem">
      ${safeArr(str.setups).map(s => `
      <div class="setup ${s.confidence}">
        <div class="setup-type" style="color:${s.direction==='long'?'var(--emerald)':s.direction==='short'?'var(--red)':'var(--text2)'}">${esc(s.type?.replace(/_/g,' '))} · ${esc(s.direction)} · ${esc(s.confidence)}</div>
        <div class="setup-reason">${esc(s.reason)}</div>
      </div>`).join('')}
    </div>
  </div>` : '';

  // ── SMART MONEY ────────────────────────────────────────────────────
  const smCard = (d.bandarSmartMoney || d.smartMoneySignal) && (d.bandarSmartMoney||d.smartMoneySignal) !== 'Tidak terdeteksi.'
    ? `<div class="smoney-card"><div class="smoney-lbl">🧠 Smart Money & Bandar</div><div class="smoney-text">${esc(d.bandarSmartMoney||d.smartMoneySignal)}</div></div>`
    : '';

  // ── MAIN AI CARD ───────────────────────────────────────────────────
  const mainCard = `
  <div class="card">
    <div class="card-hdr"><div class="card-lbl">Analisis AI Mendalam</div></div>
    <div style="font-size:.88rem;color:var(--text2);line-height:1.9;margin-bottom:1rem">${esc(d.summary)}</div>
    <div style="background:var(--bg3);border:1px solid var(--bdr);border-radius:8px;padding:.9rem">
      <div style="font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--emerald);margin-bottom:5px;font-family:var(--mono)">REKOMENDASI AKSI</div>
      <div style="font-size:.86rem;color:var(--text2);line-height:1.8">${esc(d.rekomendasi)}</div>
    </div>
  </div>`;

  // ── BULL/BEAR ──────────────────────────────────────────────────────
  const thesis = safeArr(d.bullThesis).length || safeArr(d.bearThesis).length ? `
  <div class="grid-2" style="margin-bottom:8px">
    <div class="card" style="margin-bottom:0"><div class="card-lbl">🐂 Bull Thesis</div><div class="tags">${safeArr(d.bullThesis).map(t=>`<span class="tag g">${esc(t)}</span>`).join('')}</div></div>
    <div class="card" style="margin-bottom:0"><div class="card-lbl red">🐻 Bear Thesis</div><div class="tags">${safeArr(d.bearThesis).map(t=>`<span class="tag r">${esc(t)}</span>`).join('')}</div></div>
  </div>` : '';

  // ── ANALYSIS CARDS ─────────────────────────────────────────────────
  const analysisCards = !isIndex ? `
  <div class="grid-2" style="margin-bottom:8px">
    <div class="card" style="margin-bottom:0"><div class="card-lbl blue">📈 Teknikal</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.analisisTeknikal)}</div></div>
    <div class="card" style="margin-bottom:0"><div class="card-lbl gold">📊 Fundamental</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.analisisFundamental)}</div></div>
  </div>` : `
  <div class="grid-2" style="margin-bottom:8px">
    <div class="card" style="margin-bottom:0"><div class="card-lbl">💪 Sektor Kuat</div><div class="tags">${safeArr(d.sektorKuat).map(s=>`<span class="tag g">${esc(s)}</span>`).join('')}</div></div>
    <div class="card" style="margin-bottom:0"><div class="card-lbl red">📉 Sektor Lemah</div><div class="tags">${safeArr(d.sektorLemah).map(s=>`<span class="tag r">${esc(s)}</span>`).join('')}</div></div>
  </div>`;

  // ── KRK ────────────────────────────────────────────────────────────
  const krkSection = `
  <div class="grid-2" style="margin-bottom:8px">
    <div class="card" style="margin-bottom:0"><div class="card-lbl">✅ Keunggulan</div><div class="tags">${safeArr(d.keunggulan).map(k=>`<span class="tag g">${esc(k)}</span>`).join('')}</div></div>
    <div class="card" style="margin-bottom:0"><div class="card-lbl red">⚠️ Risiko</div><div class="tags">${safeArr(d.risiko).map(r=>`<span class="tag r">${esc(r)}</span>`).join('')}</div></div>
  </div>
  <div class="card" style="margin-bottom:8px"><div class="card-lbl gold">🚀 Katalis</div><div class="tags">${safeArr(d.katalis).map((k,i)=>{const neg=/risiko|waspada|ancaman|negatif|turun|melemah|tekanan/i.test(k);return `<span class="tag ${neg?'r':i===0?'g':''}">${esc(k)}</span>`;}).join('')}</div></div>`;

  // ── METRICS ────────────────────────────────────────────────────────
  const metricsRow = `
  <div class="grid-4" style="margin-bottom:8px">
    <div class="stat"><div class="stat-l">P/E</div><div class="stat-v">${esc(safe(d.pe))}</div></div>
    <div class="stat"><div class="stat-l">P/BV</div><div class="stat-v">${esc(safe(d.pbv))}</div></div>
    <div class="stat"><div class="stat-l">DIV YIELD</div><div class="stat-v gold">${esc(safe(d.divYield))}</div></div>
    <div class="stat"><div class="stat-l">BETA</div><div class="stat-v">${esc(safe(d.beta))}</div></div>
  </div>`;

  // ── POSISI KOMPETITIF ──────────────────────────────────────────────
  const kompCard = !isIndex && d.posisiKompetitif ? `
  <div class="card" style="margin-bottom:8px"><div class="card-lbl blue">🏆 Posisi Kompetitif</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.posisiKompetitif)}</div></div>` : '';

  // ── SEKTOR CTX ─────────────────────────────────────────────────────
  const sectorCtx = d.sektorContext && !isIndex ? `
  <div class="card" style="margin-bottom:8px"><div class="card-lbl blue">🔄 Konteks Sektor</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.sektorContext)}</div></div>` : '';

  // ── REKOMENADSI SAHAM ──────────────────────────────────────────────
  const rekSaham = isIndex && safeArr(d.rekomendasiSaham).length ? `
  <div class="card" style="margin-bottom:8px"><div class="card-lbl blue">⭐ Saham Pilihan</div><div class="tags">${safeArr(d.rekomendasiSaham).map(s=>`<span class="tag gold">${esc(s)}</span>`).join('')}</div></div>` : '';

  // ── NEWS ───────────────────────────────────────────────────────────
  const newsCard = d.newsData && (safeArr(d.newsData.emiten).length || safeArr(d.newsData.makro).length) ? `
  <div class="card" style="margin-bottom:8px">
    <div class="card-lbl">📰 Berita Terkini</div>
    <div style="margin-top:.75rem">
      ${safeArr(d.newsData.emiten).slice(0,3).map(n=>`
      <div style="padding:7px 0;border-bottom:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--text);line-height:1.5;margin-bottom:2px">${esc(n.title)}</div>
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono)">${esc(n.date)} · ${esc(n.source)}</div>
      </div>`).join('')}
      ${safeArr(d.newsData.makro).slice(0,2).map(n=>`
      <div style="padding:7px 0;border-bottom:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:2px">${esc(n.title)}</div>
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono)">${esc(n.date)} · MAKRO</div>
      </div>`).join('')}
    </div>
  </div>` : '';

  // ── PRO INDICATORS ─────────────────────────────────────────────────
  const ind2 = d.indicators || {};
  const proInds = [];
  if (ind2.divergence?.detected) proInds.push(`<span class="pill pill-${ind2.divergence.bias==='bullish'?'g':'r'}">${ind2.divergence.bias==='bullish'?'Bullish':'Bearish'} Divergence</span>`);
  if (ind2.candlestick?.topPattern) proInds.push(`<span class="pill pill-gold">${esc(ind2.candlestick.topPattern.name)}</span>`);
  if (ind2.fibonacci?.atKeyLevel) proInds.push(`<span class="pill pill-b">Fib Level Kunci</span>`);
  if (ind2.relStrength?.trend==='outperform') proInds.push(`<span class="pill pill-g">RS Outperform ${ind2.relStrength.rsScore}</span>`);

  const proSection = proInds.length ? `
  <div class="card" style="margin-bottom:8px">
    <div class="card-lbl">🔬 Indikator Pro</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:.6rem">${proInds.join('')}</div>
    ${ind2.fibonacci ? `<div style="font-size:10px;color:var(--text2);margin-top:.5rem;line-height:1.6">${esc(ind2.fibonacci.narrative||'')}</div>` : ''}
  </div>` : '';

  // ── INFO ───────────────────────────────────────────────────────────
  const infoCard = `
  <div class="card">
    <div class="card-lbl">📋 Informasi</div>
    <table class="info-table" style="margin-top:.75rem">
      <tr><td>Kode Saham</td><td>${ticker}${!isIndex?'.JK':''}</td></tr>
      <tr><td>Sektor</td><td>${esc(safe(d.sektor,'IDX'))}</td></tr>
      <tr><td>Bursa</td><td>IDX / Bursa Efek Indonesia</td></tr>
      <tr><td>Dianalisis</td><td>${today}</td></tr>
      ${d.latencyMs?`<tr><td>Waktu analisis</td><td>${d.latencyMs}ms</td></tr>`:''}
      ${d.fromCache?`<tr><td>Data</td><td style="color:var(--emerald)">⚡ Cache</td></tr>`:''}
      ${hasNews?`<tr><td>Berita</td><td style="color:var(--emerald)">✓ Tersedia</td></tr>`:`<tr><td>Berita</td><td style="color:var(--text3)">Tidak tersedia</td></tr>`}
    </table>
  </div>`;

  // ── ASSEMBLE ───────────────────────────────────────────────────────
  return `
    ${signalsHtml}
    ${tickerCard}
    ${panelGrid}
    ${riskPanel}
    ${chartCard}
    ${statRow}
    ${whyNow}
    ${scorePanel}
    ${intelGrid}
    ${srCard}
    ${setupsSection}
    ${proSection}
    ${smCard}
    ${mainCard}
    ${thesis}
    ${analysisCards}
    ${kompCard}
    ${metricsRow}
    ${krkSection}
    ${rekSaham}
    ${sectorCtx}
    ${newsCard}
    ${infoCard}
  `;
}

// ── SKELETON ───────────────────────────────────────────────────────
function buildSkeleton() {
  return `
  <div class="card"><div style="display:flex;justify-content:space-between"><div><div class="sk" style="height:2rem;width:120px;margin-bottom:10px"></div><div class="sk" style="height:12px;width:200px"></div></div><div><div class="sk" style="height:1.8rem;width:110px;margin-bottom:8px;margin-left:auto"></div><div class="sk" style="height:12px;width:80px;margin-left:auto"></div></div></div></div>
  <div class="grid-4">${[1, 2, 3, 4, 5, 6].map(() => `<div class="stat-box"><div class="sk" style="height:9px;width:60%;margin-bottom:7px"></div><div class="sk" style="height:1rem;width:80%"></div></div>`).join('')}</div>
  <div class="chart-card"><div class="sk" style="height:300px;border-radius:7px"></div></div>
  <div class="two-col"><div class="card" style="margin-bottom:0"><div class="sk" style="height:9px;width:100px;margin-bottom:12px"></div>${[1, 2, 3].map(() => `<div class="sk" style="height:12px;width:100%;margin-bottom:6px"></div>`).join('')}</div><div class="card" style="margin-bottom:0"><div class="sk" style="height:9px;width:100px;margin-bottom:12px"></div>${[1, 2, 3].map(() => `<div class="sk" style="height:12px;width:100%;margin-bottom:6px"></div>`).join('')}</div></div>
  <div style="margin-bottom:10px"></div>
  <div class="card"><div class="sk" style="height:9px;width:120px;margin-bottom:12px"></div><div class="breakdown-grid">${[1, 2, 3, 4, 5].map(() => `<div class="bk-item"><div class="sk" style="height:9px;width:60%;margin-bottom:7px"></div><div class="sk" style="height:1.2rem;width:40%;margin-bottom:6px"></div><div class="sk" style="height:2px;margin-bottom:6px"></div></div>`).join('')}</div></div>`;
}

// ── WATCHLIST ──────────────────────────────────────────────────────
function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem('sahamai_watchlist') || '[]');
  } catch (e) {
    return [];
  }
}
function saveWatchlist(list) {
  try {
    localStorage.setItem('sahamai_watchlist', JSON.stringify(list));
  } catch (e) {}
}
function addToWatchlist(ticker) {
  const list = getWatchlist();
  if (list.indexOf(ticker) === -1) {
    list.push(ticker);
    saveWatchlist(list);
    renderWatchlist();
    showToast(ticker + ' ditambahkan ke watchlist', 'ok');
  } else {
    showToast(ticker + ' sudah ada di watchlist', '');
  }
}
function removeFromWatchlist(ticker) {
  const list = getWatchlist().filter((t) => t !== ticker);
  saveWatchlist(list);
  renderWatchlist();
}
function renderWatchlist() {
  const list = getWatchlist();
  const bar = document.getElementById('watchlistBar');
  const items = document.getElementById('watchlistItems');
  if (!bar || !items) return;
  if (!list.length) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  items.innerHTML = list
    .map(
      (t) =>
        '<div class="wl-item" onclick="quickAnalyze(\'' +
        t +
        '\')"><span class="wl-ticker">' +
        t +
        '</span><span class="wl-remove" onclick="event.stopPropagation();removeFromWatchlist(\'' +
        t +
        '\')" title="Hapus">×</span></div>',
    )
    .join('');
}
document.addEventListener('DOMContentLoaded', renderWatchlist);

// ── SCANNER ────────────────────────────────────────────────────────
let currentScanFilter = 'all',
  scannerVisible = false;

function toggleScanner() {
  scannerVisible = !scannerVisible;
  const scanSec = document.getElementById('scannerSection');
  const resSec = document.getElementById('resultsSection');
  const wlBar = document.getElementById('watchlistBar');
  const heroSec = document.querySelector('.hero');
  const searchSec = document.querySelector('.search-wrap');
  const chipsSec = document.querySelector('.chips');
  const btn = document.getElementById('navScannerBtn');
  if (scannerVisible) {
    scanSec.style.display = 'block';
    resSec.style.display = 'none';
    if (wlBar) wlBar.style.display = 'none';
    if (heroSec) heroSec.style.display = 'none';
    if (searchSec) searchSec.style.display = 'none';
    if (chipsSec) chipsSec.style.display = 'none';
    btn.classList.add('active');
    btn.textContent = '✕ Tutup';
    scanSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    scanSec.style.display = 'none';
    if (heroSec) heroSec.style.display = '';
    if (searchSec) searchSec.style.display = '';
    if (chipsSec) chipsSec.style.display = '';
    renderWatchlist();
    btn.classList.remove('active');
    btn.textContent = '⚡ Scanner';
  }
}

function setScanFilter(el, filter) {
  currentScanFilter = filter;
  document.querySelectorAll('.sf-btn').forEach((b) => b.classList.remove('active'));
  el.classList.add('active');
}

async function runScanner() {
  const btn = document.getElementById('scanRunBtn'),
    icon = document.getElementById('scanBtnIcon');
  const res = document.getElementById('scannerResults');
  btn.disabled = true;
  icon.className = 'spin';
  icon.textContent = '↻';

  const filterLabel =
    {
      all: 'semua setup',
      bullish: 'saham bullish',
      naik: 'saham naik hari ini',
      breakout: 'breakout',
      volume_spike: 'volume spike',
      oversold: 'oversold',
      golden_cross: 'golden cross',
      accumulation: 'akumulasi',
      death_cross: 'death cross',
    }[currentScanFilter] || currentScanFilter;

  res.innerHTML =
    '<div class="scanner-loading"><div style="font-size:13px;color:var(--text2);margin-bottom:8px;font-family:var(--mono)">Scanning ' +
    filterLabel +
    '...</div><div style="font-size:11px;color:var(--text3);margin-bottom:1rem;font-family:var(--mono)">Menganalisis 50+ saham IHSG</div><div class="progress-bar"><div class="progress-fill" id="scanProgress"></div></div></div>';

  const prog = document.getElementById('scanProgress');
  let pct = 0;
  const progInterval = setInterval(() => {
    pct = Math.min(pct + 2, 90);
    if (prog) prog.style.width = pct + '%';
  }, 300);

  try {
    // NEW: filter bullish/naik ditangani client-side setelah dapat data
    const apiFilter = ['bullish', 'naik'].includes(currentScanFilter) ? 'all' : currentScanFilter;

    const response = await fetch('/api/scanner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: apiFilter }),
    });
    clearInterval(progInterval);
    if (prog) prog.style.width = '100%';
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Scanner gagal');
    }
    let data = await response.json();

    // CLIENT-SIDE filter untuk bullish dan naik
    if (currentScanFilter === 'bullish') {
      data = Object.assign({}, data, {
        results: data.results.filter(
          (item) =>
            item.score >= 6 ||
            item.recommendation === 'BELI' ||
            item.recommendation === 'AKUMULASI',
        ),
        total: 0,
      });
      data.total = data.results.length;
    } else if (currentScanFilter === 'naik') {
      data = Object.assign({}, data, {
        results: data.results
          .filter((item) => item.isUp && item.changePct > 0)
          .sort((a, b) => b.changePct - a.changePct),
        total: 0,
      });
      data.total = data.results.length;
    } else if (currentScanFilter === 'ready_pump') {
      // Filter saham dengan setup matang untuk naik:
      // Score >= 6, RSI < 45 (belum overbought), ada sinyal bullish, tidak downtrend berat
      data = Object.assign({}, data, {
        results: data.results
          .filter((item) => {
            const hasBullishSignal =
              item.signals &&
              item.signals.some(
                (s) => s.direction === 'long' && (s.strength === 'high' || s.strength === 'medium'),
              );
            const rsiOk = item.rsi == null || (item.rsi < 45 && item.rsi > 10);
            const scoreOk = item.score >= 6;
            const notDeathCross =
              !item.signals || !item.signals.some((s) => s.type === 'death_cross');
            return hasBullishSignal && rsiOk && scoreOk && notDeathCross;
          })
          .sort((a, b) => b.score - a.score),
        total: 0,
      });
      data.total = data.results.length;
    }

    renderScanResults(data, currentScanFilter);
    const lastRun = document.getElementById('scanLastRun');
    if (lastRun) {
      const now = new Date();
      lastRun.textContent =
        (data.fromCache ? '⚡ Cache — ' : ' ') +
        '✅ ' +
        data.total +
        ' ditemukan · ' +
        now.toLocaleTimeString('id-ID');
    }
  } catch (e) {
    clearInterval(progInterval);
    res.innerHTML =
      '<div class="scanner-empty">❌ ' +
      esc(e.message) +
      '<br><span style="font-size:11px;color:var(--text3);margin-top:8px;display:block">Coba lagi beberapa saat.</span></div>';
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    icon.className = '';
    icon.textContent = '⚡';
  }
}

function renderScanResults(data, filter) {
  const el = document.getElementById('scannerResults');
  if (!data || !data.results) { el.innerHTML = '<div class="scanner-empty">Tidak ada hasil.</div>'; return; }

  let results = data.results;

  // Client-side filter tambahan
  if (filter === 'bullish') results = results.filter(r => r.score >= 6);
  if (filter === 'naik') results = results.filter(r => r.isUp);

  if (!results.length) {
    el.innerHTML = '<div class="scanner-empty">Tidak ada saham yang cocok dengan filter ini.</div>';
    document.getElementById('scanUniverse').textContent = data.universe || '50+';
    return;
  }

  const bullCount = results.filter(r => r.score >= 6).length;
  const bearCount = results.filter(r => r.score <= 4).length;

  const stats = `
  <div class="scan-stats">
    <div class="scan-stat"><span class="scan-stat-num" style="color:var(--emerald)">${bullCount}</span><span class="scan-stat-lbl">Bullish</span></div>
    <div class="scan-stat"><span class="scan-stat-num">${results.length}</span><span class="scan-stat-lbl">Total</span></div>
    <div class="scan-stat"><span class="scan-stat-num" style="color:var(--red)">${bearCount}</span><span class="scan-stat-lbl">Bearish</span></div>
  </div>`;

  const rows = results.slice(0, 50).map(r => {
    const topSig = r.signals && r.signals[0];
    const dir = r.score >= 7 ? 'bull' : r.score <= 3 ? 'bear' : 'neutral';
    const scoreColor = getScoreColor(r.score);

    // Action badge
    const actionBadge = r.recommendation === 'BELI' || r.recommendation === 'AKUMULASI'
      ? `<span class="pill pill-g">${r.recommendation}</span>`
      : r.recommendation === 'JUAL' || r.recommendation === 'KURANGI'
      ? `<span class="pill pill-r">${r.recommendation}</span>`
      : `<span class="pill pill-gray">${r.recommendation||'TAHAN'}</span>`;

    // Avatar initials
    const initials = r.ticker.slice(0,2);

    const sigs = (r.signals||[]).slice(0,2).map(s =>
      `<span class="sc-sig ${s.strength||'medium'}">${esc(s.label)}</span>`
    ).join('');

    return `
    <div class="sc-row ${dir}" onclick="analyzeFromScanner('${esc(r.ticker)}')">
      <div class="sc-avatar">${initials}</div>
      <div class="sc-info">
        <div class="sc-ticker">${esc(r.ticker)}</div>
        <div class="sc-name">${esc(r.name||r.ticker)}</div>
        <div class="sc-sigs" style="margin-top:3px">${sigs}</div>
      </div>
      <div class="sc-price-col">
        <div class="sc-price">${fmtPrice(r.lastClose)}</div>
        <div class="sc-chg ${r.isUp?'up':'down'}">${r.isUp?'+':''}${r.changePct}%</div>
      </div>
      <div class="sc-action">${actionBadge}</div>
      <div class="sc-score-col">
        <div class="sc-score-val" style="color:${scoreColor}">${r.score}</div>
        <div class="sc-score-lbl">/ 10</div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = stats + '<div class="scan-list">' + rows + '</div>';
  document.getElementById('scanUniverse').textContent = data.universe || '50+';
  if (data.scannedAt) {
    const t = new Date(data.scannedAt);
    document.getElementById('scanLastRun').textContent = 'Update: ' + t.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) + (data.fromCache ? ' (cache)' : '');
  }
}

function analyzeFromScanner(ticker) {
  toggleScanner();
  document.getElementById('stockInput').value = ticker;
  analyzeStock();
}
