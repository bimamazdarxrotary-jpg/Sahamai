
// ── STATE ──────────────────────────────────────────────────────────
let tvChart=null,tvSeries=null,tvVolSeries=null,rsiChart=null,rsiSeries=null;
let macdChart=null,macdHistSeries=null,macdLineSeries=null,macdSignalSeries=null;
let currentCandles=[],currentChartType='candle',currentRange='3mo';
let activeIndicators={ma20:true,ma50:true,ema9:true,bb:false,rsi:false,macd:false};
let chartSeriesMap={};

// ── ANALYZE ────────────────────────────────────────────────────────
async function analyzeStock() {
  const input=document.getElementById('stockInput');
  const ticker=input.value.trim().toUpperCase();
  if(!ticker){showToast('Masukkan kode saham terlebih dahulu','error');return;}
  const btn=document.getElementById('analyzeBtn'),icon=document.getElementById('btnIcon');
  btn.disabled=true;icon.className='spin';icon.textContent='↻';
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.textContent===ticker));
  const section=document.getElementById('resultsSection'),content=document.getElementById('resultsContent');
  section.style.display='block';section.scrollIntoView({behavior:'smooth',block:'start'});
  content.innerHTML=buildSkeleton();
  if(tvChart){tvChart.remove();tvChart=null;tvSeries=null;tvVolSeries=null;}
  try {
    const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker})});
    const d=await res.json();
    if(!res.ok)throw new Error(d.error||`HTTP ${res.status}`);
    content.innerHTML=buildResult(ticker,d);
    if(d.priceData?.candles?.length){currentCandles=d.priceData.candles;initTVChart(currentCandles,currentChartType);}
    showToast(`${d.fromCache?'⚡ Cache':'✓ Selesai'} — ${d.latencyMs||0}ms`,'ok');
  } catch(err) {
    content.innerHTML=`<div style="text-align:center;padding:4rem 1rem"><div style="font-size:3rem;margin-bottom:1rem">⚠️</div><p style="font-size:1rem;color:var(--red);margin-bottom:8px;font-family:var(--mono);font-weight:700">Gagal menganalisis saham</p><p style="font-size:12px;color:var(--text3)">${esc(String(err.message))}</p></div>`;
    showToast('Error: '+err.message,'error');
  }
  btn.disabled=false;icon.className='';icon.textContent='✦';
}

function quickAnalyze(code){document.getElementById('stockInput').value=code;analyzeStock();}

// ── CHART CALCULATIONS ─────────────────────────────────────────────
function calcEMA(data,period){const k=2/(period+1);const result=[];let ema=null;for(let i=0;i<data.length;i++){if(i<period-1)continue;if(ema===null){ema=data.slice(0,period).reduce((a,c)=>a+c.close,0)/period;}else{ema=data[i].close*k+ema*(1-k);}result.push({time:data[i].date,value:Math.round(ema)});}return result;}
function calcSMA(data,period){const result=[];for(let i=period-1;i<data.length;i++){const avg=data.slice(i-period+1,i+1).reduce((a,c)=>a+c.close,0)/period;result.push({time:data[i].date,value:Math.round(avg)});}return result;}
function calcBB(data,period=20,mult=2){const upper=[],middle=[],lower=[];for(let i=period-1;i<data.length;i++){const slice=data.slice(i-period+1,i+1);const avg=slice.reduce((a,c)=>a+c.close,0)/period;const std=Math.sqrt(slice.reduce((a,c)=>a+Math.pow(c.close-avg,2),0)/period);upper.push({time:data[i].date,value:Math.round(avg+mult*std)});middle.push({time:data[i].date,value:Math.round(avg)});lower.push({time:data[i].date,value:Math.round(avg-mult*std)});}return{upper,middle,lower};}
function calcRSI(data,period=14){const result=[];const closes=data.map(c=>c.close);if(closes.length<period+1)return result;const changes=closes.slice(1).map((v,i)=>v-closes[i]);let avgGain=changes.slice(0,period).filter(v=>v>0).reduce((a,b)=>a+b,0)/period;let avgLoss=changes.slice(0,period).filter(v=>v<0).reduce((a,b)=>a+Math.abs(b),0)/period;for(let i=period;i<changes.length;i++){const gain=changes[i]>0?changes[i]:0;const loss=changes[i]<0?Math.abs(changes[i]):0;avgGain=(avgGain*(period-1)+gain)/period;avgLoss=(avgLoss*(period-1)+loss)/period;const rs=avgLoss===0?100:avgGain/avgLoss;result.push({time:data[i].date,value:Math.round(100-100/(1+rs))});}return result;}
function calcMACD(data,fast=12,slow=26,signal=9){const kf=2/(fast+1),ks=2/(slow+1),kg=2/(signal+1);const closes=data.map(c=>c.close);if(closes.length<slow+signal)return{macd:[],signal:[],hist:[]};let ef=closes.slice(0,fast).reduce((a,b)=>a+b)/fast;let es=closes.slice(0,slow).reduce((a,b)=>a+b)/slow;const macdLine=[];for(let i=1;i<fast;i++)ef=closes[i]*kf+ef*(1-kf);for(let i=slow;i<closes.length;i++){ef=closes[i]*kf+ef*(1-kf);es=closes[i]*ks+es*(1-ks);macdLine.push({time:data[i].date,value:parseFloat((ef-es).toFixed(2))});}if(macdLine.length<signal)return{macd:[],signal:[],hist:[]};let sg=macdLine.slice(0,signal).reduce((a,b)=>a+b.value,0)/signal;const sigLine=[],histLine=[];for(let i=0;i<macdLine.length;i++){if(i>=signal)sg=macdLine[i].value*kg+sg*(1-kg);if(i>=signal-1){sigLine.push({time:macdLine[i].time,value:parseFloat(sg.toFixed(2))});histLine.push({time:macdLine[i].time,value:parseFloat((macdLine[i].value-sg).toFixed(2)),color:(macdLine[i].value-sg)>=0?'rgba(0,230,118,0.5)':'rgba(255,82,82,0.5)'});}}return{macd:macdLine.slice(signal-1),signal:sigLine,hist:histLine};}

function toggleIndicator(ind){
  activeIndicators[ind]=!activeIndicators[ind];
  const btn=document.getElementById('tog-'+ind);
  if(btn)btn.className='ind-toggle '+(activeIndicators[ind]?'on-':'off-')+ind;
  if(ind==='rsi'){const p=document.getElementById('panel-rsi');if(p)p.classList.toggle('visible',activeIndicators.rsi);}
  if(ind==='macd'){const p=document.getElementById('panel-macd');if(p)p.classList.toggle('visible',activeIndicators.macd);}
  if(currentCandles.length)initTVChart(currentCandles,currentChartType);
}

function initTVChart(allCandles,type){
  type=type||'candle';
  const container=document.getElementById('tvChart');
  if(!container||!allCandles||!allCandles.length)return;
  if(tvChart){tvChart.remove();tvChart=null;}
  if(rsiChart){rsiChart.remove();rsiChart=null;}
  if(macdChart){macdChart.remove();macdChart=null;}
  chartSeriesMap={};
  const data=filterByRange(allCandles,currentRange);
  if(!data.length)return;
  const isUp=data[data.length-1].close>=data[0].close;
  tvChart=LightweightCharts.createChart(container,{width:container.clientWidth,height:300,layout:{background:{color:'transparent'},textColor:'#6b7a8d'},grid:{vertLines:{color:'rgba(255,255,255,0.03)'},horzLines:{color:'rgba(255,255,255,0.03)'}},crosshair:{mode:LightweightCharts.CrosshairMode.Normal},rightPriceScale:{borderColor:'rgba(255,255,255,0.05)',scaleMargins:{top:0.08,bottom:0.28}},timeScale:{borderColor:'rgba(255,255,255,0.05)',timeVisible:true,secondsVisible:false},handleScroll:true,handleScale:true});
  if(type==='candle'){tvSeries=tvChart.addCandlestickSeries({upColor:'#00e676',downColor:'#ff5252',borderUpColor:'#00e676',borderDownColor:'#ff5252',wickUpColor:'#00e676',wickDownColor:'#ff5252'});tvSeries.setData(data.map(c=>({time:c.date,open:c.open||c.close,high:c.high,low:c.low,close:c.close})));}
  else{tvSeries=tvChart.addAreaSeries({lineColor:isUp?'#00e676':'#ff5252',topColor:isUp?'rgba(0,230,118,0.2)':'rgba(255,82,82,0.15)',bottomColor:isUp?'rgba(0,230,118,0)':'rgba(255,82,82,0)',lineWidth:2});tvSeries.setData(data.map(c=>({time:c.date,value:c.close})));}
  if(activeIndicators.ema9&&data.length>=9){const s=tvChart.addLineSeries({color:'rgba(0,230,118,0.7)',lineWidth:1,lastValueVisible:false,priceLineVisible:false});s.setData(calcEMA(data,9));chartSeriesMap.ema9=s;}
  if(activeIndicators.ma20&&data.length>=20){const s=tvChart.addLineSeries({color:'rgba(255,171,64,0.7)',lineWidth:1,lineStyle:1,lastValueVisible:false,priceLineVisible:false});s.setData(calcSMA(data,20));chartSeriesMap.ma20=s;}
  if(activeIndicators.ma50&&data.length>=50){const s=tvChart.addLineSeries({color:'rgba(68,138,255,0.6)',lineWidth:1,lineStyle:1,lastValueVisible:false,priceLineVisible:false});s.setData(calcSMA(data,50));chartSeriesMap.ma50=s;}
  if(activeIndicators.bb&&data.length>=20){const bb=calcBB(data,20);const bU=tvChart.addLineSeries({color:'rgba(224,64,251,0.5)',lineWidth:1,lastValueVisible:false,priceLineVisible:false});const bM=tvChart.addLineSeries({color:'rgba(224,64,251,0.3)',lineWidth:1,lineStyle:2,lastValueVisible:false,priceLineVisible:false});const bL=tvChart.addLineSeries({color:'rgba(224,64,251,0.5)',lineWidth:1,lastValueVisible:false,priceLineVisible:false});bU.setData(bb.upper);bM.setData(bb.middle);bL.setData(bb.lower);chartSeriesMap.bb=[bU,bM,bL];}
  tvVolSeries=tvChart.addHistogramSeries({color:'rgba(255,255,255,0.06)',priceFormat:{type:'volume'},priceScaleId:'',scaleMargins:{top:0.75,bottom:0}});
  tvVolSeries.setData(data.map(c=>({time:c.date,value:c.volume||0,color:(c.close>=(c.open||c.close))?'rgba(0,230,118,0.25)':'rgba(255,82,82,0.2)'})));
  tvChart.timeScale().fitContent();
  if(activeIndicators.rsi){const rc=document.getElementById('rsiChart');if(rc&&data.length>=15){rsiChart=LightweightCharts.createChart(rc,{width:rc.clientWidth,height:90,layout:{background:{color:'transparent'},textColor:'#6b7a8d'},grid:{vertLines:{color:'rgba(255,255,255,0.02)'},horzLines:{color:'rgba(255,255,255,0.02)'}},rightPriceScale:{borderColor:'rgba(255,255,255,0.05)',scaleMargins:{top:0.1,bottom:0.1}},timeScale:{borderColor:'rgba(255,255,255,0.05)',timeVisible:false},handleScroll:false,handleScale:false});rsiSeries=rsiChart.addLineSeries({color:'#ff5252',lineWidth:1,lastValueVisible:true,priceLineVisible:false});rsiSeries.setData(calcRSI(data,14));const ob=rsiChart.addLineSeries({color:'rgba(255,82,82,0.25)',lineWidth:1,lineStyle:2,lastValueVisible:false,priceLineVisible:false});const os=rsiChart.addLineSeries({color:'rgba(0,230,118,0.25)',lineWidth:1,lineStyle:2,lastValueVisible:false,priceLineVisible:false});const times=data.map(c=>c.date);ob.setData(times.map(t=>({time:t,value:70})));os.setData(times.map(t=>({time:t,value:30})));rsiChart.timeScale().fitContent();new ResizeObserver(()=>{if(rsiChart&&rc)rsiChart.applyOptions({width:rc.clientWidth});}).observe(rc);}}
  if(activeIndicators.macd){const mc=document.getElementById('macdChart');if(mc&&data.length>=35){macdChart=LightweightCharts.createChart(mc,{width:mc.clientWidth,height:90,layout:{background:{color:'transparent'},textColor:'#6b7a8d'},grid:{vertLines:{color:'rgba(255,255,255,0.02)'},horzLines:{color:'rgba(255,255,255,0.02)'}},rightPriceScale:{borderColor:'rgba(255,255,255,0.05)',scaleMargins:{top:0.1,bottom:0.1}},timeScale:{borderColor:'rgba(255,255,255,0.05)',timeVisible:false},handleScroll:false,handleScale:false});const md=calcMACD(data);macdHistSeries=macdChart.addHistogramSeries({lastValueVisible:false,priceLineVisible:false});macdLineSeries=macdChart.addLineSeries({color:'#00e676',lineWidth:1,lastValueVisible:true,priceLineVisible:false});macdSignalSeries=macdChart.addLineSeries({color:'#ff5252',lineWidth:1,lastValueVisible:true,priceLineVisible:false});if(md.hist.length)macdHistSeries.setData(md.hist);if(md.macd.length)macdLineSeries.setData(md.macd);if(md.signal.length)macdSignalSeries.setData(md.signal);macdChart.timeScale().fitContent();new ResizeObserver(()=>{if(macdChart&&mc)macdChart.applyOptions({width:mc.clientWidth});}).observe(mc);}}
  new ResizeObserver(()=>{if(tvChart&&container)tvChart.applyOptions({width:container.clientWidth});}).observe(container);
}

function filterByRange(candles,range){if(!candles)return[];if(range==='1mo')return candles.slice(-22);if(range==='3mo')return candles.slice(-65);if(range==='6mo')return candles.slice(-130);return candles;}
function setRange(range,el){document.querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');currentRange=range;if(tvChart){tvChart.remove();tvChart=null;}initTVChart(currentCandles,currentChartType);}
function setChartType(type,el){document.querySelectorAll('.chart-type-tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');currentChartType=type;if(tvChart){tvChart.remove();tvChart=null;}initTVChart(currentCandles,type);}

// ── HELPERS ────────────────────────────────────────────────────────
function showToast(msg,type=''){document.querySelectorAll('.toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='toast '+type;t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3500);}
function safe(v,fb='—'){return(v!=null&&v!=='')? v:fb;}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function safeArr(a){return Array.isArray(a)?a:[];}
function fmtPrice(v){if(!v&&v!==0)return '—';return'Rp '+Number(v).toLocaleString('id-ID');}
function fmtVol(v){if(!v)return'—';if(v>=1e9)return(v/1e9).toFixed(2)+'B';if(v>=1e6)return(v/1e6).toFixed(1)+'Jt';if(v>=1e3)return(v/1e3).toFixed(0)+'K';return v.toLocaleString('id-ID');}
function getBadgeClass(s){if(!s)return'sent-tahan';const u=(s||'').toUpperCase();if(u==='BELI'||u==='BULLISH'||u==='AKUMULASI')return'sent-beli';if(u==='JUAL'||u==='BEARISH'||u==='KURANGI')return'sent-jual';return'sent-tahan';}
function getScoreColor(n){n=parseFloat(n)||0;if(n>=7)return'#00e676';if(n>=5)return'#ffab40';return'#ff5252';}
function getScoreGrad(n){if(n>=7)return'linear-gradient(90deg,#00c853,#00e676)';if(n>=5)return'linear-gradient(90deg,#e65100,#ffab40)';return'linear-gradient(90deg,#b71c1c,#ff5252)';}
function extractNum(str){if(typeof str==='number')return str;const m=String(str||'').match(/\d+(\.\d+)?/);return m?parseFloat(m[0]):0;}
function phaseColor(p){const m={markup:'g',markdown:'r',accumulation:'gold',distribution:'r',consolidation:'blue'};return m[p]||'blue';}
function trendIcon(d){return d==='uptrend'?'↑':d==='downtrend'?'↓':'→';}

// ── BUILD RESULT ───────────────────────────────────────────────────
function buildResult(ticker,d){
  const pd=d.priceData||{},ind=d.indicators||{},vol=d.volumeData||{},str=d.structureData||{},sc=d.scoringData||{};
  const isIndex=['IHSG','LQ45'].includes(ticker);
  const sentiment=safe(d.sentiment,'TAHAN');
  const today=new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  const finalScore=sc.final??extractNum(d.scoreTeknikal);

  // SCAN SIGNALS
  const scanSignalsHtml=(d.scanSignals&&d.scanSignals.length)?'<div class="scan-signals">'+
    d.scanSignals.map(s=>{const icon=s.type==='breakout'?'🚀':s.type==='volume_spike'?'📊':s.type==='oversold'?'🔻':s.type==='golden_cross'?'✨':s.type==='accumulation'?'📦':s.type==='macd_cross'?'⚡':'🔔';return'<span class="scan-signal '+(s.strength||'medium')+'">'+icon+' '+esc(s.label)+'</span>';}).join('')+'</div>':'';

  // PRICE HEADER CARD
  const priceCard=pd.current?`
  <div class="s-card" style="margin-bottom:10px">
    <div class="ticker-hdr">
      <div class="ticker-left">
        <div class="ticker-code">${ticker}</div>
        <div class="ticker-name">${esc(d.namaLengkap||ticker)}</div>
        <span class="ticker-sector">${esc(d.sektor||'IDX')}</span>
      </div>
      <div class="ticker-right">
        <div class="ticker-price">${fmtPrice(pd.current)}</div>
        <div class="ticker-change ${pd.isUp?'up':'down'}">${pd.isUp?'+':''}${fmtPrice(pd.change)} (${pd.isUp?'+':''}${pd.changePct}%)</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px;justify-content:flex-end;flex-wrap:wrap">
          <span class="sent-badge ${getBadgeClass(sentiment)}">${sentiment}</span>
          <span class="conf-badge conf-${(sc.confidence||'medium').toLowerCase()}">${sc.confidence||'Medium'}</span>
          ${sc.riskReward?`<span class="rr-badge">${sc.riskReward}</span>`:''}
        </div>
        ${!isIndex?`<div style="text-align:right;margin-top:8px"><span class="wl-add-btn" onclick="addToWatchlist('${ticker}')">⭐ Watchlist</span></div>`:''}
      </div>
    </div>
    <!-- SKOR BAR -->
    <div style="border-top:1px solid var(--border);padding-top:1rem;margin-top:0.5rem">
      <div style="font-size:9px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">SKOR SENTIMEN</div>
      <div class="skor-row">
        <div class="skor-num" style="color:${getScoreColor(finalScore)}">${finalScore}<span style="font-size:1rem;color:var(--text3)">/10</span></div>
        <div class="skor-bar-wrap">
          <div class="skor-bar-track"><div class="skor-bar-fill" style="width:${finalScore*10}%;background:${getScoreGrad(finalScore)}"></div></div>
          <div class="skor-label">${esc(sc.recommendation||'TAHAN')} · ${esc(sc.confidence||'Medium')} Confidence</div>
        </div>
      </div>
    </div>
  </div>`:
  `<div class="s-card" style="margin-bottom:10px">
    <div class="ticker-hdr">
      <div class="ticker-left"><div class="ticker-code">${ticker}</div><div class="ticker-name">${esc(d.namaLengkap||ticker)}</div></div>
      <div class="ticker-right"><div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-family:var(--mono)">Data harga tidak tersedia</div><span class="sent-badge ${getBadgeClass(sentiment)}">${sentiment}</span></div>
    </div>
  </div>`;

  // STAT ROW
  const statRow=pd.current?`
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-lbl">52W HIGH</div><div class="stat-val g">${fmtPrice(pd.high52w)}</div></div>
    <div class="stat-box"><div class="stat-lbl">52W LOW</div><div class="stat-val">${fmtPrice(pd.low52w)}</div></div>
    <div class="stat-box"><div class="stat-lbl">MA 20</div><div class="stat-val ${ind.ma20&&pd.current>ind.ma20?'g':'r'}">${fmtPrice(ind.ma20)}</div></div>
    <div class="stat-box"><div class="stat-lbl">MA 50</div><div class="stat-val ${ind.ma50&&pd.current>ind.ma50?'g':'r'}">${fmtPrice(ind.ma50)}</div></div>
    <div class="stat-box"><div class="stat-lbl">RSI(14)</div><div class="stat-val ${ind.rsi<30?'g':ind.rsi>70?'r':'gold'}">${ind.rsi??'—'}</div></div>
    <div class="stat-box"><div class="stat-lbl">VOLUME</div><div class="stat-val">${fmtVol(pd.volume)}</div></div>
  </div>`:'';

  // CHART
  const chartCard=pd.current?`
  <div class="chart-card">
    <div class="chart-hdr">
      <div class="chart-title">📊 PRICE CHART</div>
      <div class="chart-controls">
        <div class="chart-type-tabs">
          <span class="chart-type-tab active" onclick="setChartType('candle',this)">Candle</span>
          <span class="chart-type-tab" onclick="setChartType('area',this)">Area</span>
        </div>
        <div class="chart-tabs">
          <span class="chart-tab" onclick="setRange('1mo',this)">1B</span>
          <span class="chart-tab active" onclick="setRange('3mo',this)">3B</span>
          <span class="chart-tab" onclick="setRange('6mo',this)">6B</span>
          <span class="chart-tab" onclick="setRange('all',this)">Max</span>
        </div>
      </div>
    </div>
    <div id="tvChart"></div>
    <div class="ind-toggles">
      <span class="ind-toggle on-ma20" id="tog-ma20" onclick="toggleIndicator('ma20')">MA20</span>
      <span class="ind-toggle on-ma50" id="tog-ma50" onclick="toggleIndicator('ma50')">MA50</span>
      <span class="ind-toggle on-ema9" id="tog-ema9" onclick="toggleIndicator('ema9')">EMA9</span>
      <span class="ind-toggle off-bb"  id="tog-bb"   onclick="toggleIndicator('bb')">BB</span>
      <span class="ind-toggle off-rsi" id="tog-rsi"  onclick="toggleIndicator('rsi')">RSI</span>
      <span class="ind-toggle off-macd" id="tog-macd" onclick="toggleIndicator('macd')">MACD</span>
    </div>
    <div class="subpanel" id="panel-rsi"><div class="subpanel-lbl">RSI(14)</div><div id="rsiChart"></div></div>
    <div class="subpanel" id="panel-macd"><div class="subpanel-lbl">MACD(12,26,9)</div><div id="macdChart"></div></div>
  </div>`:'';

  // TWO-COLUMN: Ringkasan Strategi + Kondisi Harga (like Stockly)
  const strategyCard=`
  <div class="two-col">
    <div class="s-card" style="margin-bottom:0">
      <div class="s-card-label">Ringkasan Strategi</div>
      <div style="margin-top:0.75rem">
        ${sc.breakdown?`
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px;font-family:var(--mono)">
          Trend ${sc.breakdown.trend?.score??'—'}/10 &nbsp;·&nbsp; Volume ${sc.breakdown.volume?.score??'—'}/10 &nbsp;·&nbsp; Momentum ${sc.breakdown.momentum?.score??'—'}/10
        </div>`:''}
        <div style="font-size:11px;color:var(--text2);line-height:1.7">${esc(d.whyNow||d.summary||'—')}</div>
      </div>
    </div>
    <div class="s-card" style="margin-bottom:0">
      <div class="s-card-label ${str.phase==='markup'?'':'gold'}">Kondisi & Fase Market</div>
      <div style="margin-top:0.75rem">
        ${str.phase?`<span class="pill pill-${phaseColor(str.phase)}" style="margin-bottom:8px;display:inline-block">${str.phase?.toUpperCase()}</span>`:''}
        ${vol.bias?`<span class="pill pill-${vol.bias==='accumulation'?'g':vol.bias==='distribution'?'r':'gold'}" style="margin:0 4px 8px;display:inline-block">${vol.bias?.toUpperCase()}</span>`:''}
        ${vol.isSpike?`<span class="pill pill-gold" style="margin-bottom:8px;display:inline-block">SPIKE ${vol.spikeRatio}×</span>`:''}
        <div style="font-size:11px;color:var(--text2);line-height:1.7;margin-top:4px">${esc(str.phaseLabel||vol.narrative||'—')}</div>
        ${str.trend?`<div style="margin-top:6px;font-size:10px;color:var(--text3);font-family:var(--mono)">${trendIcon(str.trend?.direction)} ${esc(str.trend?.direction||'')} · ADX ${str.trend?.adx??'—'} · ${esc(str.trend?.strength||'')}</div>`:''}
      </div>
    </div>
  </div>`;

  // SCORE BREAKDOWN
  const scorePanel=sc.breakdown?`
  <div class="s-card">
    <div class="s-card-hdr">
      <div class="s-card-label">Scoring Deterministik</div>
      <div style="font-family:var(--mono);font-size:1.4rem;font-weight:700;color:${getScoreColor(finalScore)}">${finalScore}<span style="font-size:0.9rem;color:var(--text3)">/10</span></div>
    </div>
    <div class="score-grid">
      ${['trend','volume','momentum','risk','setup'].map(k=>{
        const item=sc.breakdown[k];if(!item)return'';
        const isRisk=k==='risk',ds=isRisk?(10-item.score):item.score;
        return`<div class="score-item">
          <div class="score-item-lbl">${{trend:'TREN',volume:'VOLUME',momentum:'MOMENTUM',risk:'SAFETY',setup:'SETUP'}[k]}</div>
          <div class="score-item-val" style="color:${getScoreColor(ds)}">${ds}</div>
          <div class="score-bar"><div class="score-fill" style="width:${ds*10}%;background:${getScoreGrad(ds)}"></div></div>
          <div class="score-reasons">${(item.reasons||[]).slice(0,2).map(r=>'• '+esc(r)).join('<br>')}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`:'';

  // INTEL GRID
  const intelGrid=(ind.bb||ind.macd||ind.stoch||ind.atr)?`
  <div class="intel-grid">
    ${ind.bb?`<div class="intel-box"><div class="intel-box-lbl">BOLLINGER BANDS</div><div class="intel-box-val" style="color:${ind.bb.position==='overbought_zone'?'var(--red)':ind.bb.position==='oversold_zone'?'var(--g)':'var(--text)'}">${(ind.bb.position||'').replace(/_/g,' ')}</div><div class="intel-box-sub">BW: ${ind.bb.bandwidth}% · Pos: ${ind.bb.bandPct}%<br>U: ${fmtPrice(ind.bb.upper)} / L: ${fmtPrice(ind.bb.lower)}</div></div>`:''}
    ${ind.macd?`<div class="intel-box"><div class="intel-box-lbl">MACD</div><span class="pill pill-${ind.macd.trend==='bullish'?'g':'r'}" style="margin-bottom:6px;display:inline-block">${(ind.macd.trend||'').toUpperCase()}</span>${ind.macd.crossover?`<span class="pill pill-gold" style="margin-left:4px;display:inline-block">${ind.macd.crossover.replace(/_/g,' ').toUpperCase()}</span>`:''}<div class="intel-box-sub" style="margin-top:5px">MACD: ${ind.macd.macd??'—'} / Hist: ${ind.macd.histogram??'—'}</div></div>`:''}
    ${ind.stoch?`<div class="intel-box"><div class="intel-box-lbl">STOCHASTIC</div><span class="pill pill-${ind.stoch.signal==='oversold'?'g':ind.stoch.signal==='overbought'?'r':'gold'}" style="margin-bottom:6px;display:inline-block">${(ind.stoch.signal||'').toUpperCase()}</span><div class="intel-box-sub">K: ${ind.stoch.k} · D: ${ind.stoch.d}</div></div>`:''}
    ${ind.atr?`<div class="intel-box"><div class="intel-box-lbl">VOLATILITAS ATR</div><div class="intel-box-val">${fmtPrice(ind.atr.atr)}</div><div class="intel-box-sub">${ind.atr.atrPct}% — ${ind.atr.atrPct>4?'⚠️ Sangat Volatil':ind.atr.atrPct>2?'Volatil':'Stabil'}</div></div>`:''}
  </div>`:'';

  // S&R
  const srCard=ind.levels&&(ind.levels.support?.length||ind.levels.resistance?.length)?`
  <div class="two-col">
    <div class="s-card" style="margin-bottom:0">
      <div class="s-card-label">Support</div>
      <div style="margin-top:0.75rem">${(ind.levels.support||[]).map(l=>`<div class="sr-item" style="color:var(--g)">${fmtPrice(l)}</div>`).join('')||'<div style="color:var(--text3);font-size:12px">—</div>'}</div>
    </div>
    <div class="s-card" style="margin-bottom:0">
      <div class="s-card-label red">Resistance</div>
      <div style="margin-top:0.75rem">${(ind.levels.resistance||[]).map(l=>`<div class="sr-item" style="color:var(--red)">${fmtPrice(l)}</div>`).join('')||'<div style="color:var(--text3);font-size:12px">—</div>'}</div>
    </div>
  </div>
  <div style="margin-bottom:10px"></div>`:''

  // SETUPS
  const setupsSection=safeArr(str.setups).length?`
  <div class="s-card">
    <div class="s-card-label">Setup Terdeteksi</div>
    <div style="margin-top:0.75rem">
    ${safeArr(str.setups).map(s=>`
    <div class="setup-card ${s.confidence}">
      <div class="setup-type" style="color:${s.direction==='long'?'var(--g)':s.direction==='short'?'var(--red)':'var(--text2)'}">${esc(s.type?.replace(/_/g,' '))} · ${esc(s.direction)} · ${esc(s.confidence)}</div>
      <div class="setup-reason">${esc(s.reason)}</div>
    </div>`).join('')}
    </div>
  </div>`:'';

  // SMART MONEY
  const smCard=d.smartMoneySignal&&d.smartMoneySignal!=='Tidak terdeteksi.'?`
  <div class="smart-money"><div class="sm-lbl">🧠 Smart Money Signal</div><div class="sm-text">${esc(d.smartMoneySignal)}</div></div>`:'';

  // BANDAR
  const bandarCard=d.bandaAnalysis&&!isIndex?`
  <div class="bandar-card"><div class="bandar-lbl">🎯 Bandar Analysis</div><div class="bandar-text">${esc(d.bandaAnalysis)}</div></div>`:'';

  // MAIN AI CARD
  const mainCard=`
  <div class="s-card">
    <div class="s-card-hdr"><div class="s-card-label">Analisis AI Mendalam</div></div>
    <div style="font-size:0.9rem;color:var(--text2);line-height:1.9;font-weight:400;margin-bottom:1rem">${esc(d.summary)}</div>
    <div class="rec-box">
      <div class="rec-lbl">Rekomendasi Aksi</div>
      <div class="rec-text">${esc(d.rekomendasi)}</div>
      ${!isIndex&&(d.targetHarga||d.stopLoss||d.levelBeli)?`
      <div class="target-row">
        <div class="target-item"><div class="target-lbl">TARGET</div><div class="target-val g">${esc(d.targetHarga||'—')}</div></div>
        <div class="target-item"><div class="target-lbl">ZONA BELI</div><div class="target-val gold">${esc(d.levelBeli||'—')}</div></div>
        <div class="target-item"><div class="target-lbl">STOP LOSS</div><div class="target-val r">${esc(d.stopLoss||'—')}</div></div>
      </div>`:''}
    </div>
  </div>`;

  // BULL/BEAR
  const thesis=(safeArr(d.bullThesis).length||safeArr(d.bearThesis).length)?`
  <div class="two-col">
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label">🐂 Bull Thesis</div><div class="tags">${safeArr(d.bullThesis).map(t=>`<span class="tag g">${esc(t)}</span>`).join('')}</div></div>
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label red">🐻 Bear Thesis</div><div class="tags">${safeArr(d.bearThesis).map(t=>`<span class="tag r">${esc(t)}</span>`).join('')}</div></div>
  </div><div style="margin-bottom:10px"></div>`:'';

  // TEKNIKAL/FUNDAMENTAL
  const analysisCards=!isIndex?`
  <div class="two-col">
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label blue">📈 Teknikal</div><div style="font-size:0.88rem;color:var(--text2);line-height:1.8;margin-top:0.75rem">${esc(d.analisisTeknikal)}</div></div>
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label gold">📊 Fundamental</div><div style="font-size:0.88rem;color:var(--text2);line-height:1.8;margin-top:0.75rem">${esc(d.analisisFundamental)}</div></div>
  </div><div style="margin-bottom:10px"></div>`:`
  <div class="two-col">
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label">💪 Sektor Kuat</div><div class="tags">${safeArr(d.sektorKuat).map(s=>`<span class="tag g">${esc(s)}</span>`).join('')}</div></div>
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label red">📉 Sektor Lemah</div><div class="tags">${safeArr(d.sektorLemah).map(s=>`<span class="tag r">${esc(s)}</span>`).join('')}</div></div>
  </div><div style="margin-bottom:10px"></div>`;

  // METRICS
  const metricsSection=`
  <div class="stat-grid" style="margin-bottom:10px">
    <div class="stat-box"><div class="stat-lbl">HARGA WAJAR</div><div class="stat-val g">${esc(safe(d.priceEst))}</div></div>
    <div class="stat-box"><div class="stat-lbl">P/E RATIO</div><div class="stat-val">${esc(safe(d.pe))}</div></div>
    <div class="stat-box"><div class="stat-lbl">P/BV</div><div class="stat-val">${esc(safe(d.pbv))}</div></div>
    <div class="stat-box"><div class="stat-lbl">DIV. YIELD</div><div class="stat-val">${esc(safe(d.divYield))}</div></div>
    <div class="stat-box"><div class="stat-lbl">BETA</div><div class="stat-val">${esc(safe(d.beta))}</div></div>
  </div>`;

  // KRK
  const krkSection=`
  <div class="two-col">
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label">✅ Keunggulan</div><div class="tags">${safeArr(d.keunggulan).map(k=>`<span class="tag g">${esc(k)}</span>`).join('')}</div></div>
    <div class="s-card" style="margin-bottom:0"><div class="s-card-label red">⚠️ Risiko</div><div class="tags">${safeArr(d.risiko).map(r=>`<span class="tag r">${esc(r)}</span>`).join('')}</div></div>
  </div>
  <div style="margin-bottom:10px"></div>
  <div class="s-card"><div class="s-card-label gold">🚀 Katalis</div><div class="tags">${safeArr(d.katalis).map((k,i)=>{const neg=/risiko|waspada|ancaman|negatif|turun|melemah|tekanan/i.test(k);return`<span class="tag ${neg?'r':i===0?'g':''}">${esc(k)}</span>`;}).join('')}</div></div>`;

  // REKOMENDASI SAHAM IHSG
  const rekSaham=isIndex&&safeArr(d.rekomendasiSaham).length?`
  <div class="s-card"><div class="s-card-label blue">⭐ Saham Pilihan</div><div class="tags">${safeArr(d.rekomendasiSaham).map(s=>`<span class="tag gold">${esc(s)}</span>`).join('')}</div></div>`:'';

  // SEKTOR CONTEXT
  const sectorCtx=d.sektorContext&&!isIndex?`
  <div class="s-card"><div class="s-card-label blue">🔄 Konteks Sektor</div><div style="font-size:0.88rem;color:var(--text2);line-height:1.8;margin-top:0.75rem">${esc(d.sektorContext)}</div></div>`:'';

  // NEW: INDIKATOR PRO
  const ind2=d.indicators||{};

  // Candlestick Pattern
  const csCard=ind2.candlestick&&ind2.candlestick.patterns&&ind2.candlestick.patterns.length?`
  <div class="s-card">
    <div class="s-card-label gold">🕯️ Candlestick Pattern</div>
    <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:6px">
      ${ind2.candlestick.patterns.map(p=>`
      <div style="background:var(--bg3);border:1px solid ${p.type==='bullish'?'rgba(0,230,118,0.2)':p.type==='bearish'?'rgba(255,82,82,0.2)':'var(--border)'};border-radius:9px;padding:0.7rem 0.9rem;flex:1;min-width:200px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span style="font-size:11px;font-weight:700;font-family:var(--mono);color:${p.type==='bullish'?'var(--g)':p.type==='bearish'?'var(--red)':'var(--text2)'}">${esc(p.name)}</span>
          <span class="pill ${p.strength==='high'?'pill-g':p.strength==='medium'?'pill-gold':'pill-gray'}">${p.strength}</span>
          <span class="pill ${p.type==='bullish'?'pill-g':p.type==='bearish'?'pill-r':'pill-gray'}">${p.type}</span>
        </div>
        <div style="font-size:11px;color:var(--text2);line-height:1.6">${esc(p.signal)}</div>
      </div>`).join('')}
    </div>
  </div>`:'';

  // Fibonacci
  const fibCard=ind2.fibonacci?`
  <div class="s-card">
    <div class="s-card-label purple">📐 Fibonacci Retracement</div>
    <div style="margin-top:0.75rem">
      ${ind2.fibonacci.atKeyLevel?`<div style="margin-bottom:8px"><span class="pill pill-gold">⚠️ HARGA DI LEVEL KUNCI FIB</span></div>`:''}
      <div style="font-size:11px;color:var(--text2);margin-bottom:10px">${esc(ind2.fibonacci.narrative||'')}</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-lbl">HIGH RANGE</div><div class="stat-val g">${fmtPrice(ind2.fibonacci.high)}</div></div>
        <div class="stat-box"><div class="stat-lbl">LOW RANGE</div><div class="stat-val r">${fmtPrice(ind2.fibonacci.low)}</div></div>
        <div class="stat-box"><div class="stat-lbl">FIB SUPPORT</div><div class="stat-val g">${fmtPrice(ind2.fibonacci.nearSupport)}</div></div>
        <div class="stat-box"><div class="stat-lbl">FIB RESIST</div><div class="stat-val r">${fmtPrice(ind2.fibonacci.nearResistance)}</div></div>
        <div class="stat-box"><div class="stat-lbl">POSISI</div><div class="stat-val">${ind2.fibonacci.positionPct}%</div></div>
        <div class="stat-box"><div class="stat-lbl">ZONE</div><div class="stat-val" style="font-size:0.75rem">${(ind2.fibonacci.zone||'').replace(/_/g,' ')}</div></div>
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px">
        ${ind2.fibonacci.levels?Object.entries(ind2.fibonacci.levels).filter(([k])=>k.startsWith('r')&&k!=='r0'&&k!=='r100').map(([k,v])=>`<span class="pill pill-gray">${k.replace('r','').replace('e','')}%: ${fmtPrice(v)}</span>`).join(''):''}
      </div>
    </div>
  </div>`:'';

  // MFI + Divergence + Relative Strength + Pivot
  const proIndicators=(ind2.mfi||ind2.divergence||ind2.relStrength||ind2.pivots)?`
  <div class="two-col">
    ${ind2.mfi?`<div class="s-card" style="margin-bottom:0">
      <div class="s-card-label blue">💧 Money Flow Index</div>
      <div style="margin-top:0.75rem">
        <div style="font-family:var(--mono);font-size:2rem;font-weight:700;color:${ind2.mfi.mfi<30?'var(--g)':ind2.mfi.mfi>70?'var(--red)':'var(--gold)'}">${ind2.mfi.mfi}<span style="font-size:1rem;color:var(--text3)">/100</span></div>
        <span class="pill ${ind2.mfi.signal==='oversold'?'pill-g':ind2.mfi.signal==='overbought'?'pill-r':'pill-gold'}" style="margin-top:6px;display:inline-block">${(ind2.mfi.signal||'').toUpperCase()}</span>
        ${ind2.mfi.divergenceHint?`<div style="font-size:11px;color:var(--gold);margin-top:6px">⚡ ${esc(ind2.mfi.divergenceHint.replace(/_/g,' '))}</div>`:''}
      </div>
    </div>`:'<div></div>'}
    ${ind2.relStrength?`<div class="s-card" style="margin-bottom:0">
      <div class="s-card-label">📊 Relative Strength</div>
      <div style="margin-top:0.75rem">
        <div style="font-family:var(--mono);font-size:2rem;font-weight:700;color:${ind2.relStrength.rsScore>=60?'var(--g)':ind2.relStrength.rsScore>=40?'var(--gold)':'var(--red)'}">${ind2.relStrength.rsScore}<span style="font-size:1rem;color:var(--text3)">/100</span></div>
        <span class="pill ${ind2.relStrength.trend==='outperform'?'pill-g':ind2.relStrength.trend==='underperform'?'pill-r':'pill-gold'}" style="margin-top:6px;display:inline-block">${(ind2.relStrength.trend||'').toUpperCase()}</span>
        <div style="font-size:11px;color:var(--text2);margin-top:6px">${esc(ind2.relStrength.narrative||'')}</div>
      </div>
    </div>`:'<div></div>'}
  </div>
  <div style="margin-bottom:10px"></div>
  ${ind2.divergence&&ind2.divergence.detected?`
  <div class="s-card" style="background:${ind2.divergence.bias==='bullish'?'linear-gradient(135deg,rgba(0,230,118,0.07),transparent)':'linear-gradient(135deg,rgba(255,82,82,0.07),transparent)'};border-color:${ind2.divergence.bias==='bullish'?'rgba(0,230,118,0.2)':'rgba(255,82,82,0.2)'}">
    <div class="s-card-label ${ind2.divergence.bias==='bullish'?'':'red'}">⚡ Divergence Terdeteksi</div>
    <div style="margin-top:0.75rem">
      <span class="pill ${ind2.divergence.bias==='bullish'?'pill-g':'pill-r'}" style="margin-bottom:8px;display:inline-block">${esc(ind2.divergence.summary)}</span>
      ${(ind2.divergence.divergences||[]).map(dv=>`<div style="font-size:11px;color:var(--text2);margin-top:5px;padding:5px 8px;background:var(--bg3);border-radius:6px">
        <span style="font-family:var(--mono);font-weight:700;color:${dv.type==='bullish'?'var(--g)':'var(--red)'}">${dv.indicator}</span> — ${esc(dv.signal)}
      </div>`).join('')}
    </div>
  </div>`:''}
  ${ind2.pivots?`
  <div class="s-card">
    <div class="s-card-label">🎯 Pivot Points Classic</div>
    <div style="margin-top:0.75rem">
      <div style="font-size:11px;color:var(--text2);margin-bottom:10px;font-family:var(--mono)">${esc(ind2.pivots.position||'').replace(/_/g,' ').toUpperCase()}</div>
      <div class="three-col" style="margin-bottom:0">
        <div class="stat-box"><div class="stat-lbl">R2</div><div class="stat-val r">${fmtPrice(ind2.pivots.R2)}</div></div>
        <div class="stat-box"><div class="stat-lbl">R1</div><div class="stat-val r">${fmtPrice(ind2.pivots.R1)}</div></div>
        <div class="stat-box" style="border-color:rgba(255,255,255,0.15)"><div class="stat-lbl">PIVOT</div><div class="stat-val gold">${fmtPrice(ind2.pivots.P)}</div></div>
        <div class="stat-box"><div class="stat-lbl">S1</div><div class="stat-val g">${fmtPrice(ind2.pivots.S1)}</div></div>
        <div class="stat-box"><div class="stat-lbl">S2</div><div class="stat-val g">${fmtPrice(ind2.pivots.S2)}</div></div>
        <div class="stat-box"><div class="stat-lbl">S3</div><div class="stat-val g">${fmtPrice(ind2.pivots.S3)}</div></div>
      </div>
    </div>
  </div>`:''}
  `:'';

  // NEW: BERITA
  const nd=d.newsData||{};
  const hasNews=(nd.emiten&&nd.emiten.length)||(nd.komoditas&&nd.komoditas.length)||(nd.makro&&nd.makro.length);
  const newsCard=hasNews?`
  <div class="s-card">
    <div class="s-card-hdr">
      <div class="s-card-label blue">📰 Berita Terkini</div>
      <span style="font-size:9px;color:var(--text3);font-family:var(--mono)">Google News · CNBC · Detik · Kontan</span>
    </div>
    ${nd.emiten&&nd.emiten.length?`
    <div style="margin-bottom:1rem">
      <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;font-family:var(--mono);margin-bottom:8px">📌 BERITA EMITEN</div>
      ${nd.emiten.map(n=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.5;margin-bottom:3px">${esc(n.title)}</div>
        ${n.description?`<div style="font-size:11px;color:var(--text3);line-height:1.5">${esc(n.description)}</div>`:''}
        <div style="font-size:10px;color:var(--text3);margin-top:3px;font-family:var(--mono)">${esc(n.source)} · ${esc(n.date)}</div>
      </div>`).join('')}
    </div>`:''}
    ${nd.komoditas&&nd.komoditas.length?nd.komoditas.map(c=>`
    <div style="margin-bottom:1rem">
      <div style="font-size:9px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:1.5px;font-family:var(--mono);margin-bottom:8px">⛏️ ${esc(c.komoditas.toUpperCase())}</div>
      ${c.items.map(n=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.5">${esc(n.title)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;font-family:var(--mono)">${esc(n.source)} · ${esc(n.date)}</div>
      </div>`).join('')}
    </div>`).join(''):''}
    ${nd.makro&&nd.makro.length?`
    <div>
      <div style="font-size:9px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:1.5px;font-family:var(--mono);margin-bottom:8px">🌏 SENTIMEN MARKET</div>
      ${nd.makro.map(n=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.5">${esc(n.title)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;font-family:var(--mono)">${esc(n.source)} · ${esc(n.date)}</div>
      </div>`).join('')}
    </div>`:''}
  </div>`:'';

  // INFO
  const infoCard=`
  <div class="s-card">
    <div class="s-card-label">📋 Informasi</div>
    <table class="info-table" style="margin-top:0.75rem">
      <tr><td>Kode Saham</td><td>${ticker}${!isIndex?'.JK':''}</td></tr>
      <tr><td>Sektor</td><td>${esc(safe(d.sektor,'IDX'))}</td></tr>
      <tr><td>Bursa</td><td>IDX / Bursa Efek Indonesia</td></tr>
      <tr><td>Dianalisis pada</td><td>${today}</td></tr>
      ${d.latencyMs?`<tr><td>Waktu analisis</td><td>${d.latencyMs}ms</td></tr>`:''}
      ${d.fromCache?`<tr><td>Data</td><td>⚡ Cache</td></tr>`:''}
      ${hasNews?`<tr><td>Berita</td><td style="color:var(--g)">✓ Tersedia</td></tr>`:`<tr><td>Berita</td><td style="color:var(--text3)">Tidak tersedia</td></tr>`}
    </table>
  </div>`;

  return`
    ${scanSignalsHtml}
    ${priceCard}
    ${statRow}
    ${chartCard}
    ${strategyCard}
    <div style="margin-bottom:10px"></div>
    ${scorePanel}
    ${intelGrid}
    ${srCard}
    ${setupsSection}
    ${csCard}
    ${fibCard}
    ${proIndicators}
    ${smCard}
    ${mainCard}
    ${thesis}
    ${analysisCards}
    ${metricsSection}
    ${krkSection}
    ${rekSaham}
    ${bandarCard}
    ${sectorCtx}
    ${newsCard}
    ${infoCard}
  `;
}

// ── SKELETON ───────────────────────────────────────────────────────
function buildSkeleton(){
  return`
  <div class="s-card"><div style="display:flex;justify-content:space-between"><div><div class="sk" style="height:2rem;width:120px;margin-bottom:10px"></div><div class="sk" style="height:12px;width:200px"></div></div><div><div class="sk" style="height:1.8rem;width:110px;margin-bottom:8px;margin-left:auto"></div><div class="sk" style="height:12px;width:80px;margin-left:auto"></div></div></div></div>
  <div class="stat-grid">${[1,2,3,4,5,6].map(()=>`<div class="stat-box"><div class="sk" style="height:9px;width:60%;margin-bottom:7px"></div><div class="sk" style="height:1rem;width:80%"></div></div>`).join('')}</div>
  <div class="chart-card"><div class="sk" style="height:300px;border-radius:7px"></div></div>
  <div class="two-col"><div class="s-card" style="margin-bottom:0"><div class="sk" style="height:9px;width:100px;margin-bottom:12px"></div>${[1,2,3].map(()=>`<div class="sk" style="height:12px;width:100%;margin-bottom:6px"></div>`).join('')}</div><div class="s-card" style="margin-bottom:0"><div class="sk" style="height:9px;width:100px;margin-bottom:12px"></div>${[1,2,3].map(()=>`<div class="sk" style="height:12px;width:100%;margin-bottom:6px"></div>`).join('')}</div></div>
  <div style="margin-bottom:10px"></div>
  <div class="s-card"><div class="sk" style="height:9px;width:120px;margin-bottom:12px"></div><div class="score-grid">${[1,2,3,4,5].map(()=>`<div class="score-item"><div class="sk" style="height:9px;width:60%;margin-bottom:7px"></div><div class="sk" style="height:1.2rem;width:40%;margin-bottom:6px"></div><div class="sk" style="height:2px;margin-bottom:6px"></div></div>`).join('')}</div></div>`;
}

// ── WATCHLIST ──────────────────────────────────────────────────────
function getWatchlist(){try{return JSON.parse(localStorage.getItem('sahamai_watchlist')||'[]');}catch(e){return[];}}
function saveWatchlist(list){try{localStorage.setItem('sahamai_watchlist',JSON.stringify(list));}catch(e){}}
function addToWatchlist(ticker){var list=getWatchlist();if(list.indexOf(ticker)===-1){list.push(ticker);saveWatchlist(list);renderWatchlist();showToast(ticker+' ditambahkan ke watchlist','ok');}else{showToast(ticker+' sudah ada di watchlist','');}}
function removeFromWatchlist(ticker){var list=getWatchlist().filter(t=>t!==ticker);saveWatchlist(list);renderWatchlist();}
function renderWatchlist(){var list=getWatchlist();var bar=document.getElementById('watchlistBar');var items=document.getElementById('watchlistItems');if(!bar||!items)return;if(!list.length){bar.style.display='none';return;}bar.style.display='block';items.innerHTML=list.map(t=>'<div class="wl-item" onclick="quickAnalyze(\''+t+'\')"><span class="wl-ticker">'+t+'</span><span class="wl-remove" onclick="event.stopPropagation();removeFromWatchlist(\''+t+'\')" title="Hapus">×</span></div>').join('');}
document.addEventListener('DOMContentLoaded',renderWatchlist);

// ── SCANNER ────────────────────────────────────────────────────────
var currentScanFilter='all',scannerVisible=false;

function toggleScanner(){
  scannerVisible=!scannerVisible;
  const scanSec=document.getElementById('scannerSection');
  const resSec=document.getElementById('resultsSection');
  const wlBar=document.getElementById('watchlistBar');
  const heroSec=document.querySelector('.hero');
  const searchSec=document.querySelector('.search-wrap');
  const chipsSec=document.querySelector('.chips');
  const btn=document.getElementById('navScannerBtn');
  if(scannerVisible){
    scanSec.style.display='block';resSec.style.display='none';
    if(wlBar)wlBar.style.display='none';
    if(heroSec)heroSec.style.display='none';
    if(searchSec)searchSec.style.display='none';
    if(chipsSec)chipsSec.style.display='none';
    btn.classList.add('active');btn.textContent='✕ Tutup';
    scanSec.scrollIntoView({behavior:'smooth',block:'start'});
  } else {
    scanSec.style.display='none';
    if(heroSec)heroSec.style.display='';
    if(searchSec)searchSec.style.display='';
    if(chipsSec)chipsSec.style.display='';
    renderWatchlist();btn.classList.remove('active');btn.textContent='⚡ Scanner';
  }
}

function setScanFilter(el,filter){
  currentScanFilter=filter;
  document.querySelectorAll('.sf-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}

async function runScanner(){
  const btn=document.getElementById('scanRunBtn'),icon=document.getElementById('scanBtnIcon');
  const res=document.getElementById('scannerResults');
  btn.disabled=true;icon.className='spin';icon.textContent='↻';

  const filterLabel={
    all:'semua setup',bullish:'saham bullish',naik:'saham naik hari ini',
    breakout:'breakout',volume_spike:'volume spike',oversold:'oversold',
    golden_cross:'golden cross',accumulation:'akumulasi',death_cross:'death cross'
  }[currentScanFilter]||currentScanFilter;

  res.innerHTML='<div class="scanner-loading"><div style="font-size:13px;color:var(--text2);margin-bottom:8px;font-family:var(--mono)">Scanning '+filterLabel+'...</div><div style="font-size:11px;color:var(--text3);margin-bottom:1rem;font-family:var(--mono)">Menganalisis 50+ saham IHSG</div><div class="progress-bar"><div class="progress-fill" id="scanProgress"></div></div></div>';

  const prog=document.getElementById('scanProgress');
  let pct=0;
  const progInterval=setInterval(()=>{pct=Math.min(pct+2,90);if(prog)prog.style.width=pct+'%';},300);

  try {
    // NEW: filter bullish/naik ditangani client-side setelah dapat data
    const apiFilter=['bullish','naik'].includes(currentScanFilter)?'all':currentScanFilter;

    const response=await fetch('/api/scanner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filter:apiFilter})});
    clearInterval(progInterval);
    if(prog)prog.style.width='100%';
    if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error||'Scanner gagal');}
    let data=await response.json();

    // CLIENT-SIDE filter untuk bullish dan naik
    if(currentScanFilter==='bullish'){
      data=Object.assign({},data,{
        results:data.results.filter(item=>item.score>=6||item.recommendation==='BELI'||item.recommendation==='AKUMULASI'),
        total:0
      });
      data.total=data.results.length;
    } else if(currentScanFilter==='naik'){
      data=Object.assign({},data,{
        results:data.results.filter(item=>item.isUp&&item.changePct>0).sort((a,b)=>b.changePct-a.changePct),
        total:0
      });
      data.total=data.results.length;
    }

    renderScanResults(data,currentScanFilter);
    const lastRun=document.getElementById('scanLastRun');
    if(lastRun){
      const now=new Date();
      lastRun.textContent=(data.fromCache?'⚡ Cache — ':' ')+'✅ '+data.total+' ditemukan · '+now.toLocaleTimeString('id-ID');
    }
  } catch(e){
    clearInterval(progInterval);
    res.innerHTML='<div class="scanner-empty">❌ '+esc(e.message)+'<br><span style="font-size:11px;color:var(--text3);margin-top:8px;display:block">Coba lagi beberapa saat.</span></div>';
    showToast(e.message,'error');
  } finally {
    btn.disabled=false;icon.className='';icon.textContent='⚡';
  }
}

function renderScanResults(data, filter){
  const res=document.getElementById('scannerResults');
  if(!res)return;

  if(!data.results||!data.results.length){
    const msg=filter==='bullish'?'Tidak ada saham bullish saat ini (skor ≥ 6).':
              filter==='naik'?'Tidak ada saham yang naik hari ini.':
              'Tidak ada setup terdeteksi untuk filter ini.';
    res.innerHTML=`<div class="scanner-empty">🔍 ${msg}<br><span style="font-size:11px;color:var(--text3);margin-top:8px;display:block">Coba filter lain atau scan ulang.</span></div>`;
    return;
  }

  // Stats bar
  const totalNaik=data.results.filter(i=>i.isUp).length;
  const totalTurun=data.results.filter(i=>!i.isUp).length;
  const avgScore=(data.results.reduce((a,i)=>a+i.score,0)/data.results.length).toFixed(1);

  const statsBar=`
  <div class="scan-stats" style="margin-bottom:1rem">
    <div class="scan-stat"><span class="scan-stat-num" style="color:var(--g)">${data.results.length}</span><span class="scan-stat-lbl">Setup Ditemukan</span></div>
    <div class="scan-stat"><span class="scan-stat-num" style="color:var(--g)">${totalNaik}</span><span class="scan-stat-lbl">Naik</span></div>
    <div class="scan-stat"><span class="scan-stat-num" style="color:var(--red)">${totalTurun}</span><span class="scan-stat-lbl">Turun</span></div>
    <div class="scan-stat"><span class="scan-stat-num">${avgScore}</span><span class="scan-stat-lbl">Rata² Skor</span></div>
    <div class="scan-stat" style="margin-left:auto"><span style="font-size:10px;color:var(--text3);font-family:var(--mono)">dari ${data.universe} saham</span></div>
  </div>`;

  const cards=data.results.map(item=>{
    const topStrength=item.topSignal?item.topSignal.strength:'medium';
    const isNaik=item.isUp&&item.changePct>0;
    const isShort=item.topSignal&&item.topSignal.direction==='short';
    const scoreColor=item.score>=7?'var(--g)':item.score>=5?'var(--gold)':'var(--red)';
    const scoreGrad=item.score>=7?'linear-gradient(90deg,#00c853,#00e676)':item.score>=5?'linear-gradient(90deg,#e65100,#ffab40)':'linear-gradient(90deg,#b71c1c,#ff5252)';
    const borderColor=isShort?'var(--red)':topStrength==='high'?'var(--g)':'rgba(255,171,64,0.5)';
    const sigBadges=item.signals.slice(0,4).map(s=>{
      const sc=s.strength==='high'?'high':s.direction==='short'?'short':'medium';
      const icon=s.type==='breakout'?'🚀':s.type==='volume_spike'?'📊':s.type==='oversold'?'🔻':s.type==='golden_cross'?'✨':s.type==='accumulation'?'📦':s.type==='death_cross'?'💀':s.type==='mfi_oversold'?'💧':s.type==='divergence'?'⚡':s.type==='candlestick'?'🕯️':s.type==='fib_level'?'📐':'🔔';
      return`<span class="sc-sig ${sc}">${icon} ${esc(s.label)}</span>`;
    }).join('');
    return`<div class="sc-card-new" style="border-left-color:${borderColor}" onclick="analyzeFromScanner('${item.ticker}')">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div>
            <div style="font-family:var(--mono);font-size:1.1rem;font-weight:700;letter-spacing:-0.5px;line-height:1">${esc(item.ticker)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:var(--mono)">${esc(item.sector||'')}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--mono);font-size:1.4rem;font-weight:700;color:${scoreColor};line-height:1">${item.score}<span style="font-size:0.75rem;color:var(--text3)">/10</span></div>
          <div style="font-size:9px;font-weight:700;font-family:var(--mono);color:${scoreColor};margin-top:1px">${esc(item.recommendation||'')}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.name||item.ticker)}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-family:var(--mono);font-size:1rem;font-weight:700">Rp ${item.lastClose?item.lastClose.toLocaleString('id-ID'):'N/A'}</span>
        <span style="font-size:11px;font-weight:700;font-family:var(--mono);color:${item.isUp?'var(--g)':'var(--red)'}">${item.isUp?'+':''}${item.changePct||0}%</span>
        ${item.rsi!=null?`<span style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-left:auto">RSI <span style="color:${item.rsi<30?'var(--g)':item.rsi>70?'var(--red)':'var(--text2)'};font-weight:700">${item.rsi}</span></span>`:''}
      </div>
      <div style="height:2px;background:var(--bg3);border-radius:1px;overflow:hidden;margin-bottom:8px">
        <div style="height:100%;width:${item.score*10}%;background:${scoreGrad};border-radius:1px;transition:width 0.8s ease"></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${sigBadges}</div>
    </div>`;
  }).join('');

  res.innerHTML=statsBar+'<div class="scanner-list">'+cards+'</div>';
}

function analyzeFromScanner(ticker){
  toggleScanner();
  document.getElementById('stockInput').value=ticker;
  setTimeout(()=>analyzeStock(),100);
}
