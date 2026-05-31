// ══════════════════════════════════════════════════════════════════
// lib/ai.js — AI Reasoning Engine Khusus IHSG (CommonJS)
// Model: openai/gpt-oss-120b via Groq (per Mei 2026)
// ══════════════════════════════════════════════════════════════════

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'openai/gpt-oss-120b';

// ── System prompt — singkat, presisi, tidak redundant ─────────────
const SYSTEM_PROMPT = 'Kamu adalah analis saham IHSG senior. Tugas: analisis data teknikal yang diberikan dan hasilkan JSON valid. ATURAN KERAS: (1) Jangan ubah angka apapun dari data teknikal. (2) Output HANYA JSON — tanpa teks, tanpa markdown, tanpa trailing comma. (3) Isi SEMUA field. (4) Sentiment & scoreTeknikal WAJIB sesuai scoring yang diberikan.';

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

// ── buildTechnicalContext — data faktual, padat, tidak verbose ────
function buildTechnicalContext(indicators, volumeData, structure, scoring, bandarData) {
  const i  = indicators || {};
  const v  = volumeData || {};
  const s  = structure  || {};
  const sc = scoring    || {};
  const bd = bandarData || {};

  const mfi    = i.mfi        || {};
  const div    = i.divergence || {};
  const fib    = i.fibonacci  || {};
  const cs     = i.candlestick || {};
  const rs     = i.relStrength || {};
  const pivots = i.pivots     || {};

  const rsiLabel = i.rsi != null
    ? `${i.rsi}${i.rsi > 70 ? ' ⚠️ OVERBOUGHT' : i.rsi < 30 ? ' ✅ OVERSOLD' : i.rsi > 50 ? ' (positif)' : ' (negatif)'}`
    : 'N/A';

  const maStatus = i.ma
    ? [
        i.ma.aboveMA20 ? '✅ >MA20' : '❌ <MA20',
        i.ma.aboveMA50 ? '✅ >MA50' : '❌ <MA50',
        i.ma.ma20vs50 === 'bullish_alignment' ? 'BULLISH' : 'BEARISH',
        i.ma.type ? i.ma.type.replace(/_/g,' ').toUpperCase() : ''
      ].filter(Boolean).join(' | ')
    : 'N/A';

  const setups = s.setups && s.setups.length
    ? s.setups.map(st => `  • ${st.type.toUpperCase()} (${st.direction}, ${st.confidence}): ${st.reason}`).join('\n')
    : '  • Tidak ada setup clear';

  return `
═══ DATA TEKNIKAL FAKTUAL (JANGAN DIUBAH) ═══

MOMENTUM: RSI=${rsiLabel} | Stoch=%K${i.stoch ? i.stoch.k : 'N/A'}/%D${i.stoch ? i.stoch.d : 'N/A'} (${i.stoch ? i.stoch.signal : 'N/A'}) | MACD=${i.macd ? i.macd.trend.toUpperCase() : 'N/A'} hist=${i.macd ? i.macd.histogram : 'N/A'} (${i.macd ? i.macd.crossover || 'none' : 'N/A'}) | MFI=${mfi.mfi != null ? mfi.mfi + ' (' + (mfi.signal || '') + ')' : 'N/A'}

TREND: ${maStatus} | MA20=${i.ma && i.ma.ma20 ? i.ma.ma20.toLocaleString('id-ID') : 'N/A'} MA50=${i.ma && i.ma.ma50 ? i.ma.ma50.toLocaleString('id-ID') : 'N/A'} | ADX=${i.trend ? i.trend.adx : 'N/A'} (${i.trend ? i.trend.strength : 'N/A'}) | HH/HL=${s.hhll ? s.hhll.pattern.toUpperCase() : 'N/A'}

VOLATILITAS: BB Upper=${i.bb && i.bb.upper ? i.bb.upper.toLocaleString('id-ID') : 'N/A'} Mid=${i.bb && i.bb.middle ? i.bb.middle.toLocaleString('id-ID') : 'N/A'} Lower=${i.bb && i.bb.lower ? i.bb.lower.toLocaleString('id-ID') : 'N/A'} | BW=${i.bb ? i.bb.bandwidth : 'N/A'}% pos=${i.bb ? i.bb.position.replace(/_/g,' ') : 'N/A'} | ATR=${i.atr && i.atr.atr ? i.atr.atr.toLocaleString('id-ID') : 'N/A'} (${i.atr ? i.atr.atrPct : 'N/A'}%)

S/R: Support=${i.levels && i.levels.support ? i.levels.support.map(l => l.toLocaleString('id-ID')).join('/') : 'N/A'} | Resist=${i.levels && i.levels.resistance ? i.levels.resistance.map(l => l.toLocaleString('id-ID')).join('/') : 'N/A'} | Pivot=${i.levels && i.levels.pivot ? i.levels.pivot.toLocaleString('id-ID') : 'N/A'}

VOLUME: Bias=${v.accDist ? v.accDist.bias.toUpperCase() : 'N/A'} (acc=${v.accDist ? v.accDist.accDays : 0}h dist=${v.accDist ? v.accDist.distDays : 0}h/10h) | Spike=${v.spike && v.spike.isSpike ? '⚡' + v.spike.ratio + 'x (' + v.spike.intensity + ')' : 'tidak ada'} | OBV=${v.obv ? v.obv.trend.toUpperCase() : 'N/A'} | VWAP=${v.vwap ? v.vwap.toLocaleString('id-ID') : 'N/A'} | SMF=${v.smartMoneyFlow ? v.smartMoneyFlow.ratio + '% (' + v.smartMoneyFlow.bias + ')' : 'N/A'} | ${v.narrative || ''}

STRUKTUR: Fase=${s.phase ? s.phase.toUpperCase() : 'N/A'} | Tren=${s.trend ? s.trend.direction.toUpperCase() : 'N/A'} conf=${s.trend ? s.trend.confidence : 'N/A'}% | Breakout=${s.breakout && s.breakout.isBreakout ? s.breakout.type.toUpperCase() + ' @' + (s.breakout.level ? s.breakout.level.toLocaleString('id-ID') : 'N/A') + (s.breakout.confirmed ? ' ✅' : ' ⚠️fake?') : 'tidak ada'}

SETUP:
${setups}

SCORING (TIDAK BOLEH DIUBAH):
• Score=${sc.final || 'N/A'}/10 → ${sc.recommendation || 'N/A'} (${sc.confidence || 'N/A'}) | R/R=${sc.riskReward || 'N/A'}
• Trend=${sc.breakdown && sc.breakdown.trend ? sc.breakdown.trend.score : 'N/A'} Vol=${sc.breakdown && sc.breakdown.volume ? sc.breakdown.volume.score : 'N/A'} Mom=${sc.breakdown && sc.breakdown.momentum ? sc.breakdown.momentum.score : 'N/A'} Risk=${sc.breakdown && sc.breakdown.risk ? sc.breakdown.risk.score : 'N/A'} Setup=${sc.breakdown && sc.breakdown.setup ? sc.breakdown.setup.score : 'N/A'}

BANDAR:
• SmartMoney=${bd.smartMoney ? bd.smartMoney.label + ' (score=' + bd.smartMoney.score + '/10)' : 'N/A'} | Tipe=${bd.stockType ? bd.stockType.label : 'N/A'} vol=${bd.stockType ? bd.stockType.avgDailyVol + '%/hari' : 'N/A'}
• StealthAcc=${bd.stealth && bd.stealth.detected ? '✅ ' + bd.stealth.description : 'tidak'} | DistTrap=${bd.distTrap && bd.distTrap.detected ? '⚠️ ' + bd.distTrap.description : 'tidak'} | Panic=${bd.panic && bd.panic.detected ? '📉 ' + bd.panic.description : 'tidak'}
• Signals=${bd.smartMoney && bd.smartMoney.signals && bd.smartMoney.signals.length ? bd.smartMoney.signals.slice(0, 2).join(' | ') : 'tidak ada'}

PRO: Divergence=${div.detected ? div.summary : 'tidak ada'} | Fib=${fib.narrative || 'N/A'}${fib.atKeyLevel ? ' ⚠️KUNCI' : ''} | CS=${cs.topPattern ? cs.topPattern.name + '(' + cs.topPattern.type + ')' : 'N/A'} | RS=${rs.label || 'N/A'} | Pivot=${pivots.narrative || 'N/A'}
`;
}

// ── getSektorContext — ringkas, padat ─────────────────────────────
function getSektorContext(sektor) {
  const konteks = {
    'Energi':              'KONTEKS: Sensitif harga batubara/CPO/minyak. Foreign ownership tinggi, korelasi USDIDR kuat. Waspadai DMO/windfall tax.',
    'Keuangan':            'KONTEKS: Dominasi asing (BBCA/BBRI/BMRI masuk MSCI). Sensitif BI Rate, NPL, NIM. Pemotongan BI Rate = katalis positif.',
    'Teknologi':           'KONTEKS: GOTO/BUKA masih burn rate tinggi. Valuasi GMV-based, sensitif Nasdaq & Fed Rate. Retail dominan, rawan panic sell.',
    'Konsumer Primer':     'KONTEKS: Defensif, outperform risk-off. Produk kebutuhan pokok, demand stabil. Sensitif inflasi & daya beli masyarakat.',
    'Konsumer Non-Primer': 'KONTEKS: Siklikal, sensitif daya beli dan kepercayaan konsumen. Musiman Lebaran/Natal signifikan. Margin tertekan inflasi.',
    'Properti':            'KONTEKS: Sensitif KPR/BI Rate, siklus panjang. Stimulus PPN 0% = katalis. Likuiditas kecil rawan manipulasi.',
    'Infrastruktur':       'KONTEKS: BUMN sensitif APBN/PSN. IKN = katalis jangka menengah. Utang tinggi, cash flow berisiko, saham politik.',
    'Barang Baku':         'KONTEKS: Terkait LME (nikel, tembaga, emas, batubara). TPIA sensitif naphtha. Cyclical, demand China driven.',
    'Kesehatan':           'KONTEKS: Defensif, valuasi premium. BPJS/INA-CBG pengaruhi margin RS. Post-COVID normalisasi volume layanan.',
    'Industri':            'KONTEKS: Siklikal, terkait kapasitas manufaktur dan permintaan domestik. Sensitif harga bahan baku dan kebijakan impor.',
    'Perindustrian':       'KONTEKS: Siklikal, mencakup otomotif, elektronik, manufaktur. Sensitif kurs USD, harga bahan baku, dan permintaan ekspor.',
    'Agrikultur':          'KONTEKS: Terkait harga CPO dan cuaca. Regulasi ekspor/DMO berpengaruh. Musiman panen signifikan.',
  };

  // Match exact dulu, lalu partial
  if (sektor && konteks[sektor]) return konteks[sektor];
  const key = Object.keys(konteks).find(k =>
    sektor && sektor.toLowerCase().includes(k.toLowerCase())
  );
  return key ? konteks[key] : `KONTEKS: Analisis ${sektor} dalam konteks IHSG. Perhatikan rotasi sektor, posisi asing, dan sentimen market.`;
}

// ── getBandarContext — hanya jika ada sinyal bermakna ─────────────
function getBandarContext(scoring) {
  if (!scoring || !scoring.breakdown) return '';
  const vs = scoring.breakdown.volume ? scoring.breakdown.volume.score : 5;
  const ts = scoring.breakdown.trend  ? scoring.breakdown.trend.score  : 5;

  const hints = [];
  if (vs >= 7) hints.push(`Volume score tinggi (${vs}/10) → kemungkinan institusional masuk`);
  if (vs <= 3) hints.push(`Volume score rendah (${vs}/10) → distribusi atau retail dominan`);
  if (ts >= 8) hints.push(`Trend score kuat (${ts}/10) → ada penggerak institusional di balik tren`);
  hints.push('Volume spike + body besar = genuine. Doji = absorpsi bandar. OBV naik saat harga turun = akumulasi stealth.');

  return 'BANDAR HINTS:\n' + hints.map(h => '• ' + h).join('\n');
}

// ── JSON Schema — field yang perlu diisi AI ───────────────────────
const STOCK_SCHEMA = `{
  "namaLengkap": "...",
  "sektor": "...",
  "whyNow": "2-3 kalimat SPESIFIK kenapa saham ini layak/tidak SEKARANG dengan angka aktual",
  "summary": "4-5 kalimat: bisnis, kondisi teknikal dengan angka MA/RSI, fase market, konteks sektor",
  "sentiment": "BELI|TAHAN|JUAL",
  "bullThesis": ["argumen bull 1 dengan angka", "argumen bull 2 berbasis volume/bandar", "argumen bull 3 konteks sektor"],
  "bearThesis": ["risiko 1 dengan level harga", "risiko 2 teknikal", "risiko 3 market"],
  "rekomendasi": "3 kalimat: aksi konkret, zona entry berbasis support/VWAP, SL berbasis ATR dan target berbasis resistance",
  "priceEst": "Range harga wajar misal: Rp 9.500 - Rp 10.800",
  "pe": "P/E vs industri atau N/A",
  "pbv": "P/BV dengan konteks ROE atau N/A",
  "divYield": "Dividend yield atau N/A",
  "beta": "angka beta atau N/A",
  "analisisTeknikal": "3 kalimat: MA/tren dengan angka, support/resistance kritis, RSI/MACD/Stochastic",
  "analisisFundamental": "3 kalimat: kondisi bisnis, margin/ROE, kekuatan neraca",
  "posisiKompetitif": "2 kalimat: market share dan keunggulan vs kompetitor",
  "keunggulan": ["keunggulan 1 spesifik", "keunggulan 2", "keunggulan 3"],
  "risiko": ["risiko 1 dengan level harga", "risiko 2", "risiko 3"],
  "katalis": ["katalis jangka pendek 1-3 bulan", "katalis menengah 6-12 bulan", "risiko katalis negatif"],
  "targetHarga": "Target 3-6 bulan misal: Rp 10.500",
  "stopLoss": "SL berbasis ATR/support misal: Rp 8.200",
  "levelBeli": "Zona beli misal: Rp 8.800 - Rp 9.200",
  "confidenceLevel": "High|Medium|Low",
  "bandarSmartMoney": "Analisis terpadu: tanda aktivitas bandar/smart money dari pola volume, OBV, acc/dist, SMF, stealth accumulation, atau distribution trap. Spesifik dengan data atau: Tidak terdeteksi.",
  "sektorContext": "Kondisi sektor di IHSG: rotasi, commodity support, sentimen asing",
  "scoreFundamental": "angka 1-10 - penjelasan singkat misal: 7 - ROE stabil di atas 15%",
  "scoreTeknikal": "WAJIB SAMA DENGAN SCORING: [score]/10 - [label]"
}`;

const INDEX_SCHEMA = `{
  "namaLengkap": "...",
  "sektor": "Indeks Pasar Modal Indonesia",
  "whyNow": "2-3 kalimat: kondisi IHSG SEKARANG dengan angka level kritis",
  "summary": "4-5 kalimat: kondisi IHSG, MA kritis, RSI/momentum, makro Indonesia terkini",
  "sentiment": "BULLISH|NETRAL|BEARISH",
  "bullThesis": ["faktor positif 1 dengan data/level", "faktor positif 2 teknikal", "faktor positif 3 makro"],
  "bearThesis": ["risiko 1 dengan level IHSG", "risiko 2 teknikal", "risiko 3 makro global"],
  "rekomendasi": "3 kalimat: kondisi saat ini, zona akumulasi/distribusi dengan level IHSG, sektor rekomendasi",
  "priceEst": "Target IHSG 3-6 bulan misal: 7.200 - 7.800",
  "pe": "P/E rata-rata pasar vs historis atau N/A",
  "pbv": "P/BV rata-rata pasar atau N/A",
  "divYield": "Dividend yield rata-rata pasar atau N/A",
  "beta": "1.00",
  "sektorKuat": ["sektor outperform 1 + alasan", "sektor 2 + alasan", "sektor 3 + alasan"],
  "sektorLemah": ["sektor underperform 1 + alasan", "sektor 2 + alasan"],
  "analisisTeknikal": "3 kalimat: support/resistance IHSG dengan angka, MA/golden/death cross, RSI/MACD",
  "analisisFundamental": "2 kalimat: makro Indonesia (PDB, inflasi, BI Rate, posisi asing)",
  "keunggulan": ["katalis positif 1 dengan angka", "katalis 2", "katalis 3"],
  "risiko": ["risiko makro 1 dengan level dampak", "risiko 2", "risiko 3"],
  "katalis": ["katalis jangka pendek 1-3 bulan", "katalis menengah 3-6 bulan", "risiko katalis negatif"],
  "targetHarga": "Target bull IHSG misal: 8.200",
  "stopLoss": "Level kritis IHSG bila ditembus = sinyal bear misal: 6.500",
  "levelBeli": "Zona akumulasi ideal misal: 6.800 - 7.000",
  "confidenceLevel": "High|Medium|Low",
  "bandarSmartMoney": "Posisi institusional/asing di IHSG: foreign flow net buy/sell, divergence OBV, akumulasi atau distribusi di level indeks",
  "sektorContext": "Sektor yang mendapat inflow vs outflow institusi sekarang dan alasannya",
  "rekomendasiSaham": ["KODE: nama - alasan teknikal+fundamental", "KODE: nama - alasan", "KODE: nama - alasan"],
  "scoreFundamental": "7 - Makro Indonesia relatif stabil",
  "scoreTeknikal": "WAJIB SAMA DENGAN SCORING: [score]/10 - [label]"
}`;

// ── Few-shot example — panduan output ideal ───────────────────────
const FEW_SHOT_EXAMPLE = `
CONTOH OUTPUT YANG BENAR (untuk saham dengan score 7/10):
{
  "whyNow": "BBCA saat ini berada di atas MA20 (9.850) dan MA50 (9.600) dengan RSI 58 di zona momentum positif. Volume akumulasi 7 dari 10 hari terakhir menunjukkan smart money masih menahan posisi. Breakout dari resistance 10.000 belum terkonfirmasi namun momentum mendukung.",
  "sentiment": "BELI",
  "scoreTeknikal": "7 - AKUMULASI (Medium Confidence)",
  "targetHarga": "Rp 10.500",
  "stopLoss": "Rp 9.400",
  "levelBeli": "Rp 9.700 - Rp 9.900"
}
PERHATIKAN: scoreTeknikal WAJIB sesuai data scoring. Angka MA, RSI, target, SL harus masuk akal dan konsisten satu sama lain.
`;

// ── buildStockPrompt ──────────────────────────────────────────────
function buildStockPrompt(ticker, metadata, priceContext, technicalContext, scoring) {
  const namaResmi   = metadata && metadata.name ? 'PT ' + metadata.name : ticker;
  const sektorResmi = metadata && metadata.sector ? metadata.sector : 'tidak diketahui';
  const subsektor   = metadata && metadata.subsector ? metadata.subsector : '';
  const inDB        = !!metadata;

  let recSentiment = 'TAHAN';
  if (scoring && (scoring.recommendation === 'BELI' || scoring.recommendation === 'AKUMULASI')) recSentiment = 'BELI';
  else if (scoring && (scoring.recommendation === 'JUAL' || scoring.recommendation === 'KURANGI')) recSentiment = 'JUAL';

  const sektorContext = getSektorContext(sektorResmi);
  const bandarContext = getBandarContext(scoring);

  return `Analisis saham berikut dan hasilkan JSON sesuai schema.

EMITEN: ${ticker} — ${namaResmi}${inDB ? ' [VERIFIED IDX]' : ' [TIDAK DI DATABASE]'} | Sektor: ${sektorResmi}${subsektor ? ' - ' + subsektor : ''}
${sektorContext}
${bandarContext}

${priceContext}
${technicalContext}

ATURAN OUTPUT:
• sentiment WAJIB: "${recSentiment}" (sesuai scoring ${scoring ? scoring.final : 5}/10)
• scoreTeknikal WAJIB: "${scoring ? scoring.final : 5} - ${scoring ? scoring.label : 'N/A'}"
• Semua angka teknikal di atas adalah faktual — jangan ubah
• Target/SL/levelBeli harus masuk akal relatif ke harga saat ini
${FEW_SHOT_EXAMPLE}
Output JSON (schema):
${STOCK_SCHEMA}`;
}

// ── buildIndexPrompt ──────────────────────────────────────────────
function buildIndexPrompt(ticker, priceContext, technicalContext, scoring) {
  const nama = ticker === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : 'Indeks LQ45';
  let sent = 'NETRAL';
  if (scoring && scoring.recommendation && (scoring.recommendation.includes('BELI') || scoring.recommendation.includes('AKUMULASI'))) sent = 'BULLISH';
  else if (scoring && scoring.recommendation && (scoring.recommendation.includes('JUAL') || scoring.recommendation.includes('KURANGI'))) sent = 'BEARISH';

  return `Analisis indeks berikut dan hasilkan JSON sesuai schema.

INDEKS: ${nama}
${priceContext}
${technicalContext}

ATURAN OUTPUT:
• sentiment WAJIB: "${sent}"
• scoreTeknikal WAJIB: "${scoring ? scoring.final : 5} - ${scoring ? scoring.label : 'N/A'}"
• Semua angka teknikal adalah faktual — jangan ubah

Output JSON (schema):
${INDEX_SCHEMA}`;
}

// ── sanitizeAIOutput ──────────────────────────────────────────────
function sanitizeAIOutput(parsed, priceData, indicators) {
  if (!parsed || !priceData || !priceData.current) return parsed;
  const current = priceData.current;

  // Hitung buffer berbasis ATR jika tersedia, fallback ke pct volatilitas historis
  const atrPct  = indicators && indicators.atr && indicators.atr.atrPct ? indicators.atr.atrPct / 100 : null;
  const atrAbs  = indicators && indicators.atr && indicators.atr.atr    ? indicators.atr.atr           : null;

  // Buffer dinamis: pakai ATR jika ada, fallback 3% untuk target / 5% untuk SL
  const targetBuffer = atrAbs ? Math.round(atrAbs * 4) : Math.round(current * 0.12);
  const slBuffer     = atrAbs ? Math.round(atrAbs * 2) : Math.round(current * 0.06);
  const entryBuffer  = atrAbs ? Math.round(atrAbs * 0.5) : Math.round(current * 0.02);

  function extractPrice(str) {
    if (!str || typeof str !== 'string') return null;
    // Handle range "Rp 1.000 - Rp 1.200" — ambil angka pertama
    const cleaned = str.replace(/\./g, '').replace(/,/g, '').replace(/[Rp\s]/g, '');
    const num = parseInt(cleaned.match(/\d+/), 10);
    return isNaN(num) ? null : num;
  }

  const target = extractPrice(parsed.targetHarga);
  const sl     = extractPrice(parsed.stopLoss);
  const entry  = extractPrice(parsed.levelBeli);

  // Target: harus di atas current, tidak lebih dari 2x current
  if (target !== null && (target <= current || target > current * 2)) {
    const est = current + targetBuffer;
    parsed.targetHarga = 'Rp ' + est.toLocaleString('id-ID') + ' (estimasi ATR)';
  }

  // SL: harus di bawah current, tidak lebih dari 25% di bawah
  if (sl !== null && (sl >= current || sl < current * 0.75)) {
    const est = current - slBuffer;
    parsed.stopLoss = 'Rp ' + est.toLocaleString('id-ID') + ' (estimasi ATR)';
  }

  // Entry: tidak boleh lebih dari 3% di atas current
  if (entry !== null && entry > current * 1.03) {
    const lo = current - entryBuffer;
    const hi = current + entryBuffer;
    parsed.levelBeli = 'Rp ' + lo.toLocaleString('id-ID') + ' - Rp ' + hi.toLocaleString('id-ID') + ' (estimasi ATR)';
  }

  // Migrasi field lama
  if (!parsed.bandarSmartMoney && (parsed.smartMoneySignal || parsed.bandaAnalysis)) {
    parsed.bandarSmartMoney = [parsed.smartMoneySignal, parsed.bandaAnalysis].filter(Boolean).join(' | ');
    delete parsed.smartMoneySignal;
    delete parsed.bandaAnalysis;
  }

  return parsed;
}

// ── callAI ────────────────────────────────────────────────────────
async function callAI(params) {
  const ticker       = params.ticker;
  const metadata     = params.metadata;
  const isIndex      = params.isIndex;
  const priceData    = params.priceData;
  const priceContext = params.priceContext;
  const indicators   = params.indicators;
  const volumeData   = params.volumeData;
  const structure    = params.structure;
  const scoring      = params.scoring;
  const bandarData   = params.bandarData || null;
  const newsData     = params.newsData   || null;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak dikonfigurasi di environment variables');

  const technicalContext = buildTechnicalContext(indicators, volumeData, structure, scoring, bandarData);

  // Potong berita jika terlalu panjang — max 5 item per kategori
  let newsContext = '\nBERITA TERKINI: Tidak tersedia.';
  if (newsData && newsData.summary) {
    const lines = newsData.summary.split('\n').slice(0, 20); // max 20 baris berita
    newsContext = '\n' + lines.join('\n');
  }

  const prompt = isIndex
    ? buildIndexPrompt(ticker, priceContext, technicalContext + newsContext, scoring)
    : buildStockPrompt(ticker, metadata, priceContext, technicalContext + newsContext, scoring);

  const res = await fetchWithRetry(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  4000,
      temperature: 0.15,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt }
      ]
    })
  }, 3);

  if (!res.ok) {
    const errBody = await res.json().catch(function() { return {}; });
    throw new Error((errBody.error && errBody.error.message) || ('Groq API error ' + res.status));
  }

  const body = await res.json();
  let raw = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  if (!raw) throw new Error('Respons AI kosong');

  // Strip thinking/reasoning tags dari berbagai model (Groq, DeepSeek, QwQ, dll)
  raw = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')   // standard <think>
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // <thinking>
    .replace(/^[\s\S]*?(?=\{)/m, '')              // hapus teks sebelum JSON pertama
    .trim();

  return raw;
}

module.exports = { callAI, sanitizeAIOutput };
