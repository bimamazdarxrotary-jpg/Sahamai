// ── STATE ──────────────────────────────────────────────────────────
let tvChart=null,tvSeries=null,tvVolSeries=null;
let rsiChart=null,rsiSeries=null;
let macdChart=null,macdHistSeries=null,macdLineSeries=null,macdSignalSeries=null;
let currentCandles=[],currentChartType='candle',currentRange='3mo';
let activeIndicators={sma50:true,ema9:true,bb:false,rsi:false,macd:false};
let chartSeriesMap={};
let scannerVisible=false,currentScanFilter='all';

// ── ANALYZE ────────────────────────────────────────────────────────
async function analyzeStock(){
  const input=document.getElementById('stockInput');
  const ticker=input.value.trim().toUpperCase();
  if(!ticker){showToast('Masukkan kode saham','error');return;}
  // BUG FIX 1: validasi karakter kode saham — hanya huruf, maks 10
  if(!/^[A-Z0-9]{1,10}$/.test(ticker)){showToast('Kode saham tidak valid','error');return;}
  const btn=document.getElementById('analyzeBtn'),icon=document.getElementById('btnIcon');
  btn.disabled=true;icon.className='spin';icon.textContent='↻';
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.textContent===ticker));
  const section=document.getElementById('resultsSection'),content=document.getElementById('resultsContent');
  section.style.display='block';
  section.scrollIntoView({behavior:'smooth',block:'start'});
  content.innerHTML=buildSkeleton();
  // BUG FIX 2: destroy semua chart (bukan hanya tvChart) sebelum analisis baru
  destroyAllCharts();
  try{
    const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker})});
    const d=await res.json();
    if(!res.ok)throw new Error(d.error||`HTTP ${res.status}`);
    content.innerHTML=buildResult(ticker,d);
    if(d.priceData&&d.priceData.candles&&d.priceData.candles.length){
      currentCandles=d.priceData.candles;
      initTVChart(currentCandles,currentChartType);
    }
    showToast(`${d.fromCache?'⚡ Cache':'✓ Selesai'} — ${d.latencyMs||0}ms`,'ok');
  }catch(err){
    content.innerHTML=`<div style="text-align:center;padding:4rem 1rem"><div style="font-size:3rem;margin-bottom:1rem">⚠️</div><p style="font-size:1rem;color:var(--red);margin-bottom:8px;font-family:var(--mono);font-weight:700">Gagal menganalisis</p><p style="font-size:12px;color:var(--text3)">${esc(String(err.message))}</p></div>`;
    showToast('Error: '+err.message,'error');
  }
  btn.disabled=false;icon.className='';icon.textContent='✦';
}
function quickAnalyze(code){document.getElementById('stockInput').value=code;analyzeStock();}

// BUG FIX 2: fungsi terpusat untuk destroy semua chart instance
function destroyAllCharts(){
  if(tvChart){try{tvChart.remove();}catch(e){}tvChart=null;tvSeries=null;tvVolSeries=null;}
  if(rsiChart){try{rsiChart.remove();}catch(e){}rsiChart=null;rsiSeries=null;}
  if(macdChart){try{macdChart.remove();}catch(e){}macdChart=null;macdHistSeries=null;macdLineSeries=null;macdSignalSeries=null;}
  chartSeriesMap={};
}

// ── CHART CALC ─────────────────────────────────────────────────────
function calcEMA(data,period){
  const k=2/(period+1);const result=[];let ema=null;
  for(let i=0;i<data.length;i++){
    if(i<period-1)continue;
    if(ema===null)ema=data.slice(0,period).reduce((a,c)=>a+c.close,0)/period;
    else ema=data[i].close*k+ema*(1-k);
    result.push({time:data[i].date,value:Math.round(ema)});
  }return result;
}
function calcSMA(data,period){
  const result=[];
  for(let i=period-1;i<data.length;i++){
    const avg=data.slice(i-period+1,i+1).reduce((a,c)=>a+c.close,0)/period;
    result.push({time:data[i].date,value:Math.round(avg)});
  }return result;
}
function calcBB(data,period,mult){
  period=period||20;mult=mult||2;
  const upper=[],middle=[],lower=[];
  for(let i=period-1;i<data.length;i++){
    const slice=data.slice(i-period+1,i+1);
    const avg=slice.reduce((a,c)=>a+c.close,0)/period;
    const std=Math.sqrt(slice.reduce((a,c)=>a+Math.pow(c.close-avg,2),0)/period);
    upper.push({time:data[i].date,value:Math.round(avg+mult*std)});
    middle.push({time:data[i].date,value:Math.round(avg)});
    lower.push({time:data[i].date,value:Math.round(avg-mult*std)});
  }return{upper,middle,lower};
}
function calcRSI(data,period){
  period=period||14;
  const result=[];const closes=data.map(c=>c.close);
  if(closes.length<period+1)return result;
  const changes=closes.slice(1).map((v,i)=>v-closes[i]);
  let avgGain=changes.slice(0,period).filter(v=>v>0).reduce((a,b)=>a+b,0)/period;
  let avgLoss=changes.slice(0,period).filter(v=>v<0).reduce((a,b)=>a+Math.abs(b),0)/period;
  for(let i=period;i<changes.length;i++){
    const gain=changes[i]>0?changes[i]:0,loss=changes[i]<0?Math.abs(changes[i]):0;
    avgGain=(avgGain*(period-1)+gain)/period;avgLoss=(avgLoss*(period-1)+loss)/period;
    const rs=avgLoss===0?100:avgGain/avgLoss;
    result.push({time:data[i].date,value:Math.round(100-100/(1+rs))});
  }return result;
}
function calcMACD(data,fast,slow,signal){
  fast=fast||12;slow=slow||26;signal=signal||9;
  const kf=2/(fast+1),ks=2/(slow+1),kg=2/(signal+1);
  const closes=data.map(c=>c.close);
  if(closes.length<slow+signal)return{macd:[],signal:[],hist:[]};
  let ef=closes.slice(0,fast).reduce((a,b)=>a+b)/fast;
  let es=closes.slice(0,slow).reduce((a,b)=>a+b)/slow;
  const macdLine=[];
  for(let i=1;i<fast;i++)ef=closes[i]*kf+ef*(1-kf);
  for(let i=slow;i<closes.length;i++){
    ef=closes[i]*kf+ef*(1-kf);es=closes[i]*ks+es*(1-ks);
    macdLine.push({time:data[i].date,value:parseFloat((ef-es).toFixed(2))});
  }
  if(macdLine.length<signal)return{macd:[],signal:[],hist:[]};
  let sg=macdLine.slice(0,signal).reduce((a,b)=>a+b.value,0)/signal;
  const sigLine=[],histLine=[];
  for(let i=0;i<macdLine.length;i++){
    if(i>=signal)sg=macdLine[i].value*kg+sg*(1-kg);
    if(i>=signal-1){
      sigLine.push({time:macdLine[i].time,value:parseFloat(sg.toFixed(2))});
      histLine.push({time:macdLine[i].time,value:parseFloat((macdLine[i].value-sg).toFixed(2)),color:macdLine[i].value-sg>=0?'rgba(0,214,143,0.5)':'rgba(240,79,94,0.5)'});
    }
  }return{macd:macdLine.slice(signal-1),signal:sigLine,hist:histLine};
}

function toggleIndicator(ind){
  activeIndicators[ind]=!activeIndicators[ind];
  const btn=document.getElementById('tog-'+ind);
  if(btn)btn.className='ind-toggle '+(activeIndicators[ind]?'on-':'off-')+ind;
  // BUG FIX 3: destroy sub-chart yang relevan sebelum re-init agar tidak double-mount
  if(ind==='rsi'){
    if(rsiChart){try{rsiChart.remove();}catch(e){}rsiChart=null;rsiSeries=null;}
    const p=document.getElementById('panel-rsi');if(p)p.classList.toggle('visible',activeIndicators.rsi);
  }
  if(ind==='macd'){
    if(macdChart){try{macdChart.remove();}catch(e){}macdChart=null;macdHistSeries=null;macdLineSeries=null;macdSignalSeries=null;}
    const p=document.getElementById('panel-macd');if(p)p.classList.toggle('visible',activeIndicators.macd);
  }
  if(currentCandles.length)initTVChart(currentCandles,currentChartType);
}

function initTVChart(allCandles,type){
  type=type||'candle';
  const container=document.getElementById('tvChart');
  if(!container||!allCandles||!allCandles.length)return;
  // Destroy semua chart dulu
  destroyAllCharts();
  const data=filterByRange(allCandles,currentRange);
  if(!data.length)return;
  const isUp=data[data.length-1].close>=data[0].close;
  tvChart=LightweightCharts.createChart(container,{
    width:container.clientWidth,height:container.clientHeight||240,
    layout:{background:{color:'transparent'},textColor:'#4a6070'},
    grid:{vertLines:{color:'rgba(255,255,255,0.03)'},horzLines:{color:'rgba(255,255,255,0.03)'}},
    crosshair:{mode:LightweightCharts.CrosshairMode.Normal},
    rightPriceScale:{borderColor:'rgba(255,255,255,0.05)',scaleMargins:{top:0.08,bottom:0.28}},
    timeScale:{borderColor:'rgba(255,255,255,0.05)',timeVisible:true,secondsVisible:false},
    handleScroll:true,handleScale:true
  });
  if(type==='candle'){
    tvSeries=tvChart.addCandlestickSeries({upColor:'#00d68f',downColor:'#f04f5e',borderUpColor:'#00d68f',borderDownColor:'#f04f5e',wickUpColor:'#00d68f',wickDownColor:'#f04f5e'});
    // BUG FIX 4: open fallback ke close jika null/undefined, bukan hanya falsy (menghindari open=0 edge case)
    tvSeries.setData(data.map(c=>({time:c.date,open:c.open!=null?c.open:c.close,high:c.high,low:c.low,close:c.close})));
  }else{
    tvSeries=tvChart.addAreaSeries({lineColor:isUp?'#00d68f':'#f04f5e',topColor:isUp?'rgba(0,214,143,0.2)':'rgba(240,79,94,0.15)',bottomColor:'rgba(0,0,0,0)',lineWidth:2});
    tvSeries.setData(data.map(c=>({time:c.date,value:c.close})));
  }
  if(activeIndicators.ema9&&data.length>=9){const s=tvChart.addLineSeries({color:'rgba(0,214,143,0.7)',lineWidth:1,lastValueVisible:false,priceLineVisible:false});s.setData(calcEMA(data,9));chartSeriesMap.ema9=s;}
  if(activeIndicators.sma50&&data.length>=50){const s=tvChart.addLineSeries({color:'rgba(77,159,255,0.6)',lineWidth:1,lineStyle:1,lastValueVisible:false,priceLineVisible:false});s.setData(calcSMA(data,50));chartSeriesMap.sma50=s;}
  if(activeIndicators.bb&&data.length>=20){
    const bb=calcBB(data,20);
    const bU=tvChart.addLineSeries({color:'rgba(168,85,247,0.5)',lineWidth:1,lastValueVisible:false,priceLineVisible:false});
    const bM=tvChart.addLineSeries({color:'rgba(168,85,247,0.3)',lineWidth:1,lineStyle:2,lastValueVisible:false,priceLineVisible:false});
    const bL=tvChart.addLineSeries({color:'rgba(168,85,247,0.5)',lineWidth:1,lastValueVisible:false,priceLineVisible:false});
    bU.setData(bb.upper);bM.setData(bb.middle);bL.setData(bb.lower);chartSeriesMap.bb=[bU,bM,bL];
  }
  tvVolSeries=tvChart.addHistogramSeries({color:'rgba(255,255,255,0.06)',priceFormat:{type:'volume'},priceScaleId:'',scaleMargins:{top:0.75,bottom:0}});
  tvVolSeries.setData(data.map(c=>({time:c.date,value:c.volume||0,color:c.close>=(c.open!=null?c.open:c.close)?'rgba(0,214,143,0.2)':'rgba(240,79,94,0.18)'})));
  tvChart.timeScale().fitContent();
  // RSI sub-chart
  if(activeIndicators.rsi){
    const rc=document.getElementById('rsiChart');
    if(rc&&data.length>=15){
      rsiChart=LightweightCharts.createChart(rc,{width:rc.clientWidth,height:75,layout:{background:{color:'transparent'},textColor:'#4a6070'},grid:{vertLines:{color:'rgba(255,255,255,0.02)'},horzLines:{color:'rgba(255,255,255,0.02)'}},rightPriceScale:{borderColor:'rgba(255,255,255,0.05)',scaleMargins:{top:0.1,bottom:0.1}},timeScale:{borderColor:'rgba(255,255,255,0.05)',timeVisible:false},handleScroll:false,handleScale:false});
      rsiSeries=rsiChart.addLineSeries({color:'#f04f5e',lineWidth:1,lastValueVisible:true,priceLineVisible:false});
      rsiSeries.setData(calcRSI(data,14));
      const ob=rsiChart.addLineSeries({color:'rgba(240,79,94,0.25)',lineWidth:1,lineStyle:2,lastValueVisible:false,priceLineVisible:false});
      const os=rsiChart.addLineSeries({color:'rgba(0,214,143,0.25)',lineWidth:1,lineStyle:2,lastValueVisible:false,priceLineVisible:false});
      const times=data.map(c=>c.date);
      ob.setData(times.map(t=>({time:t,value:70})));os.setData(times.map(t=>({time:t,value:30})));
      rsiChart.timeScale().fitContent();
      new ResizeObserver(function(){if(rsiChart&&rc)rsiChart.applyOptions({width:rc.clientWidth});}).observe(rc);
    }
  }
  // MACD sub-chart
  if(activeIndicators.macd){
    const mc=document.getElementById('macdChart');
    if(mc&&data.length>=35){
      macdChart=LightweightCharts.createChart(mc,{width:mc.clientWidth,height:75,layout:{background:{color:'transparent'},textColor:'#4a6070'},grid:{vertLines:{color:'rgba(255,255,255,0.02)'},horzLines:{color:'rgba(255,255,255,0.02)'}},rightPriceScale:{borderColor:'rgba(255,255,255,0.05)',scaleMargins:{top:0.1,bottom:0.1}},timeScale:{borderColor:'rgba(255,255,255,0.05)',timeVisible:false},handleScroll:false,handleScale:false});
      const md=calcMACD(data);
      macdHistSeries=macdChart.addHistogramSeries({lastValueVisible:false,priceLineVisible:false});
      macdLineSeries=macdChart.addLineSeries({color:'#00d68f',lineWidth:1,lastValueVisible:true,priceLineVisible:false});
      macdSignalSeries=macdChart.addLineSeries({color:'#f04f5e',lineWidth:1,lastValueVisible:true,priceLineVisible:false});
      if(md.hist.length)macdHistSeries.setData(md.hist);
      if(md.macd.length)macdLineSeries.setData(md.macd);
      if(md.signal.length)macdSignalSeries.setData(md.signal);
      macdChart.timeScale().fitContent();
      new ResizeObserver(function(){if(macdChart&&mc)macdChart.applyOptions({width:mc.clientWidth});}).observe(mc);
    }
  }
  new ResizeObserver(function(){if(tvChart&&container)tvChart.applyOptions({width:container.clientWidth});}).observe(container);
}

function filterByRange(candles,range){
  if(!candles)return[];
  if(range==='1mo')return candles.slice(-22);
  if(range==='3mo')return candles.slice(-65);
  if(range==='6mo')return candles.slice(-130);
  return candles;
}
function setRange(range,el){
  document.querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');currentRange=range;
  // BUG FIX 5: tidak destroy dulu via destroyAllCharts karena itu akan hapus RSI/MACD state juga
  // Cukup remove tvChart lalu re-init
  if(tvChart){try{tvChart.remove();}catch(e){}tvChart=null;tvSeries=null;tvVolSeries=null;}
  initTVChart(currentCandles,currentChartType);
}
function setChartType(type,el){
  document.querySelectorAll('.chart-type-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');currentChartType=type;
  if(tvChart){try{tvChart.remove();}catch(e){}tvChart=null;tvSeries=null;tvVolSeries=null;}
  initTVChart(currentCandles,type);
}

// ── HELPERS ────────────────────────────────────────────────────────
function showToast(msg,type){
  type=type||'';
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const t=document.createElement('div');
  t.className='toast '+(type||'');t.textContent=msg;
  document.body.appendChild(t);setTimeout(function(){t.remove();},3500);
}
function safe(v,fb){fb=fb===undefined?'—':fb;return v!=null&&v!==''?v:fb;}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function safeArr(a){return Array.isArray(a)?a:[];}
function fmtPrice(v){if(v==null||v==='')return'—';return'Rp '+Number(v).toLocaleString('id-ID');}
function fmtVol(v){if(!v)return'—';if(v>=1e9)return(v/1e9).toFixed(2)+'B';if(v>=1e6)return(v/1e6).toFixed(1)+'Jt';if(v>=1e3)return(v/1e3).toFixed(0)+'K';return v.toLocaleString('id-ID');}
function getBadgeClass(s){const u=(s||'').toUpperCase();if(u==='BELI'||u==='BULLISH'||u==='AKUMULASI')return'sent-beli';if(u==='JUAL'||u==='BEARISH'||u==='KURANGI')return'sent-jual';return'sent-tahan';}
function getScoreColor(n){n=parseFloat(n)||0;if(n>=7)return'#00d68f';if(n>=5)return'#f0b429';return'#f04f5e';}
function getScoreGrad(n){if(n>=7)return'linear-gradient(90deg,#00b377,#00d68f)';if(n>=5)return'linear-gradient(90deg,#d97706,#f0b429)';return'linear-gradient(90deg,#c0392b,#f04f5e)';}
// BUG FIX 6: extractNum — lebih robust, handle string Rp, koma, titik ribuan
function extractNum(str){
  if(typeof str==='number')return str;
  const clean=String(str||'').replace(/Rp\.?\s*/gi,'').replace(/\./g,'').replace(/,/g,'.');
  const m=clean.match(/-?\d+(\.\d+)?/);
  return m?parseFloat(m[0]):0;
}

// ── BUILD RESULT ───────────────────────────────────────────────────
function buildResult(ticker,d){
  const pd=d.priceData||{};
  const ind=d.indicators||{};
  const vol=d.volumeData||{};
  const str=d.structureData||{};
  const sc=d.scoringData||{};
  const isIndex=['IHSG','LQ45'].includes(ticker);
  const sentiment=safe(d.sentiment,'TAHAN');
  const today=new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  // BUG FIX 7: gunakan sc.final langsung, extractNum hanya fallback, jangan double-parse
  const finalScore=sc.final!=null?parseFloat(sc.final):(extractNum(d.scoreTeknikal)||5);
  // v4: smartMoney ada di indicators, bukan volumeData
  const smfData=ind.smartMoney||{};
  const smfRatio=smfData.ratio||50;
  const smfBull=smfData.bias==='strong_buying'||smfData.bias==='mild_buying';
  const obvTrend=ind.obv?ind.obv.trend:(vol.obv?vol.obv.trend:'unknown');

  // BUG FIX 8: tampilkan crash warning banner jika ada
  const crashBanner=d.crashWarning
    ?`<div style="background:rgba(240,79,94,0.1);border:1px solid rgba(240,79,94,0.3);border-radius:10px;padding:.85rem;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:1.3rem;flex-shrink:0">⚠️</span>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--red);font-family:var(--mono);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">MARKET CRASH ALERT</div>
          <div style="font-size:11px;color:rgba(240,79,94,0.85);line-height:1.7">${esc(d.crashWarning)}</div>
        </div>
      </div>`:'' ;

  // ── SIGNAL STRIP
  const signalIcons={breakout:'🚀',volume_spike:'📊',oversold:'🔻',golden_cross:'✨',accumulation:'📦',macd_cross:'⚡',ready_pump:'🎯',death_cross:'💀',divergence:'🔁',mfi_oversold:'💧',candlestick:'🕯️',fib_level:'📐',squeeze:'🔲',market_crash:'⚠️'};
  const signalsHtml=d.scanSignals&&d.scanSignals.length
    ?`<div class="signals">${d.scanSignals.map(function(s){return`<span class="sig ${s.strength||'medium'}">${signalIcons[s.type]||'🔔'} ${esc(s.label)}</span>`;}).join('')}</div>`:'' ;

  // ── TICKER HERO
  const tickerHero=`
  <div class="ticker-hero">
    <div class="th-top">
      <div>
        <div class="th-code">${ticker}</div>
        <div class="th-name">${esc(d.namaLengkap||ticker)}</div>
        <div class="th-badges">
          <span class="th-sector">${esc(d.sektor||'IDX')}</span>
          ${pd.board?`<span class="th-sector">${esc(pd.board)}</span>`:''}
        </div>
      </div>
      <div class="th-right">
        ${pd.current?`
          <div class="th-price">${fmtPrice(pd.current)}</div>
          <div class="th-chg ${pd.isUp?'up':'down'}">${pd.isUp?'+':''}${fmtPrice(pd.change)} (${pd.isUp?'+':''}${pd.changePct}%)</div>
        `:''}
        <div style="display:flex;align-items:center;gap:5px;margin-top:8px;justify-content:flex-end;flex-wrap:wrap">
          <span class="badge ${getBadgeClass(sentiment)}">${sentiment}</span>
          <span class="conf conf-${(sc.confidence||'medium').toLowerCase()}">${sc.confidence||'Medium'}</span>
        </div>
        ${!isIndex?`<div style="text-align:right;margin-top:7px"><span class="wl-add-btn" onclick="addToWatchlist('${ticker}')">⭐ Watchlist</span></div>`:''}
      </div>
    </div>
    <div class="score-bar-wrap">
      <div class="sb-top">
        <div>
          <div class="sb-label">SKOR SENTIMEN</div>
          <div class="sb-reco" style="color:${getScoreColor(finalScore)}">${esc(sc.recommendation||'TAHAN')} · ${esc(sc.riskReward||'Moderate')}</div>
        </div>
        <div>
          <div class="sb-score" style="color:${getScoreColor(finalScore)}">${finalScore}<span style="font-size:.9rem;color:var(--text3)">/10</span></div>
        </div>
      </div>
      <div class="sb-track"><div class="sb-fill" style="width:${finalScore*10}%;background:${getScoreGrad(finalScore)}"></div></div>
      <div class="sb-poles"><span class="sb-pole">EXTREME BEARISH</span><span class="sb-pole">NEUTRAL</span><span class="sb-pole">EXTREME BULLISH</span></div>
    </div>
  </div>`;

  // ── 4-PANEL GRID
  const p1=`
  <div class="panel p-green">
    <div class="p-label green">📊 Ringkasan Scoring</div>
    <div class="p-num green">${finalScore}<span style="font-size:.9rem;color:var(--text3)">/10</span></div>
    <div class="p-sub">${esc(sc.recommendation||'TAHAN')} · ${esc(sc.riskReward||'Moderate')}</div>
    ${sc.breakdown?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:.5rem">
      <span class="pill pill-${sc.breakdown.trend&&sc.breakdown.trend.score>=6?'g':'r'}">T:${sc.breakdown.trend&&sc.breakdown.trend.score||'—'}</span>
      <span class="pill pill-${sc.breakdown.volume&&sc.breakdown.volume.score>=6?'g':'r'}">V:${sc.breakdown.volume&&sc.breakdown.volume.score||'—'}</span>
      <span class="pill pill-${sc.breakdown.momentum&&sc.breakdown.momentum.score>=6?'g':'r'}">M:${sc.breakdown.momentum&&sc.breakdown.momentum.score||'—'}</span>
    </div>`:''}
  </div>`;

  const p2=`
  <div class="panel p-gold">
    <div class="p-label gold">🧠 Smart Money</div>
    <div class="p-num ${smfBull?'gold':'red'}">${smfRatio}<span style="font-size:.9rem">%</span></div>
    <div class="p-sub">${esc(smfData.label||'—')}</div>
    <div class="smf-bar">
      <div class="smf-row">
        <span class="smf-lbl" style="color:var(--green)">BUY</span>
        <div class="smf-track"><div class="smf-g" style="width:${smfRatio}%"></div></div>
        <span class="smf-val" style="color:var(--green)">${smfRatio}%</span>
      </div>
      <div class="smf-row">
        <span class="smf-lbl" style="color:var(--red)">SELL</span>
        <div class="smf-track"><div class="smf-r" style="width:${100-smfRatio}%"></div></div>
        <span class="smf-val" style="color:var(--red)">${100-smfRatio}%</span>
      </div>
    </div>
    <div style="margin-top:.4rem">
      <span class="pill ${obvTrend==='rising'?'pill-g':'pill-r'}">OBV ${esc(obvTrend)}</span>
      ${vol.accDist?`<span class="pill ${vol.accDist.bias==='accumulation'?'pill-g':'pill-r'}" style="margin-left:3px">${esc((vol.accDist.bias||'').toUpperCase())}</span>`:''}
    </div>
  </div>`;

  // BUG FIX 9: optional chaining diganti dengan null-safe access agar tidak error di browser lama
  const rsi=ind.rsi;
  const ma20ok=ind.ma&&pd.current&&ind.ma.ema9&&pd.current>ind.ma.ema9;
  const ma50ok=ind.ma&&pd.current&&ind.ma.sma50&&pd.current>ind.ma.sma50;
  const macdOk=ind.macd&&ind.macd.trend==='bullish';
  const atrPct=(ind.atr&&ind.atr.atrPct)||0;
  const p3=`
  <div class="panel p-dark">
    <div class="p-label muted">⚡ Kondisi Harga</div>
    <div style="display:flex;align-items:baseline;gap:6px;margin:.3rem 0">
      <span style="font-family:var(--mono);font-size:1.6rem;font-weight:800;color:${rsi<30?'var(--green)':rsi>70?'var(--red)':'var(--text)'}">${rsi!=null?rsi:'—'}</span>
      <span style="font-size:9px;color:var(--text3);font-family:var(--mono)">RSI</span>
    </div>
    <div class="cond-chips">
      <span class="cchip ${ma20ok?'cok':'cbad'}">EMA9 ${ma20ok?'✓':'✗'}</span>
      <span class="cchip ${ma50ok?'cok':'cbad'}">SMA50 ${ma50ok?'✓':'✗'}</span>
      <span class="cchip ${macdOk?'cok':'cwarn'}">MACD ${macdOk?'BULL':'BEAR'}</span>
      ${ind.atr?`<span class="cchip ${atrPct>4?'cbad':atrPct>2?'cwarn':'cok'}">ATR ${atrPct}%</span>`:''}
    </div>
  </div>`;

  const p4=`
  <div class="panel p-blue">
    <div class="p-label blue">🎯 Entry Area</div>
    <div class="entry-range">${esc(d.levelBeli||'—')}</div>
    <div class="entry-sub">RECOMMENDED ZONE</div>
    <div style="display:flex;gap:5px;margin-top:.5rem;flex-wrap:wrap">
      ${d.stopLoss?`<span class="pill pill-r">SL: ${esc(d.stopLoss)}</span>`:''}
      ${d.targetHarga?`<span class="pill pill-g">TP: ${esc(d.targetHarga)}</span>`:''}
    </div>
    ${vol.vwap?`<div style="margin-top:.4rem;font-size:9px;color:var(--text3);font-family:var(--mono)">VWAP: ${fmtPrice(vol.vwap)}</div>`:''}
  </div>`;

  const panelGrid=!isIndex
    ?`<div class="grid-2">${p1}${p2}</div><div class="grid-2">${p3}${p4}</div>`
    :`<div class="grid-2">${p1}${p2}</div>`;

  // ── RISK MANAGEMENT
  const riskCard=!isIndex&&(d.targetHarga||d.stopLoss)?`
  <div class="risk-card">
    <div class="risk-header">
      <div class="risk-title">MANAJEMEN RISIKO</div>
      ${sc.riskReward?`<span class="pill ${sc.riskReward==='Favorable'?'pill-g':sc.riskReward==='Unfavorable'?'pill-r':'pill-gold'}">${esc(sc.riskReward)}</span>`:''}
    </div>
    <div class="risk-sl">
      <div class="risk-sl-label">STOP LOSS (EXIT)</div>
      <div class="risk-sl-val">${esc(d.stopLoss||'—')}</div>
      <div class="risk-sl-note">Batas cut loss — patuhi trading plan</div>
    </div>
    <div class="risk-targets">
      <div class="risk-t">
        <div class="risk-t-lbl">TARGET 1</div>
        <div class="risk-t-val g">${esc(d.targetHarga||'—')}</div>
        <div class="risk-t-sub">Profit taking</div>
      </div>
      <div class="risk-t">
        <div class="risk-t-lbl">HARGA WAJAR</div>
        <div class="risk-t-val gold">${esc(d.priceEst||'—')}</div>
        <div class="risk-t-sub">Fair value est.</div>
      </div>
    </div>
    ${d.rekomendasi?`<div class="risk-note-bar">${esc(d.rekomendasi)}</div>`:''}
  </div>`:'' ;

  // ── CHART
  const chartCard=pd.current?`
  <div class="chart-card">
    <div class="chart-hdr">
      <div class="chart-title">📈 PRICE CHART</div>
      <div class="chart-ctrls">
        <div style="display:flex;gap:2px">
          <span class="ctab ctab-type chart-type-tab active" onclick="setChartType('candle',this)">Candle</span>
          <span class="ctab ctab-type chart-type-tab" onclick="setChartType('area',this)">Area</span>
        </div>
        <div style="display:flex;gap:2px">
          <span class="ctab chart-tab" onclick="setRange('1mo',this)">1B</span>
          <span class="ctab chart-tab active" onclick="setRange('3mo',this)">3B</span>
          <span class="ctab chart-tab" onclick="setRange('6mo',this)">6B</span>
          <span class="ctab chart-tab" onclick="setRange('all',this)">Max</span>
        </div>
      </div>
    </div>
    <div id="tvChart"></div>
    <div class="ind-toggles">
      <span class="ind-toggle on-ema9"  id="tog-ema9"  onclick="toggleIndicator('ema9')">EMA9</span>
      <span class="ind-toggle on-sma50" id="tog-sma50" onclick="toggleIndicator('sma50')">SMA50</span>
      <span class="ind-toggle off-bb" id="tog-bb" onclick="toggleIndicator('bb')">BB</span>
      <span class="ind-toggle off-rsi" id="tog-rsi" onclick="toggleIndicator('rsi')">RSI</span>
      <span class="ind-toggle off-macd" id="tog-macd" onclick="toggleIndicator('macd')">MACD</span>
    </div>
    <div class="subpanel" id="panel-rsi"><div class="subpanel-lbl">RSI(14)</div><div id="rsiChart"></div></div>
    <div class="subpanel" id="panel-macd"><div class="subpanel-lbl">MACD(12,26,9)</div><div id="macdChart"></div></div>
  </div>`:'' ;

  // ── STAT ROW
  const statRow=pd.current?`
  <div class="grid-4">
    <div class="stat"><div class="stat-l">52W HIGH</div><div class="stat-v g">${fmtPrice(pd.high52w)}</div></div>
    <div class="stat"><div class="stat-l">52W LOW</div><div class="stat-v">${fmtPrice(pd.low52w)}</div></div>
    <div class="stat"><div class="stat-l">RSI(14)</div><div class="stat-v ${rsi<30?'g':rsi>70?'r':'gold'}">${rsi!=null?rsi:'—'}</div></div>
    <div class="stat"><div class="stat-l">VOLUME</div><div class="stat-v">${fmtVol(pd.volume)}</div></div>
  </div>`:'' ;

  // ── WHY NOW
  const whyNow=d.whyNow?`
  <div class="why-card">
    <div class="why-lbl">⚡ WHY NOW</div>
    <div class="why-text">${esc(d.whyNow)}</div>
  </div>`:'' ;

  // ── SCORE BREAKDOWN
  const scorePanel=sc.breakdown?`
  <div class="card">
    <div class="clbl">Scoring Deterministik</div>
    <div class="breakdown-grid">
      ${['trend','volume','momentum','risk','setup'].map(function(k){
        const item=sc.breakdown[k];if(!item)return'';
        const isRisk=k==='risk',ds=isRisk?10-item.score:item.score;
        const labels={trend:'TREN',volume:'VOLUME',momentum:'MOMENTUM',risk:'SAFETY',setup:'SETUP'};
        return`<div class="bk-item"><div class="bk-lbl">${labels[k]}</div><div class="bk-num" style="color:${getScoreColor(ds)}">${ds}</div><div class="bk-bar"><div class="bk-fill" style="width:${ds*10}%;background:${getScoreGrad(ds)}"></div></div><div class="bk-reasons">${safeArr(item.reasons).slice(0,2).map(function(r){return'• '+esc(r);}).join('<br>')}</div></div>`;
      }).join('')}
    </div>
  </div>`:'' ;

  // ── INTEL
  const intelGrid=ind.bb||ind.macd||ind.stoch||ind.atr?`
  <div class="grid-2">
    ${ind.bb?`<div class="intel"><div class="intel-l">BOLLINGER BANDS</div><div class="intel-v" style="color:${ind.bb.position==='overbought_zone'?'var(--red)':ind.bb.position==='oversold_zone'?'var(--green)':'var(--text)'}">${(ind.bb.position||'').replace(/_/g,' ')}</div><div class="intel-s">BW: ${ind.bb.bandwidth}% · U: ${fmtPrice(ind.bb.upper)} / L: ${fmtPrice(ind.bb.lower)}</div></div>`:''}
    ${ind.macd?`<div class="intel"><div class="intel-l">MACD</div><span class="pill pill-${ind.macd.trend==='bullish'?'g':'r'}">${(ind.macd.trend||'').toUpperCase()}</span>${ind.macd.crossover?`<span class="pill pill-gold" style="margin-left:3px">${ind.macd.crossover.replace(/_/g,' ').toUpperCase()}</span>`:''}<div class="intel-s" style="margin-top:4px">Hist: ${ind.macd.histogram!=null?ind.macd.histogram:'—'}</div></div>`:''}
    ${ind.stoch?`<div class="intel"><div class="intel-l">STOCHASTIC</div><span class="pill pill-${ind.stoch.signal==='oversold'?'g':ind.stoch.signal==='overbought'?'r':'gold'}">${(ind.stoch.signal||'').toUpperCase()}</span><div class="intel-s" style="margin-top:4px">K: ${ind.stoch.k} · D: ${ind.stoch.d}</div></div>`:''}
    ${ind.atr?`<div class="intel"><div class="intel-l">VOLATILITAS ATR</div><div class="intel-v">${fmtPrice(ind.atr.atr)}</div><div class="intel-s">${ind.atr.atrPct}% — ${ind.atr.atrPct>4?'⚠️ Sangat Volatil':ind.atr.atrPct>2?'Volatil':'Stabil'}</div></div>`:''}
  </div>`:'' ;

  // ── S&R
  const srCard=ind.levels&&(safeArr(ind.levels.support).length||safeArr(ind.levels.resistance).length)?`
  <div class="grid-2">
    <div class="card" style="margin-bottom:0"><div class="clbl">Support</div>${safeArr(ind.levels.support).map(function(l){return`<div style="font-family:var(--mono);font-size:.88rem;font-weight:700;color:var(--green);margin-top:5px">${fmtPrice(l)}</div>`;}).join('')||'<span style="color:var(--text3);font-size:11px">—</span>'}</div>
    <div class="card" style="margin-bottom:0"><div class="clbl red">Resistance</div>${safeArr(ind.levels.resistance).map(function(l){return`<div style="font-family:var(--mono);font-size:.88rem;font-weight:700;color:var(--red);margin-top:5px">${fmtPrice(l)}</div>`;}).join('')||'<span style="color:var(--text3);font-size:11px">—</span>'}</div>
  </div>`:'' ;

  // ── SETUPS
  const setupsSection=safeArr(str.setups).length?`
  <div class="card">
    <div class="clbl">Setup Terdeteksi</div>
    ${safeArr(str.setups).map(function(s){return`
    <div class="setup ${s.confidence}">
      <div class="setup-type" style="color:${s.direction==='long'?'var(--green)':s.direction==='short'?'var(--red)':'var(--text2)'}">${esc((s.type||'').replace(/_/g,' '))} · ${esc(s.direction)} · ${esc(s.confidence)}</div>
      <div class="setup-reason">${esc(s.reason)}</div>
    </div>`;}).join('')}
  </div>`:'' ;

  // ── FOREIGN FLOW CARD
  const foreignCard = d.foreignData ? (function() {
    const f = d.foreignData;
    const isPos = f.isNetBuy;
    const color = isPos ? 'var(--green)' : 'var(--red)';
    const bg    = isPos ? 'var(--gdim)' : 'var(--rdim)';
    const border = isPos ? 'rgba(0,214,143,.2)' : 'rgba(240,79,94,.2)';
    const netStr = Math.abs(f.foreignNet) >= 1e6
      ? (f.foreignNet / 1e6).toFixed(1) + ' jt lot'
      : Math.abs(f.foreignNet) >= 1e3
      ? (f.foreignNet / 1e3).toFixed(0) + ' rb lot'
      : f.foreignNet.toLocaleString('id-ID') + ' lot';
    return `<div class="card" style="border-left:3px solid ${color}">
      <div class="clbl ${isPos ? '' : 'red'}">🌏 Net Foreign Flow</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.5rem;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-family:var(--mono);font-size:1.4rem;font-weight:800;color:${color}">${isPos ? '+' : ''}${netStr}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">${esc(f.label)}</div>
        </div>
        <div style="text-align:right">
          <span class="pill ${isPos ? 'pill-g' : 'pill-r'}">${isPos ? '+' : ''}${f.netBuyRatio}% net ratio</span>
          ${f.foreignPct != null ? `<div style="font-size:9px;color:var(--text3);margin-top:3px;font-family:var(--mono)">${f.foreignPct}% dari total transaksi</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:.6rem">
        <div style="flex:1;background:var(--bg3);border-radius:7px;padding:.5rem .7rem">
          <div style="font-size:8px;color:var(--text3);font-family:var(--mono);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">BELI</div>
          <div style="font-family:var(--mono);font-size:.85rem;font-weight:700;color:var(--green)">${f.foreignBuy ? f.foreignBuy.toLocaleString('id-ID') : '—'}</div>
        </div>
        <div style="flex:1;background:var(--bg3);border-radius:7px;padding:.5rem .7rem">
          <div style="font-size:8px;color:var(--text3);font-family:var(--mono);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">JUAL</div>
          <div style="font-family:var(--mono);font-size:.85rem;font-weight:700;color:var(--red)">${f.foreignSell ? f.foreignSell.toLocaleString('id-ID') : '—'}</div>
        </div>
      </div>
      ${d.scoringData && d.scoringData.foreignAdj ? `<div style="margin-top:.5rem;font-size:9px;font-family:var(--mono);color:${isPos?'var(--green)':'var(--red)'}">Score adjustment: ${d.scoringData.foreignAdj > 0 ? '+' : ''}${d.scoringData.foreignAdj} (${esc(d.scoringData.foreignReason || '')})</div>` : ''}
    </div>`;
  })() : '';
  const smCard=(d.bandarSmartMoney||d.smartMoneySignal)&&(d.bandarSmartMoney||d.smartMoneySignal)!=='Tidak terdeteksi.'
    ?`<div class="sm-card"><div class="sm-lbl">🧠 Smart Money & Bandar</div><div class="sm-text">${esc(d.bandarSmartMoney||d.smartMoneySignal)}</div></div>`:'' ;

  // ── MAIN AI CARD
  const mainCard=`
  <div class="card">
    <div class="clbl">Analisis AI</div>
    <div style="font-size:.875rem;color:var(--text2);line-height:1.9;margin-bottom:1rem">${esc(d.summary||'—')}</div>
  </div>`;

  // ── BULL/BEAR
  const thesis=safeArr(d.bullThesis).length||safeArr(d.bearThesis).length?`
  <div class="grid-2">
    <div class="card" style="margin-bottom:0"><div class="clbl">🐂 Bull Thesis</div><div class="tags">${safeArr(d.bullThesis).map(function(t){return`<span class="tag g">${esc(t)}</span>`;}).join('')}</div></div>
    <div class="card" style="margin-bottom:0"><div class="clbl red">🐻 Bear Thesis</div><div class="tags">${safeArr(d.bearThesis).map(function(t){return`<span class="tag r">${esc(t)}</span>`;}).join('')}</div></div>
  </div>`:'' ;

  // ── ANALYSIS
  const analysisCards=!isIndex?`
  <div class="grid-2">
    <div class="card" style="margin-bottom:0"><div class="clbl blue">📈 Teknikal</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.analisisTeknikal||'—')}</div></div>
    <div class="card" style="margin-bottom:0"><div class="clbl gold">📊 Fundamental</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.analisisFundamental||'—')}</div></div>
  </div>`:`
  <div class="grid-2">
    <div class="card" style="margin-bottom:0"><div class="clbl">💪 Sektor Kuat</div><div class="tags">${safeArr(d.sektorKuat).map(function(s){return`<span class="tag g">${esc(s)}</span>`;}).join('')}</div></div>
    <div class="card" style="margin-bottom:0"><div class="clbl red">📉 Sektor Lemah</div><div class="tags">${safeArr(d.sektorLemah).map(function(s){return`<span class="tag r">${esc(s)}</span>`;}).join('')}</div></div>
  </div>`;

  // ── KRK
  const krkSection=`
  <div class="grid-2">
    <div class="card" style="margin-bottom:0"><div class="clbl">✅ Keunggulan</div><div class="tags">${safeArr(d.keunggulan).map(function(k){return`<span class="tag g">${esc(k)}</span>`;}).join('')}</div></div>
    <div class="card" style="margin-bottom:0"><div class="clbl red">⚠️ Risiko</div><div class="tags">${safeArr(d.risiko).map(function(r){return`<span class="tag r">${esc(r)}</span>`;}).join('')}</div></div>
  </div>
  <div class="card"><div class="clbl gold">🚀 Katalis</div><div class="tags">${safeArr(d.katalis).map(function(k,i){const neg=/risiko|waspada|ancaman|negatif|turun|melemah|tekanan/i.test(k);return`<span class="tag ${neg?'r':i===0?'g':''}">${esc(k)}</span>`;}).join('')}</div></div>`;

  // ── METRICS
  const metricsRow=`
  <div class="grid-4">
    <div class="stat"><div class="stat-l">P/E</div><div class="stat-v">${esc(safe(d.pe))}</div></div>
    <div class="stat"><div class="stat-l">P/BV</div><div class="stat-v">${esc(safe(d.pbv))}</div></div>
    <div class="stat"><div class="stat-l">DIV YIELD</div><div class="stat-v gold">${esc(safe(d.divYield))}</div></div>
    <div class="stat"><div class="stat-l">BETA</div><div class="stat-v">${esc(safe(d.beta))}</div></div>
  </div>`;

  // ── PRO INDICATORS
  const proInds=[];
  if(ind.divergence&&ind.divergence.detected)proInds.push(`<span class="pill pill-${ind.divergence.bias==='bullish'?'g':'r'}">${ind.divergence.bias==='bullish'?'Bullish':'Bearish'} Divergence</span>`);
  if(ind.candlestick&&ind.candlestick.topPattern)proInds.push(`<span class="pill pill-gold">${esc(ind.candlestick.topPattern.name)}</span>`);
  if(ind.fibonacci&&ind.fibonacci.atKeyLevel)proInds.push(`<span class="pill pill-b">Fib Level Kunci</span>`);
  if(ind.smartMoney&&ind.smartMoney.bias==='strong_buying')proInds.push(`<span class="pill pill-g">Smart Money Buy ${ind.smartMoney.ratio}%</span>`);
  if(ind.smartMoney&&ind.smartMoney.bias==='strong_selling')proInds.push(`<span class="pill pill-r">Smart Money Sell ${ind.smartMoney.ratio}%</span>`);
  const proSection=proInds.length?`
  <div class="card">
    <div class="clbl">🔬 Indikator Pro</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:.6rem">${proInds.join('')}</div>
    ${ind.fibonacci?`<div style="font-size:10px;color:var(--text2);margin-top:.5rem;line-height:1.6">${esc(ind.fibonacci.narrative||'')}</div>`:''}
  </div>`:'' ;

  // ── NEWS
  // BUG FIX 10: news item yang tidak punya title di-skip, tidak render undefined
  const newsCard=d.newsData&&(safeArr(d.newsData.emiten).length||safeArr(d.newsData.makro).length)?`
  <div class="card">
    <div class="clbl">📰 Berita Terkini</div>
    ${safeArr(d.newsData.emiten).slice(0,3).concat(safeArr(d.newsData.makro).slice(0,2)).filter(function(n){return n&&n.title;}).map(function(n){return`
    <div style="padding:7px 0;border-bottom:1px solid var(--bdr)">
      <div style="font-size:11px;color:var(--text);line-height:1.5;margin-bottom:2px">${esc(n.title)}</div>
      <div style="font-size:9px;color:var(--text3);font-family:var(--mono)">${esc(n.date||'')} · ${esc(n.source||'MAKRO')}</div>
    </div>`;}).join('')}
  </div>`:'' ;

  // ── INFO
  const infoCard=`
  <div class="card">
    <div class="clbl">📋 Info</div>
    <table class="info-table" style="margin-top:.75rem">
      <tr><td>Kode</td><td>${ticker}${!isIndex?'.JK':''}</td></tr>
      <tr><td>Sektor</td><td>${esc(safe(d.sektor,'IDX'))}</td></tr>
      <tr><td>Bursa</td><td>IDX / BEI</td></tr>
      <tr><td>Dianalisis</td><td>${today}</td></tr>
      ${d.latencyMs?`<tr><td>Latency</td><td>${d.latencyMs}ms</td></tr>`:''}
      ${d.fromCache?`<tr><td>Cache</td><td style="color:var(--green)">⚡ Hit</td></tr>`:''}
    </table>
  </div>`;

  // ── KOMPETITIF & SEKTOR CTX
  const kompCard=!isIndex&&d.posisiKompetitif?`<div class="card"><div class="clbl blue">🏆 Posisi Kompetitif</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.posisiKompetitif)}</div></div>`:'' ;
  const sectorCtx=d.sektorContext&&!isIndex?`<div class="card"><div class="clbl blue">🔄 Konteks Sektor</div><div style="font-size:.86rem;color:var(--text2);line-height:1.8;margin-top:.6rem">${esc(d.sektorContext)}</div></div>`:'' ;
  const rekSaham=isIndex&&safeArr(d.rekomendasiSaham).length?`<div class="card"><div class="clbl blue">⭐ Saham Pilihan</div><div class="tags">${safeArr(d.rekomendasiSaham).map(function(s){return`<span class="tag gold">${esc(s)}</span>`;}).join('')}</div></div>`:'' ;

  // BUG FIX 11: chart-tab active state reset ke 3B saat analisis baru
  currentRange='3mo';
  currentChartType='candle';

  return`
    ${crashBanner}
    ${signalsHtml}
    ${tickerHero}
    ${panelGrid}
    ${riskCard}
    ${chartCard}
    ${statRow}
    ${whyNow}
    ${scorePanel}
    ${intelGrid}
    ${srCard}
    ${setupsSection}
    ${proSection}
    ${smCard}
    ${foreignCard}
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
function buildSkeleton(){
  return`
  <div class="ticker-hero">
    <div class="th-top">
      <div><div class="sk" style="height:2.2rem;width:100px;margin-bottom:10px"></div><div class="sk" style="height:12px;width:180px;margin-bottom:8px"></div><div class="sk" style="height:20px;width:80px"></div></div>
      <div style="text-align:right"><div class="sk" style="height:1.6rem;width:110px;margin-bottom:8px;margin-left:auto"></div><div class="sk" style="height:14px;width:70px;margin-left:auto"></div></div>
    </div>
    <div class="score-bar-wrap"><div class="sk" style="height:12px;width:80px;margin-bottom:10px"></div><div class="sk" style="height:4px;width:100%;border-radius:4px;margin-bottom:8px"></div></div>
  </div>
  <div class="grid-2">${[1,2].map(function(){return`<div class="panel p-dark"><div class="sk" style="height:9px;width:70%;margin-bottom:12px"></div><div class="sk" style="height:2rem;width:60%;margin-bottom:8px"></div><div class="sk" style="height:10px;width:80%"></div></div>`;}).join('')}</div>
  <div class="grid-2">${[1,2].map(function(){return`<div class="panel p-dark"><div class="sk" style="height:9px;width:70%;margin-bottom:12px"></div><div class="sk" style="height:1.5rem;width:50%;margin-bottom:8px"></div><div class="sk" style="height:24px;width:90%"></div></div>`;}).join('')}</div>
  <div class="chart-card"><div class="sk" style="height:240px;border-radius:8px"></div></div>
  <div class="card"><div class="sk" style="height:9px;width:120px;margin-bottom:12px"></div><div class="breakdown-grid">${[1,2,3,4,5].map(function(){return`<div class="bk-item"><div class="sk" style="height:9px;width:60%;margin-bottom:7px"></div><div class="sk" style="height:1.2rem;width:40%;margin-bottom:6px"></div><div class="sk" style="height:2px;margin-bottom:6px"></div></div>`;}).join('')}</div></div>
  `;
}

// ── WATCHLIST ──────────────────────────────────────────────────────
function getWatchlist(){try{return JSON.parse(localStorage.getItem('sahamai_watchlist')||'[]');}catch(e){return[];}}
function saveWatchlist(list){try{localStorage.setItem('sahamai_watchlist',JSON.stringify(list));}catch(e){}}
function addToWatchlist(ticker){
  const list=getWatchlist();
  if(list.indexOf(ticker)===-1){list.push(ticker);saveWatchlist(list);renderWatchlist();showToast(ticker+' ditambahkan ke watchlist','ok');}
  else showToast(ticker+' sudah ada di watchlist','');
}
function removeFromWatchlist(ticker){saveWatchlist(getWatchlist().filter(function(t){return t!==ticker;}));renderWatchlist();}
function renderWatchlist(){
  const list=getWatchlist();
  const bar=document.getElementById('watchlistBar'),items=document.getElementById('watchlistItems');
  if(!bar||!items)return;
  if(!list.length){bar.style.display='none';return;}
  bar.style.display='block';
  items.innerHTML=list.map(function(t){return`<div class="wl-item" onclick="quickAnalyze('${t}')"><span class="wl-ticker">${t}</span><span class="wl-remove" onclick="event.stopPropagation();removeFromWatchlist('${t}')" title="Hapus">×</span></div>`;}).join('');
}
document.addEventListener('DOMContentLoaded',renderWatchlist);
document.addEventListener('DOMContentLoaded',renderPopularChips);

// ── POPULAR CHIPS ──────────────────────────────────────────────────
const POPULAR_FALLBACK=['BBCA','TLKM','GOTO','ASII','BMRI','BREN','AMMN','IHSG'];
const POPULAR_STORAGE_KEY='sahamai_popular_tickers';
const POPULAR_MAX=8;

function savePopularFromScan(results){
  if(!results||!results.length)return;
  try{
    const top=results.filter(function(r){return r.ticker&&r.ticker!=='IHSG';}).slice(0,POPULAR_MAX-1).map(function(r){return r.ticker;});
    const tickers=top.concat(['IHSG']).slice(0,POPULAR_MAX);
    localStorage.setItem(POPULAR_STORAGE_KEY,JSON.stringify({tickers:tickers,savedAt:Date.now()}));
    renderPopularChips();
  }catch(e){}
}

function renderPopularChips(){
  const container=document.getElementById('popularChips');
  if(!container)return;
  let tickers=POPULAR_FALLBACK;
  try{
    const raw=localStorage.getItem(POPULAR_STORAGE_KEY);
    if(raw){
      const data=JSON.parse(raw);
      const age=Date.now()-(data.savedAt||0);
      if(data.tickers&&data.tickers.length&&age<24*60*60*1000){tickers=data.tickers;}
    }
  }catch(e){}
  container.innerHTML=tickers.map(function(t){return`<span class="chip" onclick="quickAnalyze('${t}')">${t}</span>`;}).join('');
}

// ── SCANNER ────────────────────────────────────────────────────────
function toggleScanner(){
  scannerVisible=!scannerVisible;
  const scanSec=document.getElementById('scannerSection');
  const resSec=document.getElementById('resultsSection');
  const wlBar=document.getElementById('watchlistBar');
  const hero=document.querySelector('.hero');
  const search=document.querySelector('.search-wrap');
  const chips=document.querySelector('.chips');
  const btn=document.getElementById('navScannerBtn');
  if(scannerVisible){
    scanSec.style.display='block';resSec.style.display='none';
    if(wlBar)wlBar.style.display='none';
    if(hero)hero.style.display='none';
    if(search)search.style.display='none';
    if(chips)chips.style.display='none';
    btn.classList.add('active');btn.textContent='✕ Tutup';
    scanSec.scrollIntoView({behavior:'smooth',block:'start'});
  }else{
    scanSec.style.display='none';
    if(hero)hero.style.display='';
    if(search)search.style.display='';
    if(chips)chips.style.display='';
    renderWatchlist();
    btn.classList.remove('active');btn.textContent='⚡ Scanner';
  }
}

function setScanFilter(el,filter){
  currentScanFilter=filter;
  document.querySelectorAll('.sf-btn').forEach(function(b){b.classList.remove('active');});
  el.classList.add('active');
}

async function runScanner(){
  const btn=document.getElementById('scanRunBtn'),icon=document.getElementById('scanBtnIcon');
  const res=document.getElementById('scannerResults');
  btn.disabled=true;icon.className='spin';icon.textContent='↻';
  res.innerHTML=`<div class="scanner-loading">
    <div style="font-size:13px;color:var(--text2);margin-bottom:6px;font-family:var(--mono)">Scanning pasar...</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:1rem;font-family:var(--mono)" id="scanProgressLabel">Menganalisis 400+ saham IHSG</div>
    <div class="progress-bar"><div class="progress-fill" id="scanProgress"></div></div>
  </div>`;

  // Cek cache dulu
  try{
    const cacheCheck=await fetch('/api/scanner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filter:currentScanFilter})});
    if(cacheCheck.ok){
      const data=await cacheCheck.json();
      if(data.fromCache){
        savePopularFromScan(data.results);
        renderScanResults(data,currentScanFilter);
        const lastRun=document.getElementById('scanLastRun');
        if(lastRun)lastRun.textContent='⚡ Cache — '+data.total+' ditemukan · '+new Date().toLocaleTimeString('id-ID');
        btn.disabled=false;icon.className='';icon.textContent='⚡';
        return;
      }
    }
  }catch(e){}

  // Tidak ada cache — pakai SSE
  const prog=document.getElementById('scanProgress');
  const progLabel=document.getElementById('scanProgressLabel');
  let finalData=null;

  try{
    const evtSource=new EventSource('/api/scanner?filter='+encodeURIComponent(currentScanFilter)+'&stream=true');
    evtSource.onmessage=function(e){
      try{
        const data=JSON.parse(e.data);
        if(data.type==='partial'){
          if(prog)prog.style.width=(data.progress||30)+'%';
          if(progLabel)progLabel.textContent=data.total+' setup ditemukan, lanjut scan...';
          if(data.results&&data.results.length>0){renderScanResults({results:data.results,total:data.total,filter:currentScanFilter},currentScanFilter,true);}
        }else if(data.type==='complete'){
          finalData=data;
          evtSource.close();
          if(prog)prog.style.width='100%';
          savePopularFromScan(data.results);
          renderScanResults(data,currentScanFilter);
          const lastRun=document.getElementById('scanLastRun');
          if(lastRun)lastRun.textContent=data.total+' ditemukan · '+new Date().toLocaleTimeString('id-ID');
          btn.disabled=false;icon.className='';icon.textContent='⚡';
        }else if(data.type==='error'){
          evtSource.close();
          res.innerHTML=`<div class="scanner-empty">❌ ${esc(data.error)}</div>`;
          showToast(data.error,'error');
          btn.disabled=false;icon.className='';icon.textContent='⚡';
        }
      }catch(err){}
    };
    evtSource.onerror=function(){
      evtSource.close();
      if(!finalData){
        res.innerHTML='<div class="scanner-empty">❌ Koneksi terputus. Coba lagi.</div>';
        btn.disabled=false;icon.className='';icon.textContent='⚡';
      }
    };
  }catch(e){
    res.innerHTML=`<div class="scanner-empty">❌ ${esc(e.message)}</div>`;
    showToast(e.message,'error');
    btn.disabled=false;icon.className='';icon.textContent='⚡';
  }
}

function renderScanResults(data,filter,isPartial){
  const el=document.getElementById('scannerResults');
  if(!data||!data.results){el.innerHTML='<div class="scanner-empty">Tidak ada hasil.</div>';return;}
  const results=data.results;
  if(!results.length){el.innerHTML='<div class="scanner-empty">Tidak ada saham yang cocok.</div>';return;}
  const bullCount=results.filter(function(r){return r.score>=6;}).length;
  const bearCount=results.filter(function(r){return r.score<=4;}).length;
  const stats=`<div class="scan-stats">
    <div class="scan-stat"><span class="scan-stat-num" style="color:var(--green)">${bullCount}</span><span class="scan-stat-lbl"> Bullish</span></div>
    <div class="scan-stat"><span class="scan-stat-num">${results.length}</span><span class="scan-stat-lbl"> Total</span></div>
    <div class="scan-stat"><span class="scan-stat-num" style="color:var(--red)">${bearCount}</span><span class="scan-stat-lbl"> Bearish</span></div>
  </div>`;
  const rows=results.slice(0,50).map(function(r){
    const dir=r.score>=7?'bull':r.score<=3?'bear':'neutral';
    const scoreColor=getScoreColor(r.score);
    const rek=r.recommendation||'TAHAN';
    const actionBadge=rek==='BELI'||rek==='AKUMULASI'
      ?`<span class="pill pill-g">${rek}</span>`
      :rek==='JUAL'||rek==='KURANGI'
      ?`<span class="pill pill-r">${rek}</span>`
      :`<span class="pill pill-gray">${rek}</span>`;
    const sigs=safeArr(r.signals).slice(0,2).map(function(s){return`<span class="sc-sig ${s.strength||'medium'}">${esc(s.label)}</span>`;}).join('');
    const chgSign=r.isUp?'+':'';
    return`<div class="sc-row ${dir}" onclick="analyzeFromScanner('${esc(r.ticker)}')">
      <div class="sc-avatar">${r.ticker.slice(0,2)}</div>
      <div>
        <div class="sc-ticker">${esc(r.ticker)}</div>
        <div class="sc-name">${esc(r.name||r.ticker)}</div>
        <div class="sc-sigs">${sigs}</div>
      </div>
      <div class="sc-price-col">
        <div class="sc-price">${fmtPrice(r.lastClose)}</div>
        <div class="sc-chg ${r.isUp?'up':'down'}">${chgSign}${r.changePct}%</div>
        <div style="margin-top:3px">${actionBadge}</div>
      </div>
      <div class="sc-score-col">
        <div class="sc-score-val" style="color:${scoreColor}">${r.score}</div>
        <div class="sc-score-lbl">/10</div>
      </div>
    </div>`;
  }).join('');
  el.innerHTML=stats+'<div class="scan-list">'+rows+'</div>';
  const u=document.getElementById('scanUniverse');if(u)u.textContent=data.universe||'150+';
  if(data.scannedAt){
    const t=new Date(data.scannedAt);
    const lr=document.getElementById('scanLastRun');
    if(lr)lr.textContent='Update: '+t.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})+(data.fromCache?' (cache)':'');
  }
}

function analyzeFromScanner(ticker){
  toggleScanner();
  document.getElementById('stockInput').value=ticker;
  analyzeStock();
}
