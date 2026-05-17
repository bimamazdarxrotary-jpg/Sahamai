// ══════════════════════════════════════════════════════════════════
// lib/ai.js — AI Reasoning Engine Khusus IHSG
// AI hanya interpretasi. Semua angka sudah dihitung sebelumnya.
// ══════════════════════════════════════════════════════════════════

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

/**
 * Retry dengan exponential backoff
 */
async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res; // non-5xx tidak di-retry
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
}

/**
 * Build context teknikal untuk prompt
 */
function buildTechnicalContext(indicators, volumeData, structure, scoring) {
  const i   = indicators || {};
  const v   = volumeData || {};
  const s   = structure  || {};
  const sc  = scoring    || {};

  const rsiLabel = i.rsi
    ? `${i.rsi}${i.rsi > 70 ? ' ⚠️ OVERBOUGHT' : i.rsi < 30 ? ' ⚠️ OVERSOLD' : ''}`
    : 'N/A';

  const maStatus = i.ma
    ? [
        i.ma.aboveMA20 ? 'di atas MA20' : 'di bawah MA20',
        i.ma.aboveMA50 ? 'di atas MA50' : 'di bawah MA50',
        i.ma.ma20vs50 === 'bullish_alignment' ? '(MA20 > MA50 ✅)' : '(MA20 < MA50 ❌)',
        i.ma.type ? `| ${i.ma.type.replace(/_/g, ' ').toUpperCase()}` : ''
      ].filter(Boolean).join(' ')
    : 'N/A';

  const setups = s.setups?.map(st =>
    `• ${st.type.toUpperCase()} (${st.direction}, ${st.confidence}): ${st.reason}`
  ).join('\n') || '• Tidak ada setup clear';

  return `
INDIKATOR TEKNIKAL (DIHITUNG MATEMATIS — JANGAN UBAH ANGKA INI):
- RSI(14)      : ${rsiLabel}
- MACD         : ${i.macd?.trend || 'N/A'} | Histogram: ${i.macd?.histogram ?? 'N/A'} | Crossover: ${i.macd?.crossover || 'none'}
- MA Status    : ${maStatus}
- MA20         : ${i.ma?.ma20?.toLocaleString('id-ID') || 'N/A'}
- MA50         : ${i.ma?.ma50?.toLocaleString('id-ID') || 'N/A'}
- Bollinger    : Upper ${i.bb?.upper?.toLocaleString('id-ID') || 'N/A'} | Mid ${i.bb?.middle?.toLocaleString('id-ID') || 'N/A'} | Lower ${i.bb?.lower?.toLocaleString('id-ID') || 'N/A'} | Posisi: ${i.bb?.position || 'N/A'} (${i.bb?.bandPct ?? 'N/A'}%)
- Stochastic   : K=${i.stoch?.k ?? 'N/A'} D=${i.stoch?.d ?? 'N/A'} → ${i.stoch?.signal || 'N/A'}
- ATR(14)      : ${i.atr?.atr?.toLocaleString('id-ID') || 'N/A'} (${i.atr?.atrPct || 'N/A'}% dari harga)
- ADX Trend    : ${i.trend?.adx || 'N/A'} | ${i.trend?.trend || 'N/A'} | Strength: ${i.trend?.strength || 'N/A'}

VOLUME INTELLIGENCE:
- Pattern      : ${v.accDist?.bias || 'N/A'} (Acc: ${v.accDist?.accDays || 0} hari, Dist: ${v.accDist?.distDays || 0} hari)
- Volume Spike : ${v.spike?.isSpike ? `YA — ${v.spike.ratio}× rata-rata (${v.spike.intensity})` : 'Tidak'}
- OBV Trend    : ${v.obv?.trend || 'N/A'}
- VWAP         : ${v.vwap?.toLocaleString('id-ID') || 'N/A'}
- Konfirmasi   : ${v.confirmation?.signal?.replace(/_/g, ' ') || 'N/A'}
- Narasi Volume: ${v.narrative || 'N/A'}

MARKET STRUCTURE:
- Fase Market  : ${s.phase || 'N/A'} — ${s.phaseLabel || ''}
- Tren         : ${s.trend?.direction || 'N/A'} | Confidence: ${s.trend?.confidence || 'N/A'}%
- HH/HL Pattern: ${s.hhll?.pattern || 'N/A'}
- Breakout     : ${s.breakout?.isBreakout ? `${s.breakout.type} di ${s.breakout.level?.toLocaleString('id-ID')} (${s.breakout.confirmed ? 'CONFIRMED' : 'UNCONFIRMED — potensi fake'})` : s.breakout?.type || 'Tidak ada'}
- Support      : ${i.levels?.support?.map(l => l.toLocaleString('id-ID')).join(', ') || 'N/A'}
- Resistance   : ${i.levels?.resistance?.map(l => l.toLocaleString('id-ID')).join(', ') || 'N/A'}

SETUP YANG TERDETEKSI:
${setups}

SCORING DETERMINISTIC:
- Score Akhir  : ${sc.final || 'N/A'}/10 → ${sc.recommendation || 'N/A'} (${sc.confidence || 'N/A'} Confidence)
- Trend Score  : ${sc.breakdown?.trend?.score ?? 'N/A'}/10
- Volume Score : ${sc.breakdown?.volume?.score ?? 'N/A'}/10
- Momentum Score: ${sc.breakdown?.momentum?.score ?? 'N/A'}/10
- Risk Score   : ${sc.breakdown?.risk?.score ?? 'N/A'}/10 (10 = risiko tertinggi)
- Risk/Reward  : ${sc.riskReward || 'N/A'}
`;
}

/**
 * Build prompt untuk saham individual
 */
function buildStockPrompt(ticker, metadata, priceContext, technicalContext, scoring) {
  const namaResmi  = metadata?.name   ? `PT ${metadata.name}` : ticker;
  const sektorResmi= metadata?.sector || 'tidak diketahui';
  const subsektor  = metadata?.subsector || '';
  const inDB       = !!metadata;

  return `Kamu adalah Senior Equity Analyst IHSG dengan pengalaman 20+ tahun, CFA charterholder.
Kamu memahami dinamika pasar Indonesia: psikologi bandar, saham gorengan, foreign flow, retail panic, sector rotation, efek MSCI, dan smart money behavior.

IDENTITAS EMITEN:
- Ticker     : ${ticker}
- Nama Resmi : ${namaResmi}${inDB ? ' ✅ (terverifikasi IDX)' : ' ⚠️ (tidak ada di database IDX — perkirakan dengan akurat)'}
- Sektor     : ${sektorResmi}${subsektor ? ` — ${subsektor}` : ''}

${priceContext}

${technicalContext}

INSTRUKSI ANALISIS:
1. SEMUA angka dalam context di atas adalah FAKTUAL — JANGAN ubah, JANGAN buat angka lain
2. Analisis HARUS based on data di atas, bukan pengetahuan umum semata
3. Sentiment HARUS konsisten dengan scoring (score ${scoring?.final || 5}/10 → ${scoring?.recommendation || 'TAHAN'})
4. Jawab KENAPA saham ini menarik atau tidak SEKARANG (bukan sekadar summary)
5. Bull/Bear thesis harus spesifik berbasis data teknikal dan volume di atas
6. Jika ada tanda-tanda bandar/smart money: sebutkan secara eksplisit

FORMAT JAWABAN: JSON valid tanpa markdown, tanpa trailing comma.
Jawab HANYA JSON ini:
{
  "namaLengkap": "${namaResmi}",
  "sektor": "${sektorResmi}${subsektor ? ` — ${subsektor}` : ''}",
  "whyNow": "2-3 kalimat: KENAPA saham ini layak/tidak layak diperhatikan SEKARANG. Spesifik berbasis data teknikal & volume. Ini harus menjawab 'so what?' bagi trader.",
  "summary": "4-5 kalimat narasi: bisnis utama, kinerja, kondisi teknikal saat ini (sebutkan harga, MA, RSI), dan fase market yang sedang terjadi.",
  "sentiment": "${scoring?.recommendation === 'BELI' || scoring?.recommendation === 'AKUMULASI' ? 'BELI' : scoring?.recommendation === 'JUAL' || scoring?.recommendation === 'KURANGI' ? 'JUAL' : 'TAHAN'}",
  "bullThesis": ["Argumen bull spesifik 1 berbasis data", "Argumen bull 2", "Argumen bull 3"],
  "bearThesis": ["Argumen bear/risiko spesifik 1 berbasis data", "Argumen bear 2", "Argumen bear 3"],
  "rekomendasi": "3 kalimat aksi konkret: (1) aksi yang disarankan dengan alasan, (2) zona entry ideal dengan harga spesifik, (3) exit plan dengan stop loss dan target.",
  "priceEst": "Range harga wajar, misal: Rp 9.500 - Rp 10.800",
  "pe": "P/E aktual vs rata-rata industri dengan konteks",
  "pbv": "P/BV aktual dengan konteks ROE",
  "divYield": "Dividend yield dan track record",
  "beta": "Estimasi beta vs IHSG sebagai angka saja, misal: 0.85",
  "analisisTeknikal": "3 kalimat: (1) tren & posisi vs MA, (2) level support/resistance kunci dengan angka dari data, (3) kondisi RSI/MACD dan implikasinya.",
  "analisisFundamental": "3 kalimat: (1) pertumbuhan revenue/laba YoY, (2) margin dan ROE, (3) DER dan kesehatan neraca.",
  "posisiKompetitif": "2 kalimat: market share dan keunggulan vs kompetitor (sebutkan nama).",
  "keunggulan": ["Keunggulan kompetitif spesifik 1", "Keunggulan 2", "Keunggulan 3"],
  "risiko": ["Risiko spesifik 1", "Risiko 2", "Risiko 3"],
  "katalis": ["Katalis jangka pendek 1-3 bulan", "Katalis jangka menengah 6-12 bulan", "Risiko katalis negatif"],
  "targetHarga": "Target 12 bulan dengan angka spesifik, misal: Rp 10.500",
  "stopLoss": "Stop loss dengan angka spesifik, misal: Rp 8.200",
  "levelBeli": "Zona beli ideal, misal: Rp 8.800 - Rp 9.200",
  "setupDetected": "${scoring?.breakdown ? Object.keys(scoring.breakdown).join(', ') : 'N/A'}",
  "confidenceLevel": "${scoring?.confidence || 'Medium'}",
  "smartMoneySignal": "Apakah ada tanda smart money / bandar? Jelaskan singkat atau 'Tidak terdeteksi.'",
  "scoreFundamental": "Angka 1-10 lalu penjelasan, misal: 7 — ROE stabil, DER terkelola",
  "scoreTeknikal": "${scoring?.final || 5} — ${scoring?.label || 'Berdasarkan indikator matematis'}"
}`;
}

/**
 * Build prompt untuk indeks (IHSG / LQ45)
 */
function buildIndexPrompt(ticker, priceContext, technicalContext, scoring) {
  return `Kamu adalah Chief Market Strategist senior dengan 20+ tahun pengalaman di BEI.
Kamu memahami makro Indonesia, foreign flow, BI rate, komoditas, dan rotasi sektor IHSG.

INDEKS: ${ticker === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : 'Indeks LQ45'}

${priceContext}

${technicalContext}

INSTRUKSI: Semua angka di atas adalah FAKTUAL. Analisis HARUS berbasis data tersebut.
Jawab HANYA JSON valid:
{
  "namaLengkap": "${ticker === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : 'Indeks LQ45'}",
  "sektor": "Indeks Pasar Modal Indonesia",
  "whyNow": "Kenapa kondisi market SEKARANG penting bagi trader? 2-3 kalimat berbasis data.",
  "summary": "Analisis 4-5 kalimat: kondisi IHSG saat ini, level MA, RSI, sentimen makro.",
  "sentiment": "${scoring?.recommendation?.includes('BELI') ? 'BULLISH' : scoring?.recommendation?.includes('JUAL') ? 'BEARISH' : 'NETRAL'}",
  "bullThesis": ["Faktor positif konkret 1", "Faktor positif 2", "Faktor positif 3"],
  "bearThesis": ["Risiko konkret 1", "Risiko 2", "Risiko 3"],
  "rekomendasi": "Strategi market 3 kalimat dengan zona akumulasi/distribusi spesifik.",
  "priceEst": "Target indeks 3-6 bulan, misal: 7.200 - 7.800",
  "pe": "Rata-rata P/E pasar saat ini",
  "pbv": "Rata-rata P/BV pasar saat ini",
  "divYield": "Dividend yield rata-rata pasar",
  "beta": "1.00",
  "sektorKuat": ["Sektor IDX-IC yang outperform 1", "Sektor 2", "Sektor 3"],
  "sektorLemah": ["Sektor underperform 1", "Sektor 2"],
  "analisisTeknikal": "3 kalimat: level support/resistance aktual, kondisi MA, momentum RSI/MACD.",
  "analisisFundamental": "2 kalimat: makro Indonesia (PDB, inflasi, BI rate, asing).",
  "keunggulan": ["Katalis positif 1", "Katalis 2", "Katalis 3"],
  "risiko": ["Risiko utama 1", "Risiko 2", "Risiko 3"],
  "katalis": ["Katalis jangka pendek", "Katalis jangka menengah", "Risiko utama yang diwaspadai"],
  "targetBull": "Target optimis jika skenario positif, misal: 8.200",
  "targetBear": "Target pesimis jika skenario negatif, misal: 6.500",
  "rekomendasiSaham": ["KODE: nama — alasan defensif", "KODE: nama — alasan growth", "KODE: nama — alasan dividen"],
  "confidenceLevel": "${scoring?.confidence || 'Medium'}",
  "scoreTeknikal": "${scoring?.final || 5} — ${scoring?.label || 'Berdasarkan indikator matematis'}"
}`;
}

/**
 * Main: call AI dengan semua context
 */
export async function callAI({ ticker, metadata, isIndex, priceData, priceContext, indicators, volumeData, structure, scoring }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak dikonfigurasi');

  const technicalContext = buildTechnicalContext(indicators, volumeData, structure, scoring);

  const prompt = isIndex
    ? buildIndexPrompt(ticker, priceContext, technicalContext, scoring)
    : buildStockPrompt(ticker, metadata, priceContext, technicalContext, scoring);

  const res = await fetchWithRetry(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  3000,
      temperature: 0.25,
      messages: [
        {
          role:    'system',
          content: `Kamu adalah analis saham IHSG profesional. 
ATURAN ABSOLUT:
1. Jawab HANYA dengan JSON valid — tidak ada teks, markdown, atau komentar
2. Tidak ada trailing comma
3. JANGAN ubah angka dari context — itu hasil perhitungan matematis
4. Field namaLengkap dan sektor WAJIB persis seperti di instruksi
5. JANGAN gunakan placeholder "X" atau "..." — isi semua field dengan nilai nyata
6. JSON harus bisa di-parse langsung tanpa modifikasi`
        },
        { role: 'user', content: prompt }
      ]
    })
  }, 3);

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Groq API error ${res.status}`);
  }

  const body = await res.json();
  const raw  = body.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Respons AI kosong');

  return raw;
}
