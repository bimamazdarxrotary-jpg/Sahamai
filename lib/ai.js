// ══════════════════════════════════════════════════════════════════
// lib/ai.js — AI Reasoning Engine Khusus IHSG (CommonJS)
// Model: Qwen QwQ 32B via Groq (reasoning model)
// ══════════════════════════════════════════════════════════════════

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'meta-llama/llama-4-scout-17b-16e-instruct'; // Llama 4 Scout — terbaru di Groq per Mei 2026

async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res;
      if (attempt < retries - 1)
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
}

function buildTechnicalContext(indicators, volumeData, structure, scoring, bandarData) {
  const i  = indicators || {};
  const v  = volumeData || {};
  const s  = structure  || {};
  const sc = scoring    || {};
  const bd = bandarData || {};

  const rsiLabel = i.rsi != null
    ? `${i.rsi}${i.rsi > 70 ? ' ⚠️ OVERBOUGHT' : i.rsi < 30 ? ' ✅ OVERSOLD' : i.rsi > 50 ? ' (momentum positif)' : ' (momentum negatif)'}`
    : 'N/A';

  const maStatus = i.ma
    ? [
        i.ma.aboveMA20 ? '✅ di atas MA20' : '❌ di bawah MA20',
        i.ma.aboveMA50 ? '✅ di atas MA50' : '❌ di bawah MA50',
        i.ma.ma20vs50 === 'bullish_alignment' ? '(MA20 > MA50 → BULLISH)' : '(MA20 < MA50 → BEARISH)',
        i.ma.type ? '| ' + i.ma.type.replace(/_/g,' ').toUpperCase() : ''
      ].filter(Boolean).join(' ')
    : 'N/A';

  const setups = s.setups && s.setups.length
    ? s.setups.map(st =>
        `  • ${st.type.toUpperCase()} (${st.direction}, confidence: ${st.confidence}): ${st.reason}`
      ).join('\n')
    : '  • Tidak ada setup clear';

  const smfData = v.smartMoneyFlow
    ? `SMF Ratio: ${v.smartMoneyFlow.ratio}% (${v.smartMoneyFlow.label})`
    : 'N/A';

  const vptData = v.vpt
    ? `VPT: ${v.vpt.trend} (momentum: ${v.vpt.momentum}%)`
    : 'N/A';

  // Indikator baru
  const mfi    = i.mfi    || {};
  const div    = i.divergence || {};
  const fib    = i.fibonacci  || {};
  const cs     = i.candlestick || {};
  const rs     = i.relStrength || {};
  const pivots = i.pivots || {};

  return `
═══════════════════════════════════════════════════════
INDIKATOR TEKNIKAL — DIHITUNG MATEMATIS, JANGAN DIUBAH
═══════════════════════════════════════════════════════

[MOMENTUM & OSCILLATOR]
• RSI(14)        : ${rsiLabel}
• Stochastic     : %K=${i.stoch ? i.stoch.k : 'N/A'} %D=${i.stoch ? i.stoch.d : 'N/A'} → ${i.stoch ? i.stoch.signal.toUpperCase() : 'N/A'}
• MACD           : ${i.macd ? i.macd.trend.toUpperCase() : 'N/A'} | Histogram: ${i.macd ? i.macd.histogram : 'N/A'} | Signal: ${i.macd ? i.macd.crossover || 'none' : 'N/A'}

[TREND & MOVING AVERAGE]
• MA Status      : ${maStatus}
• MA20           : ${i.ma && i.ma.ma20 ? i.ma.ma20.toLocaleString('id-ID') : 'N/A'}
• MA50           : ${i.ma && i.ma.ma50 ? i.ma.ma50.toLocaleString('id-ID') : 'N/A'}
• ADX            : ${i.trend ? i.trend.adx : 'N/A'} | Arah: ${i.trend ? i.trend.trend : 'N/A'} | Kekuatan: ${i.trend ? i.trend.strength : 'N/A'}
• HH/HL Pattern  : ${s.hhll ? s.hhll.pattern.toUpperCase() : 'N/A'}

[VOLATILITAS & BANDS]
• Bollinger Band : Upper ${i.bb && i.bb.upper ? i.bb.upper.toLocaleString('id-ID') : 'N/A'} | Mid ${i.bb && i.bb.middle ? i.bb.middle.toLocaleString('id-ID') : 'N/A'} | Lower ${i.bb && i.bb.lower ? i.bb.lower.toLocaleString('id-ID') : 'N/A'}
• BB Position    : ${i.bb ? i.bb.position.replace(/_/g,' ').toUpperCase() : 'N/A'} (${i.bb ? i.bb.bandPct : 'N/A'}% dalam band) | BW: ${i.bb ? i.bb.bandwidth : 'N/A'}%
• ATR(14)        : ${i.atr && i.atr.atr ? i.atr.atr.toLocaleString('id-ID') : 'N/A'} (${i.atr ? i.atr.atrPct : 'N/A'}% dari harga)

[SUPPORT & RESISTANCE]
• Support        : ${i.levels && i.levels.support && i.levels.support.length ? i.levels.support.map(l => l.toLocaleString('id-ID')).join(' | ') : 'N/A'}
• Resistance     : ${i.levels && i.levels.resistance && i.levels.resistance.length ? i.levels.resistance.map(l => l.toLocaleString('id-ID')).join(' | ') : 'N/A'}
• Pivot          : ${i.levels && i.levels.pivot ? i.levels.pivot.toLocaleString('id-ID') : 'N/A'}

[VOLUME INTELLIGENCE]
• Acc/Dist Bias  : ${v.accDist ? v.accDist.bias.toUpperCase() : 'N/A'} (Acc: ${v.accDist ? v.accDist.accDays : 0} hari, Dist: ${v.accDist ? v.accDist.distDays : 0} hari dari 10 hari terakhir)
• Volume Spike   : ${v.spike && v.spike.isSpike ? `⚡ YA — ${v.spike.ratio}x rata-rata (${v.spike.intensity.toUpperCase()})` : 'Tidak ada spike'}
• OBV Trend      : ${v.obv ? v.obv.trend.toUpperCase() : 'N/A'}
• VWAP           : ${v.vwap ? v.vwap.toLocaleString('id-ID') : 'N/A'}
• Smart Money Flow: ${smfData}
• VPT            : ${vptData}
• Narasi Volume  : ${v.narrative || 'N/A'}

[MARKET STRUCTURE]
• Fase Market    : ${s.phase ? s.phase.toUpperCase() : 'N/A'} — ${s.phaseLabel || ''}
• Tren Utama     : ${s.trend ? s.trend.direction.toUpperCase() : 'N/A'} | Confidence: ${s.trend ? s.trend.confidence : 'N/A'}% | ADX: ${s.trend ? s.trend.adx : 'N/A'}
• Breakout       : ${s.breakout && s.breakout.isBreakout ? `${s.breakout.type.toUpperCase()} di level ${s.breakout.level ? s.breakout.level.toLocaleString('id-ID') : 'N/A'} (${s.breakout.confirmed ? '✅ CONFIRMED' : '⚠️ UNCONFIRMED — waspadai fake breakout'})` : s.breakout ? s.breakout.type : 'Tidak ada breakout'}

[SETUP TRADING TERDETEKSI]
${setups}

[SCORING DETERMINISTIK — TIDAK BOLEH DIUBAH]
• Final Score    : ${sc.final || 'N/A'}/10 → ${sc.recommendation || 'N/A'} (${sc.confidence || 'N/A'} Confidence)
• Risk/Reward    : ${sc.riskReward || 'N/A'}
• Breakdown      :
  - Trend Score    : ${sc.breakdown && sc.breakdown.trend ? sc.breakdown.trend.score : 'N/A'}/10
  - Volume Score   : ${sc.breakdown && sc.breakdown.volume ? sc.breakdown.volume.score : 'N/A'}/10
  - Momentum Score : ${sc.breakdown && sc.breakdown.momentum ? sc.breakdown.momentum.score : 'N/A'}/10
  - Risk Score     : ${sc.breakdown && sc.breakdown.risk ? sc.breakdown.risk.score : 'N/A'}/10 (makin tinggi makin berisiko)
  - Setup Score    : ${sc.breakdown && sc.breakdown.setup ? sc.breakdown.setup.score : 'N/A'}/10

[BANDAR & SMART MONEY — MATEMATIS]
• Smart Money    : ${bd.smartMoney ? bd.smartMoney.label : 'Tidak dianalisis'} (score: ${bd.smartMoney ? bd.smartMoney.score : 'N/A'}/10)
• Tipe Saham     : ${bd.stockType ? bd.stockType.label : 'N/A'} | Volatilitas: ${bd.stockType ? bd.stockType.avgDailyVol + '%/hari' : 'N/A'}
• Stealth Acc    : ${bd.stealth && bd.stealth.detected ? `✅ TERDETEKSI — ${bd.stealth.description}` : 'Tidak terdeteksi'}
• Dist Trap      : ${bd.distTrap && bd.distTrap.detected ? `⚠️ TERDETEKSI — ${bd.distTrap.description}` : 'Tidak terdeteksi'}
• Retail Panic   : ${bd.panic && bd.panic.detected ? `📉 TERDETEKSI — ${bd.panic.description}` : 'Tidak terdeteksi'}
• SMF Signals    : ${bd.smartMoney && bd.smartMoney.signals && bd.smartMoney.signals.length ? bd.smartMoney.signals.slice(0,3).join(' | ') : 'Tidak ada'}
• Narasi Bandar  : ${bd.narrative || 'Tidak ada data'}

[INDIKATOR BARU — PRO LEVEL]
• MFI(14)        : ${mfi.mfi != null ? mfi.mfi + ' → ' + (mfi.signal || '').toUpperCase() : 'N/A'}${mfi.divergenceHint ? ' (' + mfi.divergenceHint.replace(/_/g,' ') + ')' : ''}
• Divergence     : ${div.detected ? div.summary + ' | ' + (div.divergences || []).map(d => d.indicator + ': ' + d.signal).join(' | ') : 'Tidak ada divergence terdeteksi'}
• Fibonacci      : ${fib.narrative || 'N/A'}${fib.atKeyLevel ? ' ⚠️ HARGA DI LEVEL KUNCI FIB' : ''}
• Fib Support    : ${fib.nearSupport ? fib.nearSupport.toLocaleString('id-ID') : 'N/A'} | Fib Resistance: ${fib.nearResistance ? fib.nearResistance.toLocaleString('id-ID') : 'N/A'}
• Candlestick    : ${cs.summary || 'N/A'}${cs.topPattern ? ' | Top: ' + cs.topPattern.name + ' (' + cs.topPattern.type + ', ' + cs.topPattern.strength + ') — ' + cs.topPattern.signal : ''}
• Rel Strength   : ${rs.label || 'N/A'} | ${rs.narrative || 'N/A'}
• Pivot Points   : ${pivots.narrative || 'N/A'}
`;
}

// ── VALIDASI ANGKA OUTPUT AI ───────────────────────────────────────
// Pastikan target/SL/levelBeli masuk akal relatif ke harga sekarang
function sanitizeAIOutput(parsed, priceData) {
  if (!parsed || !priceData || !priceData.current) return parsed;
  const current = priceData.current;

  // Helper: ekstrak angka dari string seperti "Rp 10.500" atau "10500"
  function extractPrice(str) {
    if (!str || typeof str !== 'string') return null;
    const cleaned = str.replace(/[Rp\s.,]/g, '').replace(/\./g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  const target = extractPrice(parsed.targetHarga);
  const sl     = extractPrice(parsed.stopLoss);
  const entry  = extractPrice(parsed.levelBeli);

  // Target harus di atas harga saat ini (max 100% gain)
  if (target !== null && (target <= current * 0.95 || target > current * 2)) {
    parsed.targetHarga = 'Rp ' + Math.round(current * 1.15).toLocaleString('id-ID') + ' (estimasi)';
  }

  // Stop loss harus di bawah harga saat ini (max 30% loss)
  if (sl !== null && (sl >= current * 0.99 || sl < current * 0.7)) {
    parsed.stopLoss = 'Rp ' + Math.round(current * 0.92).toLocaleString('id-ID') + ' (estimasi)';
  }

  // Level beli harus di bawah atau dekat harga saat ini
  if (entry !== null && entry > current * 1.05) {
    parsed.levelBeli = 'Rp ' + Math.round(current * 0.97).toLocaleString('id-ID') + ' - Rp ' + Math.round(current * 1.01).toLocaleString('id-ID') + ' (estimasi)';
  }

  return parsed;
}

function buildStockPrompt(ticker, metadata, priceContext, technicalContext, scoring) {
  var namaResmi   = metadata && metadata.name ? 'PT ' + metadata.name : ticker;
  var sektorResmi = metadata && metadata.sector ? metadata.sector : 'tidak diketahui';
  var subsektor   = metadata && metadata.subsector ? metadata.subsector : '';
  var inDB        = !!metadata;

  var recSentiment = 'TAHAN';
  if (scoring && (scoring.recommendation === 'BELI' || scoring.recommendation === 'AKUMULASI')) {
    recSentiment = 'BELI';
  } else if (scoring && (scoring.recommendation === 'JUAL' || scoring.recommendation === 'KURANGI')) {
    recSentiment = 'JUAL';
  }

  var sektorContext = getSektorContext(sektorResmi, subsektor);
  var bandaContext  = getBandarContext(scoring, metadata);

  return `Kamu adalah Senior Equity Analyst IHSG dengan pengalaman 20+ tahun di Bursa Efek Indonesia.

KEAHLIAN KHUSUS:
- Memahami psikologi dan pola pergerakan bandar IHSG
- Mendeteksi saham gorengan vs saham fundamental kuat
- Membaca foreign flow dan dampaknya ke harga
- Memahami efek MSCI rebalancing ke saham Indonesia
- Mengerti sector rotation khas IHSG (komoditas, banking, consumer)
- Mendeteksi retail euforia dan panic sell
- Memahami linkage commodity (CPO, batubara, nikel) ke saham terkait
- Membaca smart money behavior dari pola volume
- Menganalisis divergence harga vs volume/momentum

IDENTITAS EMITEN:
• Ticker     : ${ticker}
• Nama Resmi : ${namaResmi}${inDB ? ' [VERIFIED IDX]' : ' [TIDAK DI DATABASE — WASPADA]'}
• Sektor     : ${sektorResmi}${subsektor ? ' — ' + subsektor : ''}

${sektorContext}
${bandaContext}

${priceContext}
${technicalContext}

INSTRUKSI PENTING:
1. Semua angka dari indikator teknikal di atas adalah FAKTUAL — JANGAN ubah
2. Sentiment WAJIB sesuai scoring: ${scoring ? scoring.final : 5}/10 → ${recSentiment}
3. Analisis KENAPA saham ini menarik atau tidak SEKARANG — bukan teori umum
4. Bull/Bear thesis harus SPESIFIK dengan angka dan level harga aktual
5. Target, Stop Loss, dan Level Beli harus MASUK AKAL relatif ke harga saat ini
6. Identifikasi tanda bandar/smart money jika ada dari data di atas
7. Jawab HANYA JSON valid — tidak ada teks lain, tidak ada markdown, tidak ada komentar

{
  "namaLengkap": "${namaResmi}",
  "sektor": "${sektorResmi}${subsektor ? ' - ' + subsektor : ''}",
  "whyNow": "2-3 kalimat SPESIFIK kenapa saham ini layak atau tidak diperhatikan SEKARANG berdasarkan data teknikal dan konteks market",
  "summary": "4-5 kalimat: bisnis emiten, kondisi teknikal aktual dengan angka MA/RSI, fase market saat ini, dan konteks sektor",
  "sentiment": "${recSentiment}",
  "bullThesis": ["argumen bull 1 dengan angka spesifik dari data", "argumen bull 2 berbasis volume/bandar", "argumen bull 3 konteks sektor IHSG"],
  "bearThesis": ["risiko bear 1 dengan level harga spesifik", "risiko bear 2 berbasis teknikal", "risiko bear 3 konteks market"],
  "rekomendasi": "3 kalimat: aksi konkret apa, zona entry spesifik berdasarkan support/VWAP, exit plan dengan SL berbasis ATR dan target berbasis resistance",
  "priceEst": "Range harga wajar misal: Rp 9.500 - Rp 10.800",
  "pe": "P/E aktual vs rata-rata industri atau N/A",
  "pbv": "P/BV aktual dengan konteks ROE atau N/A",
  "divYield": "Dividend yield dan track record atau N/A",
  "beta": "angka beta vs IHSG atau N/A",
  "analisisTeknikal": "3 kalimat spesifik: kondisi MA dan tren dengan angka aktual, level support/resistance kritis, momentum RSI/MACD/Stochastic",
  "analisisFundamental": "3 kalimat: kondisi bisnis emiten, margin dan ROE, kekuatan neraca",
  "posisiKompetitif": "2 kalimat: posisi market share dan keunggulan vs kompetitor di sektor",
  "keunggulan": ["keunggulan kompetitif 1 spesifik", "keunggulan 2", "keunggulan 3"],
  "risiko": ["risiko utama 1 dengan level harga", "risiko 2 spesifik", "risiko 3"],
  "katalis": ["katalis jangka pendek 1-3 bulan spesifik", "katalis menengah 6-12 bulan", "risiko katalis negatif"],
  "targetHarga": "Target 3-6 bulan dengan basis resistance/analisis misal: Rp 10.500",
  "stopLoss": "Stop loss dengan basis support/ATR misal: Rp 8.200",
  "levelBeli": "Zona beli ideal dengan basis teknikal misal: Rp 8.800 - Rp 9.200",
  "confidenceLevel": "${scoring ? scoring.confidence : 'Medium'}",
  "smartMoneySignal": "Analisis tanda aktivitas bandar atau smart money berdasarkan pola volume, OBV, acc/dist, dan SMF. Spesifik dengan data atau tulis: Tidak terdeteksi.",
  "bandaAnalysis": "Apakah ada tanda manipulasi atau akumulasi bandar? Volume pattern mencurigakan? Retail trap? Stealth accumulation? Jelaskan singkat dan spesifik.",
  "sektorContext": "Kondisi sektor ini sekarang di IHSG? Ada rotasi masuk atau keluar? Commodity support? Sentimen asing?",
  "scoreFundamental": "angka 1-10 lalu penjelasan singkat misal: 7 - ROE stabil di atas 15%",
  "scoreTeknikal": "${scoring ? scoring.final : 5} - ${scoring ? scoring.label : 'berdasarkan indikator matematis'}"
}`;
}

function getSektorContext(sektor, subsektor) {
  var konteks = {
    'Energi': `KONTEKS SEKTOR ENERGI IHSG:
• Sangat sensitif terhadap harga komoditas global (batubara Newcastle, CPO, minyak Brent)
• ADRO/PTBA/ITMG/HRUM/GEMS sensitif terhadap harga Newcastle Coal Index
• Foreign ownership tinggi di sektor ini — pergerakan asing sangat berpengaruh
• Waspadai windfall tax, kebijakan DMO (Domestic Market Obligation), dan regulasi ekspor
• Korelasi tinggi dengan USDIDR — rupiah melemah biasanya positif untuk eksportir energi`,

    'Perbankan': `KONTEKS SEKTOR PERBANKAN IHSG:
• Dominasi asing sangat tinggi — BBCA, BBRI, BMRI masuk MSCI Indonesia
• MSCI rebalancing berdampak signifikan terhadap pergerakan harga
• Sensitif terhadap BI Rate, NPL ratio, CASA ratio, dan kredit growth
• ROE dan NIM adalah metrik kunci — perbankan Indonesia salah satu paling profitable di Asia
• Pemotongan BI Rate adalah katalis positif langsung`,

    'Teknologi': `KONTEKS SEKTOR TEKNOLOGI IHSG:
• GOTO dan BUKA adalah pemain utama — masih fase burn rate tinggi
• Valuasi berbasis GMV/growth, bukan profitabilitas konvensional
• Sangat sensitif terhadap sentimen global tech (Nasdaq) dan suku bunga AS (Fed Rate)
• Retail sangat dominan — rawan euforia dan panic sell mendadak
• Profitabilitas dan path to profit adalah katalis kunci`,

    'Konsumer': `KONTEKS SEKTOR KONSUMER IHSG:
• Defensif — biasanya outperform saat risk-off dan underperform saat risk-on
• UNVR, ICBP, MYOR, SIDO adalah pemain kuat dengan fundamental solid
• Sensitif terhadap inflasi bahan baku (CPO, gandum) dan daya beli konsumen
• Musiman signifikan: Lebaran, Natal, dan tahun baru mendorong volume penjualan
• Biasanya bukan target bandar — lebih fundamental driven`,

    'Properti': `KONTEKS SEKTOR PROPERTI IHSG:
• Sangat sensitif terhadap suku bunga KPR dan kebijakan BI Rate
• Stimulus pemerintah (PPN 0%, subsidi uang muka) adalah katalis utama
• Developer besar: BSDE, CTRA, SMRA, PWON — likuiditas bervariasi
• Likuiditas rendah di saham properti kecil — rawan manipulasi bandar
• Siklus panjang — biasanya lagging 6-12 bulan dari perubahan suku bunga`,

    'Infrastruktur': `KONTEKS SEKTOR INFRASTRUKTUR IHSG:
• BUMN dominan: JSMR, WIKA, WSKT, PTPP, ADHI
• Sangat sensitif terhadap belanja pemerintah (APBN) dan proyek strategis nasional (PSN)
• Proyek IKN dan proyek infrastruktur pemerintah menjadi katalis utama
• Sering menjadi saham politik — pergerakan tidak selalu berbasis fundamental
• Waspadai utang BUMN yang tinggi dan risiko cash flow`,

    'Barang Baku': `KONTEKS SEKTOR BARANG BAKU IHSG:
• Terkait langsung dengan harga komoditas (nikel, tembaga, aluminium, baja, kimia)
• INCO, ANTM sensitif terhadap harga LME (London Metal Exchange)
• TPIA terkait harga petrokimia dan naphtha global
• Sangat cyclical — ikuti siklus komoditas global dan demand China
• MDKA, BRMS terkait harga emas dan tembaga`,

    'Telekomunikasi': `KONTEKS SEKTOR TELEKOMUNIKASI IHSG:
• TLKM adalah saham terbesar dengan free float besar — sering jadi barometer market
• Dividend yield tinggi menarik investor institusional dan asing
• Kompetisi ketat TLKM vs EXCL vs ISAT menekan ARPU dan margin
• 5G rollout dan konsolidasi industri sebagai katalis jangka menengah
• Regulasi BRTI dan kebijakan frekuensi berpengaruh ke valuasi`,

    'Kesehatan': `KONTEKS SEKTOR KESEHATAN IHSG:
• Defensif dan tumbuh konsisten — cocok saat market volatile
• KLBF, SIDO, MIKA, HEAL adalah pilihan kuat dengan fundamental solid
• Post-COVID normalisasi berdampak ke volume layanan kesehatan
• Regulasi BPJS dan tarif INA-CBG berpengaruh terhadap margin rumah sakit
• Valuasi premium dibanding sektor lain — P/E biasanya lebih tinggi`,
  };

  var key = Object.keys(konteks).find(function(k) {
    return sektor && sektor.toLowerCase().includes(k.toLowerCase());
  });

  return key
    ? konteks[key]
    : `KONTEKS SEKTOR: Analisis sektor ${sektor} dalam konteks IHSG saat ini. Perhatikan sentimen market, rotasi sektor, dan posisi asing.`;
}

function getBandarContext(scoring, metadata) {
  if (!scoring) return '';
  var lines = ['PANDUAN ANALISIS BANDAR & SMART MONEY:'];

  if (scoring.breakdown && scoring.breakdown.volume) {
    var vs = scoring.breakdown.volume.score;
    if (vs >= 7) lines.push(`• Volume score tinggi (${vs}/10): Kemungkinan ada akumulasi institusional atau bandar masuk`);
    else if (vs <= 3) lines.push(`• Volume score rendah (${vs}/10): Retail mendominasi atau bandar sedang distribusi diam-diam`);
  }

  if (scoring.breakdown && scoring.breakdown.trend) {
    var ts = scoring.breakdown.trend.score;
    if (ts >= 8) lines.push(`• Trend score sangat kuat (${ts}/10): Kemungkinan ada penggerak institusional di belakang tren ini`);
  }

  lines.push('• Cek apakah volume spike disertai body candle besar (genuine move) atau doji/spinning top (absorpsi bandar)');
  lines.push('• Perhatikan apakah akumulasi stealth (volume pelan naik saat harga flat) atau agresif (volume meledak tiba-tiba)');
  lines.push('• OBV naik saat harga turun = bullish divergence = smart money akumulasi diam-diam');

  return lines.join('\n');
}

function buildIndexPrompt(ticker, priceContext, technicalContext, scoring) {
  var nama = ticker === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : 'Indeks LQ45';
  var sent = 'NETRAL';
  if (scoring && scoring.recommendation && (scoring.recommendation.includes('BELI') || scoring.recommendation.includes('AKUMULASI'))) {
    sent = 'BULLISH';
  } else if (scoring && scoring.recommendation && (scoring.recommendation.includes('JUAL') || scoring.recommendation.includes('KURANGI'))) {
    sent = 'BEARISH';
  }

  return `Kamu adalah Chief Market Strategist senior dengan pengalaman 20+ tahun di Bursa Efek Indonesia.

KEAHLIAN KHUSUS:
- Membaca makro Indonesia: BI Rate, inflasi, current account, kurs rupiah
- Memahami foreign flow dan dampaknya ke level IHSG
- Mengerti MSCI rebalancing dan efeknya ke saham-saham Indonesia
- Sector rotation IHSG: kapan masuk banking, komoditas, consumer
- Membaca risk-on/risk-off global dan dampak ke emerging market Asia
- Mendeteksi distribusi institusional vs akumulasi di level indeks

INDEKS: ${nama}
${priceContext}
${technicalContext}

INSTRUKSI: Jawab HANYA JSON valid tanpa teks lain, tanpa markdown, tanpa trailing comma.

{
  "namaLengkap": "${nama}",
  "sektor": "Indeks Pasar Modal Indonesia",
  "whyNow": "Kenapa kondisi IHSG SEKARANG penting bagi trader? Apa yang sedang terjadi secara teknikal? 2-3 kalimat spesifik dengan angka level.",
  "summary": "4-5 kalimat: kondisi IHSG aktual, level MA kritis dengan angka, RSI dan momentum saat ini, sentimen makro Indonesia terkini",
  "sentiment": "${sent}",
  "bullThesis": ["faktor positif konkret 1 dengan data/level IHSG", "faktor positif 2 berbasis teknikal", "faktor positif 3 berbasis makro/sektor"],
  "bearThesis": ["risiko konkret 1 dengan level IHSG", "risiko 2 berbasis teknikal", "risiko 3 berbasis makro global"],
  "rekomendasi": "Strategi market 3 kalimat: kondisi saat ini, zona akumulasi/distribusi spesifik dengan level IHSG, sektor yang direkomendasikan",
  "priceEst": "Target IHSG 3-6 bulan misal: 7.200 - 7.800",
  "pe": "Rata-rata P/E pasar IHSG saat ini vs historis atau N/A",
  "pbv": "Rata-rata P/BV pasar IHSG atau N/A",
  "divYield": "Dividend yield rata-rata pasar IHSG atau N/A",
  "beta": "1.00",
  "sektorKuat": ["sektor outperform 1 dengan alasan spesifik", "sektor 2 dengan alasan", "sektor 3 dengan alasan"],
  "sektorLemah": ["sektor underperform 1 dengan alasan", "sektor 2 dengan alasan"],
  "analisisTeknikal": "3 kalimat spesifik: support/resistance IHSG aktual dengan angka, kondisi MA dan golden/death cross, momentum RSI dan MACD",
  "analisisFundamental": "2 kalimat: kondisi makro Indonesia terkini (PDB growth, inflasi, BI Rate, posisi asing di IHSG)",
  "keunggulan": ["katalis positif 1 spesifik dengan angka", "katalis 2", "katalis 3"],
  "risiko": ["risiko makro utama 1 dengan level dampak", "risiko 2 spesifik", "risiko 3"],
  "katalis": ["katalis jangka pendek 1-3 bulan", "katalis menengah 3-6 bulan", "risiko katalis negatif utama"],
  "targetHarga": "Target bull IHSG misal: 8.200",
  "stopLoss": "Level support kritis IHSG yang bila ditembus menjadi sinyal bear misal: 6.500",
  "levelBeli": "Zona akumulasi ideal IHSG misal: 6.800 - 7.000",
  "confidenceLevel": "${scoring ? scoring.confidence : 'Medium'}",
  "smartMoneySignal": "Apakah ada tanda institusional masuk atau keluar dari IHSG? Foreign flow net buy/sell? Divergence OBV? Jelaskan spesifik.",
  "bandaAnalysis": "Analisis posisi institusional dan asing di IHSG saat ini. Rotation atau exit? Akumulasi atau distribusi di level indeks?",
  "sektorContext": "Sektor mana yang sedang mendapat inflow dan sektor mana yang sedang dijual institusi? Kenapa? Rotasi ke mana?",
  "rekomendasiSaham": ["KODE: nama — alasan spesifik berbasis teknikal dan fundamental", "KODE: nama — alasan", "KODE: nama — alasan"],
  "scoreFundamental": "7 - Makro Indonesia relatif stabil meski ada tekanan eksternal",
  "scoreTeknikal": "${scoring ? scoring.final : 5} - ${scoring ? scoring.label : 'berdasarkan indikator matematis'}"
}`;
}

async function callAI(params) {
  var ticker       = params.ticker;
  var metadata     = params.metadata;
  var isIndex      = params.isIndex;
  var priceData    = params.priceData;
  var priceContext = params.priceContext;
  var indicators   = params.indicators;
  var volumeData   = params.volumeData;
  var structure    = params.structure;
  var scoring      = params.scoring;
  var bandarData   = params.bandarData || null;

  var apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak dikonfigurasi di environment variables');

  var technicalContext = buildTechnicalContext(indicators, volumeData, structure, scoring, bandarData);
  var prompt = isIndex
    ? buildIndexPrompt(ticker, priceContext, technicalContext, scoring)
    : buildStockPrompt(ticker, metadata, priceContext, technicalContext, scoring);

  var res = await fetchWithRetry(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  4000,
      temperature: 0.15, // lebih rendah dari sebelumnya — lebih konsisten
      messages: [
        {
          role:    'system',
          content: 'Kamu adalah analis saham IHSG senior yang memahami psikologi bandar, foreign flow, dan sector rotation. Jawab HANYA dengan JSON valid — tidak ada teks lain sebelum atau sesudah JSON, tidak ada markdown backtick, tidak ada komentar, tidak ada trailing comma. Isi SEMUA field yang diminta. JANGAN ubah angka apapun dari data teknikal yang diberikan.'
        },
        { role: 'user', content: prompt }
      ]
    })
  }, 3);

  if (!res.ok) {
    var errBody = await res.json().catch(function() { return {}; });
    throw new Error((errBody.error && errBody.error.message) || ('Groq API error ' + res.status));
  }

  var body = await res.json();
  var raw  = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  if (!raw) throw new Error('Respons AI kosong');

  // Qwen QwQ kadang output thinking tags <think>...</think> — strip dulu
  raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  return raw;
}

module.exports = { callAI };
