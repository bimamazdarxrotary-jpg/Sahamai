// ══════════════════════════════════════════════════════════════════
// lib/ai.js — AI Reasoning Engine Khusus IHSG (CommonJS)
// Memahami: bandar, gorengan, foreign flow, sector rotation,
// smart money, MSCI effect, commodity linkage
// ══════════════════════════════════════════════════════════════════

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

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
    ? `${i.rsi}${i.rsi > 70 ? ' OVERBOUGHT' : i.rsi < 30 ? ' OVERSOLD' : ''}`
    : 'N/A';

  const maStatus = i.ma
    ? [
        i.ma.aboveMA20 ? 'di atas MA20' : 'di bawah MA20',
        i.ma.aboveMA50 ? 'di atas MA50' : 'di bawah MA50',
        i.ma.ma20vs50 === 'bullish_alignment' ? '(MA20 > MA50 BULLISH)' : '(MA20 < MA50 BEARISH)',
        i.ma.type ? '| ' + i.ma.type.replace(/_/g,' ').toUpperCase() : ''
      ].filter(Boolean).join(' ')
    : 'N/A';

  const setups = s.setups && s.setups.length
    ? s.setups.map(st =>
        '- ' + st.type.toUpperCase() + ' (' + st.direction + ', ' + st.confidence + '): ' + st.reason
      ).join('\n')
    : '- Tidak ada setup clear';

  return `
INDIKATOR TEKNIKAL (DIHITUNG MATEMATIS - JANGAN UBAH ANGKA INI):
- RSI(14)      : ${rsiLabel}
- MACD         : ${i.macd ? i.macd.trend : 'N/A'} | Histogram: ${i.macd ? i.macd.histogram : 'N/A'} | Crossover: ${i.macd && i.macd.crossover ? i.macd.crossover : 'none'}
- MA Status    : ${maStatus}
- MA20         : ${i.ma && i.ma.ma20 ? i.ma.ma20.toLocaleString('id-ID') : 'N/A'}
- MA50         : ${i.ma && i.ma.ma50 ? i.ma.ma50.toLocaleString('id-ID') : 'N/A'}
- Bollinger    : Upper ${i.bb && i.bb.upper ? i.bb.upper.toLocaleString('id-ID') : 'N/A'} | Mid ${i.bb && i.bb.middle ? i.bb.middle.toLocaleString('id-ID') : 'N/A'} | Lower ${i.bb && i.bb.lower ? i.bb.lower.toLocaleString('id-ID') : 'N/A'} | ${i.bb ? i.bb.position : 'N/A'} (${i.bb ? i.bb.bandPct : 'N/A'}%)
- Stochastic   : K=${i.stoch ? i.stoch.k : 'N/A'} D=${i.stoch ? i.stoch.d : 'N/A'} -> ${i.stoch ? i.stoch.signal : 'N/A'}
- ATR(14)      : ${i.atr && i.atr.atr ? i.atr.atr.toLocaleString('id-ID') : 'N/A'} (${i.atr ? i.atr.atrPct : 'N/A'}%)
- ADX Trend    : ${i.trend ? i.trend.adx : 'N/A'} | ${i.trend ? i.trend.trend : 'N/A'} | ${i.trend ? i.trend.strength : 'N/A'}

VOLUME INTELLIGENCE:
- Pattern      : ${v.accDist ? v.accDist.bias : 'N/A'} (Acc: ${v.accDist ? v.accDist.accDays : 0}h, Dist: ${v.accDist ? v.accDist.distDays : 0}h)
- Volume Spike : ${v.spike && v.spike.isSpike ? 'YA - ' + v.spike.ratio + 'x (' + v.spike.intensity + ')' : 'Tidak'}
- OBV Trend    : ${v.obv ? v.obv.trend : 'N/A'}
- VWAP         : ${v.vwap ? v.vwap.toLocaleString('id-ID') : 'N/A'}
- Narasi       : ${v.narrative || 'N/A'}

MARKET STRUCTURE:
- Fase Market  : ${s.phase || 'N/A'} - ${s.phaseLabel || ''}
- Tren         : ${s.trend ? s.trend.direction : 'N/A'} | Confidence: ${s.trend ? s.trend.confidence : 'N/A'}%
- HH/HL        : ${s.hhll ? s.hhll.pattern : 'N/A'}
- Breakout     : ${s.breakout && s.breakout.isBreakout ? s.breakout.type + ' di ' + (s.breakout.level ? s.breakout.level.toLocaleString('id-ID') : 'N/A') + ' (' + (s.breakout.confirmed ? 'CONFIRMED' : 'UNCONFIRMED') + ')' : s.breakout ? s.breakout.type : 'Tidak ada'}
- Support      : ${i.levels && i.levels.support && i.levels.support.length ? i.levels.support.map(function(l){return l.toLocaleString('id-ID');}).join(', ') : 'N/A'}
- Resistance   : ${i.levels && i.levels.resistance && i.levels.resistance.length ? i.levels.resistance.map(function(l){return l.toLocaleString('id-ID');}).join(', ') : 'N/A'}

SETUP TERDETEKSI:
${setups}

SCORING DETERMINISTIK:
- Final        : ${sc.final || 'N/A'}/10 -> ${sc.recommendation || 'N/A'} (${sc.confidence || 'N/A'})
- Breakdown    : Trend=${sc.breakdown && sc.breakdown.trend ? sc.breakdown.trend.score : 'N/A'} / Volume=${sc.breakdown && sc.breakdown.volume ? sc.breakdown.volume.score : 'N/A'} / Momentum=${sc.breakdown && sc.breakdown.momentum ? sc.breakdown.momentum.score : 'N/A'} / Risk=${sc.breakdown && sc.breakdown.risk ? sc.breakdown.risk.score : 'N/A'}

BANDAR & SMART MONEY (MATEMATIS — JANGAN UBAH):
- Smart Money  : ${bd.smartMoney ? bd.smartMoney.label : 'Tidak dianalisis'} (score: ${bd.smartMoney ? bd.smartMoney.score : 'N/A'})
- Tipe Saham   : ${bd.stockType ? bd.stockType.label : 'N/A'}
- Volatilitas  : ${bd.stockType ? bd.stockType.avgDailyVol + '%/hari' : 'N/A'}
- Stealth Acc  : ${bd.stealth && bd.stealth.detected ? 'TERDETEKSI' : 'Tidak terdeteksi'}
- Dist Trap    : ${bd.distTrap && bd.distTrap.detected ? 'TERDETEKSI' : 'Tidak terdeteksi'}
- Retail Panic : ${bd.panic && bd.panic.detected ? 'TERDETEKSI' : 'Tidak terdeteksi'}
- SMF Signals  : ${bd.smartMoney && bd.smartMoney.signals && bd.smartMoney.signals.length ? bd.smartMoney.signals.slice(0,2).join(' | ') : 'Tidak ada'}
- Narasi Bandar: ${bd.narrative || 'Tidak ada data'}
`;
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

KEAHLIAN KHUSUS KAMU:
- Memahami psikologi dan pola pergerakan bandar IHSG
- Mendeteksi saham gorengan vs saham fundamental kuat
- Membaca foreign flow dan dampaknya ke harga
- Memahami efek MSCI rebalancing ke saham Indonesia
- Mengerti sector rotation khas IHSG (komoditas, banking, consumer)
- Mendeteksi retail euforia dan panic sell
- Memahami linkage commodity (CPO, batubara, nikel) ke saham terkait
- Membaca smart money behavior dari pola volume

IDENTITAS EMITEN:
- Ticker     : ${ticker}
- Nama Resmi : ${namaResmi}${inDB ? ' [VERIFIED IDX]' : ' [TIDAK DI DATABASE - WASPADA]'}
- Sektor     : ${sektorResmi}${subsektor ? ' - ' + subsektor : ''}

${sektorContext}
${bandaContext}

${priceContext}
${technicalContext}

INSTRUKSI WAJIB:
1. Semua angka di atas adalah FAKTUAL dari sistem - JANGAN ubah satu pun angka
2. Sentiment HARUS sesuai score deterministik: ${scoring ? scoring.final : 5}/10 -> ${recSentiment}
3. Jawab KENAPA saham ini menarik atau tidak SEKARANG - bukan penjelasan umum
4. Bull/Bear thesis harus SPESIFIK berbasis data teknikal dan konteks IHSG di atas
5. Identifikasi apakah ada tanda aktivitas bandar atau smart money
6. Pertimbangkan konteks sektor dan commodity yang relevan
7. Jawab HANYA JSON valid - tidak ada teks lain, tidak ada markdown, tidak ada trailing comma

{
  "namaLengkap": "${namaResmi}",
  "sektor": "${sektorResmi}${subsektor ? ' - ' + subsektor : ''}",
  "whyNow": "2-3 kalimat SPESIFIK kenapa saham ini layak atau tidak diperhatikan SEKARANG berdasarkan data teknikal dan konteks market",
  "summary": "4-5 kalimat: bisnis emiten, kondisi teknikal aktual, fase market, dan konteks sektor",
  "sentiment": "${recSentiment}",
  "bullThesis": ["argumen bull spesifik berbasis data 1", "argumen bull 2 dengan angka", "argumen bull 3 konteks IHSG"],
  "bearThesis": ["risiko bear spesifik 1", "risiko bear 2 dengan level harga", "risiko bear 3 konteks market"],
  "rekomendasi": "3 kalimat: aksi konkret, zona entry dengan harga spesifik, exit plan dengan SL dan target berdasarkan ATR/SR",
  "priceEst": "Range harga wajar misal: Rp 9.500 - Rp 10.800",
  "pe": "P/E aktual vs rata-rata industri atau N/A jika tidak diketahui",
  "pbv": "P/BV aktual dengan konteks ROE atau N/A",
  "divYield": "Dividend yield dan track record atau N/A",
  "beta": "angka beta vs IHSG atau N/A",
  "analisisTeknikal": "3 kalimat spesifik: kondisi MA dan tren, level support/resistance dengan angka aktual, momentum RSI/MACD",
  "analisisFundamental": "3 kalimat: kondisi revenue/laba terkini, margin dan ROE, kekuatan neraca",
  "posisiKompetitif": "2 kalimat: posisi market share dan keunggulan vs kompetitor di sektor",
  "keunggulan": ["keunggulan kompetitif 1", "keunggulan 2", "keunggulan 3"],
  "risiko": ["risiko utama 1 spesifik", "risiko 2", "risiko 3"],
  "katalis": ["katalis jangka pendek 1-3 bulan spesifik", "katalis menengah 6-12 bulan", "risiko katalis negatif"],
  "targetHarga": "Target 3-6 bulan dengan basis analisis misal: Rp 10.500",
  "stopLoss": "Stop loss dengan basis SR atau ATR misal: Rp 8.200",
  "levelBeli": "Zona beli ideal dengan basis teknikal misal: Rp 8.800 - Rp 9.200",
  "confidenceLevel": "${scoring ? scoring.confidence : 'Medium'}",
  "smartMoneySignal": "Analisis tanda aktivitas bandar atau smart money berdasarkan pola volume, price action, dan acc/dist. Spesifik atau tulis: Tidak terdeteksi.",
  "bandaAnalysis": "Apakah ada tanda manipulasi atau akumulasi bandar? Volume pattern mencurigakan? Retail trap? Jelaskan singkat.",
  "sektorContext": "Bagaimana kondisi sektor ini sekarang? Ada rotasi masuk atau keluar? Commodity support?",
  "scoreFundamental": "angka 1-10 lalu penjelasan singkat misal: 7 - ROE stabil di atas 15%",
  "scoreTeknikal": "${scoring ? scoring.final : 5} - ${scoring ? scoring.label : 'berdasarkan indikator matematis'}"
}`;
}

function getSektorContext(sektor, subsektor) {
  var konteks = {
    'Energi': 'KONTEKS SEKTOR ENERGI IHSG: Sangat sensitif terhadap harga komoditas global (batubara, CPO, minyak). Perhatikan harga Newcastle Coal Index untuk ADRO/PTBA/ITMG, Brent Crude untuk MEDC/ELSA. Foreign ownership tinggi di sektor ini. Waspadai windfall tax dan kebijakan DMO.',
    'Perbankan': 'KONTEKS SEKTOR PERBANKAN IHSG: Dominasi asing sangat tinggi (BBCA, BBRI, BMRI termasuk dalam MSCI). Sensitif terhadap BI Rate, NPL, dan kredit growth. MSCI rebalancing berdampak signifikan. ROE dan NIM adalah metrik kunci. Banking Indonesia salah satu yang paling profitable di Asia.',
    'Teknologi': 'KONTEKS SEKTOR TEKNOLOGI IHSG: Sektor masih berkembang di IHSG. GOTO dan BUKA adalah pemain utama. Masih burn rate tinggi, valuasi berbasis growth. Sentimen global tech sangat berpengaruh. Retail sangat dominan di sektor ini - rawan euforia dan panic.',
    'Konsumer': 'KONTEKS SEKTOR KONSUMER IHSG: Defensif, cocok saat risk-off. UNVR, ICBP, MYOR adalah pemain kuat. Sensitif terhadap inflasi dan daya beli. Musiman (Lebaran, Natal) berpengaruh. Biasanya tidak gorengan - lebih fundamental driven.',
    'Properti': 'KONTEKS SEKTOR PROPERTI IHSG: Sangat sensitif terhadap suku bunga KPR dan BI Rate. Stimulus pemerintah (PPN 0%, subsidi) adalah katalis utama. Developer besar: BSDE, CTRA, SMRA. Likuiditas rendah - rawan bandar.',
    'Infrastruktur': 'KONTEKS SEKTOR INFRASTRUKTUR IHSG: BUMN dominan (JSMR, WIKA, WSKT). Sensitif terhadap belanja pemerintah dan APBN. Proyek IKN dan PSN menjadi katalis. Sering menjadi saham politik - pergerakan tidak selalu fundamental.',
    'Barang Baku': 'KONTEKS SEKTOR BARANG BAKU IHSG: Terkait langsung dengan harga komoditas (nikel, tembaga, baja, kimia). INCO, ANTM sensitif terhadap harga LME. TPIA terkait harga petrokimia global. Sangat cyclical.',
    'Telekomunikasi': 'KONTEKS SEKTOR TELEKOMUNIKASI IHSG: TLKM dominan dengan free float besar - sering menjadi barometer market. Dividend yield tinggi menarik institusional. Kompetisi ketat menekan ARPU. 5G rollout sebagai katalis jangka menengah.',
    'Kesehatan': 'KONTEKS SEKTOR KESEHATAN IHSG: Defensif dan tumbuh konsisten. KLBF, SIDO, MIKA adalah pilihan kuat. Post-COVID normalisasi terjadi. Regulasi BPJS berpengaruh terhadap margin RS. Valuasi relatif premium.',
  };

  var key = Object.keys(konteks).find(function(k) {
    return sektor && sektor.toLowerCase().includes(k.toLowerCase());
  });

  return key ? konteks[key] : 'KONTEKS SEKTOR: Analisis sektor ' + sektor + ' dalam konteks IHSG. Perhatikan sentimen market saat ini dan rotasi sektor.';
}

function getBandarContext(scoring, metadata) {
  if (!scoring) return '';

  var lines = ['PANDUAN ANALISIS BANDAR & SMART MONEY:'];

  if (scoring.breakdown && scoring.breakdown.volume) {
    var volScore = scoring.breakdown.volume.score;
    if (volScore >= 7) {
      lines.push('- Volume score tinggi (' + volScore + '/10): Kemungkinan ada akumulasi institusional atau bandar');
    } else if (volScore <= 3) {
      lines.push('- Volume score rendah (' + volScore + '/10): Retail mendominasi atau bandar sedang distribusi');
    }
  }

  if (scoring.breakdown && scoring.breakdown.trend) {
    var trendScore = scoring.breakdown.trend.score;
    if (trendScore >= 8) {
      lines.push('- Trend score sangat kuat (' + trendScore + '/10): Kemungkinan ada penggerak institusional');
    }
  }

  lines.push('- Identifikasi apakah volume spike disertai body candle besar (genuine move) atau doji/spinning top (absorpsi bandar)');
  lines.push('- Perhatikan apakah akumulasi terjadi secara stealth (volume pelan meningkat) atau agresif (volume langsung meledak)');

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
- Membaca makro Indonesia: BI Rate, inflasi, current account, rupiah
- Memahami foreign flow dan dampaknya ke IHSG
- Mengerti MSCI rebalancing dan efeknya ke saham Indonesia
- Sector rotation IHSG: kapan masuk banking, komoditas, consumer
- Membaca risk-on/risk-off global dan dampak ke emerging market
- Mendeteksi distribusi institusional vs akumulasi di level indeks

INDEKS: ${nama}
${priceContext}
${technicalContext}

INSTRUKSI: Jawab HANYA JSON valid tanpa teks lain, tanpa markdown, tanpa trailing comma.

{
  "namaLengkap": "${nama}",
  "sektor": "Indeks Pasar Modal Indonesia",
  "whyNow": "Kenapa kondisi market IHSG SEKARANG penting bagi trader? Apa yang sedang terjadi? 2-3 kalimat spesifik.",
  "summary": "4-5 kalimat: kondisi IHSG aktual, level MA kritis, RSI dan momentum, sentimen makro Indonesia terkini",
  "sentiment": "${sent}",
  "bullThesis": ["faktor positif konkret 1 dengan data", "faktor positif 2", "faktor positif 3"],
  "bearThesis": ["risiko konkret 1 dengan level", "risiko 2", "risiko 3"],
  "rekomendasi": "Strategi market 3 kalimat: kondisi saat ini, zona akumulasi/distribusi spesifik, sektor yang direkomendasikan",
  "priceEst": "Target IHSG 3-6 bulan misal: 7.200 - 7.800",
  "pe": "Rata-rata P/E pasar IHSG saat ini vs historis",
  "pbv": "Rata-rata P/BV pasar IHSG saat ini",
  "divYield": "Dividend yield rata-rata pasar IHSG",
  "beta": "1.00",
  "sektorKuat": ["sektor outperform 1 dengan alasan", "sektor 2", "sektor 3"],
  "sektorLemah": ["sektor underperform 1 dengan alasan", "sektor 2"],
  "analisisTeknikal": "3 kalimat: support/resistance IHSG aktual dengan angka, kondisi MA dan golden/death cross, momentum RSI dan MACD",
  "analisisFundamental": "2 kalimat: kondisi makro Indonesia (PDB growth, inflasi, BI Rate terkini, posisi asing)",
  "keunggulan": ["katalis positif 1 spesifik", "katalis 2", "katalis 3"],
  "risiko": ["risiko makro utama 1 spesifik", "risiko 2", "risiko 3"],
  "katalis": ["katalis jangka pendek 1-3 bulan", "katalis menengah 3-6 bulan", "risiko katalis negatif utama"],
  "targetHarga": "Target bull IHSG misal: 8.200",
  "stopLoss": "Level support kritis IHSG misal: 6.500",
  "levelBeli": "Zona akumulasi ideal IHSG misal: 6.800 - 7.000",
  "confidenceLevel": "${scoring ? scoring.confidence : 'Medium'}",
  "smartMoneySignal": "Apakah ada tanda institusional masuk atau keluar dari IHSG? Foreign flow bagaimana? Jelaskan.",
  "bandaAnalysis": "Analisis posisi institusional dan asing di IHSG saat ini. Rotation atau exit?",
  "sektorContext": "Sektor mana yang sedang mendapat inflow dan sektor mana yang sedang dijual? Kenapa?",
  "rekomendasiSaham": ["KODE: nama - alasan spesifik teknikal", "KODE: nama - alasan", "KODE: nama - alasan"],
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

  var apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak dikonfigurasi di environment variables');

  var bandarData = params.bandarData || null;
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
      max_tokens:  3500,
      temperature: 0.2,
      messages: [
        {
          role:    'system',
          content: 'Kamu adalah analis saham IHSG senior yang memahami psikologi bandar, foreign flow, dan sector rotation. Jawab HANYA dengan JSON valid - tidak ada teks lain sebelum atau sesudah JSON, tidak ada markdown, tidak ada trailing comma. Isi SEMUA field yang diminta. JANGAN ubah angka dari context teknikal.'
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
  return raw;
}

module.exports = { callAI };
