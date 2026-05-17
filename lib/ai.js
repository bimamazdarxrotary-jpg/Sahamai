// ══════════════════════════════════════════════════════════════════
// lib/ai.js — AI Reasoning Engine Khusus IHSG (CommonJS)
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

function buildTechnicalContext(indicators, volumeData, structure, scoring) {
  const i  = indicators || {};
  const v  = volumeData || {};
  const s  = structure  || {};
  const sc = scoring    || {};

  const rsiLabel = i.rsi != null
    ? `${i.rsi}${i.rsi > 70 ? ' ⚠️ OVERBOUGHT' : i.rsi < 30 ? ' ⚠️ OVERSOLD' : ''}`
    : 'N/A';

  const maStatus = i.ma
    ? [
        i.ma.aboveMA20 ? 'di atas MA20' : 'di bawah MA20',
        i.ma.aboveMA50 ? 'di atas MA50' : 'di bawah MA50',
        i.ma.ma20vs50 === 'bullish_alignment' ? '(MA20 > MA50 ✅)' : '(MA20 < MA50 ❌)',
        i.ma.type ? `| ${i.ma.type.replace(/_/g,' ').toUpperCase()}` : ''
      ].filter(Boolean).join(' ')
    : 'N/A';

  const setups = s.setups?.map(st =>
    `• ${st.type.toUpperCase()} (${st.direction}, ${st.confidence}): ${st.reason}`
  ).join('\n') || '• Tidak ada setup clear';

  return `
INDIKATOR TEKNIKAL (DIHITUNG MATEMATIS — JANGAN UBAH):
- RSI(14)      : ${rsiLabel}
- MACD         : ${i.macd?.trend || 'N/A'} | Histogram: ${i.macd?.histogram ?? 'N/A'} | Crossover: ${i.macd?.crossover || 'none'}
- MA Status    : ${maStatus}
- MA20         : ${i.ma?.ma20?.toLocaleString('id-ID') || 'N/A'}
- MA50         : ${i.ma?.ma50?.toLocaleString('id-ID') || 'N/A'}
- Bollinger    : Upper ${i.bb?.upper?.toLocaleString('id-ID') || 'N/A'} | Mid ${i.bb?.middle?.toLocaleString('id-ID') || 'N/A'} | Lower ${i.bb?.lower?.toLocaleString('id-ID') || 'N/A'} | ${i.bb?.position || 'N/A'} (${i.bb?.bandPct ?? 'N/A'}%)
- Stochastic   : K=${i.stoch?.k ?? 'N/A'} D=${i.stoch?.d ?? 'N/A'} → ${i.stoch?.signal || 'N/A'}
- ATR(14)      : ${i.atr?.atr?.toLocaleString('id-ID') || 'N/A'} (${i.atr?.atrPct || 'N/A'}%)
- ADX Trend    : ${i.trend?.adx || 'N/A'} | ${i.trend?.trend || 'N/A'} | ${i.trend?.strength || 'N/A'}

VOLUME INTELLIGENCE:
- Pattern      : ${v.accDist?.bias || 'N/A'} (Acc: ${v.accDist?.accDays || 0}h, Dist: ${v.accDist?.distDays || 0}h)
- Volume Spike : ${v.spike?.isSpike ? `YA — ${v.spike.ratio}× (${v.spike.intensity})` : 'Tidak'}
- OBV Trend    : ${v.obv?.trend || 'N/A'}
- VWAP         : ${v.vwap?.toLocaleString('id-ID') || 'N/A'}
- Narasi       : ${v.narrative || 'N/A'}

MARKET STRUCTURE:
- Fase Market  : ${s.phase || 'N/A'} — ${s.phaseLabel || ''}
- Tren         : ${s.trend?.direction || 'N/A'} | Confidence: ${s.trend?.confidence || 'N/A'}%
- HH/HL        : ${s.hhll?.pattern || 'N/A'}
- Breakout     : ${s.breakout?.isBreakout ? `${s.breakout.type} di ${s.breakout.level?.toLocaleString('id-ID')} (${s.breakout.confirmed ? 'CONFIRMED' : 'UNCONFIRMED'})` : s.breakout?.type || 'Tidak ada'}
- Support      : ${i.levels?.support?.map(l => l.toLocaleString('id-ID')).join(', ') || 'N/A'}
- Resistance   : ${i.levels?.resistance?.map(l => l.toLocaleString('id-ID')).join(', ') || 'N/A'}

SETUP TERDETEKSI:
${setups}

SCORING:
- Final        : ${sc.final || 'N/A'}/10 → ${sc.recommendation || 'N/A'} (${sc.confidence || 'N/A'})
- Trend/Vol/Mom/Risk: ${sc.breakdown?.trend?.score ?? 'N/A'} / ${sc.breakdown?.volume?.score ?? 'N/A'} / ${sc.breakdown?.momentum?.score ?? 'N/A'} / ${sc.breakdown?.risk?.score ?? 'N/A'}
`;
}

function buildStockPrompt(ticker, metadata, priceContext, technicalContext, scoring) {
  const namaResmi   = metadata?.name ? `PT ${metadata.name}` : ticker;
  const sektorResmi = metadata?.sector || 'tidak diketahui';
  const subsektor   = metadata?.subsector || '';
  const inDB        = !!metadata;
  const recSentiment = scoring?.recommendation === 'BELI' || scoring?.recommendation === 'AKUMULASI' ? 'BELI'
                     : scoring?.recommendation === 'JUAL' || scoring?.recommendation === 'KURANGI'   ? 'JUAL'
                     : 'TAHAN';

  return `Kamu adalah Senior Equity Analyst IHSG, CFA, 20+ tahun pengalaman.
Kamu memahami: psikologi bandar, saham gorengan, foreign flow, retail panic, sector rotation, efek MSCI, smart money behavior.

IDENTITAS EMITEN:
- Ticker     : ${ticker}
- Nama Resmi : ${namaResmi}${inDB ? ' ✅' : ' ⚠️ (tidak di database IDX)'}
- Sektor     : ${sektorResmi}${subsektor ? ` — ${subsektor}` : ''}

${priceContext}
${technicalContext}

INSTRUKSI:
1. Semua angka di atas FAKTUAL — JANGAN ubah
2. Sentiment HARUS sesuai score (${scoring?.final || 5}/10 → ${recSentiment})
3. Jawab KENAPA saham ini menarik/tidak SEKARANG
4. Bull/Bear thesis harus spesifik berbasis data di atas
5. Jawab HANYA JSON valid, tanpa markdown, tanpa trailing comma

{
  "namaLengkap": "${namaResmi}",
  "sektor": "${sektorResmi}${subsektor ? ` — ${subsektor}` : ''}",
  "whyNow": "2-3 kalimat kenapa saham ini layak/tidak diperhatikan SEKARANG",
  "summary": "4-5 kalimat: bisnis, kondisi teknikal saat ini, fase market",
  "sentiment": "${recSentiment}",
  "bullThesis": ["argumen bull 1", "argumen bull 2", "argumen bull 3"],
  "bearThesis": ["argumen bear 1", "argumen bear 2", "argumen bear 3"],
  "rekomendasi": "3 kalimat: aksi, zona entry dengan harga, exit plan dengan SL dan target",
  "priceEst": "Range harga wajar misal: Rp 9.500 - Rp 10.800",
  "pe": "P/E aktual vs rata-rata industri",
  "pbv": "P/BV aktual dengan konteks ROE",
  "divYield": "Dividend yield dan track record",
  "beta": "angka saja misal: 0.85",
  "analisisTeknikal": "3 kalimat: tren & MA, support/resistance dengan angka, RSI/MACD",
  "analisisFundamental": "3 kalimat: revenue/laba, margin/ROE, DER/neraca",
  "posisiKompetitif": "2 kalimat: market share dan keunggulan vs kompetitor",
  "keunggulan": ["keunggulan 1", "keunggulan 2", "keunggulan 3"],
  "risiko": ["risiko 1", "risiko 2", "risiko 3"],
  "katalis": ["katalis pendek 1-3 bulan", "katalis menengah 6-12 bulan", "risiko katalis negatif"],
  "targetHarga": "Target 12 bulan misal: Rp 10.500",
  "stopLoss": "Stop loss misal: Rp 8.200",
  "levelBeli": "Zona beli ideal misal: Rp 8.800 - Rp 9.200",
  "confidenceLevel": "${scoring?.confidence || 'Medium'}",
  "smartMoneySignal": "Ada tanda smart money/bandar? Jelaskan atau: Tidak terdeteksi.",
  "scoreFundamental": "angka 1-10 lalu penjelasan misal: 7 — ROE stabil",
  "scoreTeknikal": "${scoring?.final || 5} — ${scoring?.label || 'berdasarkan indikator matematis'}"
}`;
}

function buildIndexPrompt(ticker, priceContext, technicalContext, scoring) {
  const nama = ticker === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : 'Indeks LQ45';
  const sent = scoring?.recommendation?.includes('BELI') ? 'BULLISH'
             : scoring?.recommendation?.includes('JUAL') ? 'BEARISH' : 'NETRAL';

  return `Kamu adalah Chief Market Strategist senior, 20+ tahun di BEI.
Kamu memahami makro Indonesia, foreign flow, BI rate, komoditas, rotasi sektor.

INDEKS: ${nama}
${priceContext}
${technicalContext}

Jawab HANYA JSON valid:
{
  "namaLengkap": "${nama}",
  "sektor": "Indeks Pasar Modal Indonesia",
  "whyNow": "Kenapa kondisi market SEKARANG penting bagi trader? 2-3 kalimat.",
  "summary": "4-5 kalimat: kondisi IHSG, level MA, RSI, sentimen makro",
  "sentiment": "${sent}",
  "bullThesis": ["faktor positif 1", "faktor positif 2", "faktor positif 3"],
  "bearThesis": ["risiko 1", "risiko 2", "risiko 3"],
  "rekomendasi": "Strategi market 3 kalimat dengan zona akumulasi/distribusi spesifik",
  "priceEst": "Target indeks 3-6 bulan misal: 7.200 - 7.800",
  "pe": "Rata-rata P/E pasar saat ini",
  "pbv": "Rata-rata P/BV pasar saat ini",
  "divYield": "Dividend yield rata-rata pasar",
  "beta": "1.00",
  "sektorKuat": ["sektor outperform 1", "sektor 2", "sektor 3"],
  "sektorLemah": ["sektor underperform 1", "sektor 2"],
  "analisisTeknikal": "3 kalimat: support/resistance aktual, kondisi MA, momentum",
  "analisisFundamental": "2 kalimat: makro Indonesia (PDB, inflasi, BI rate, asing)",
  "keunggulan": ["katalis positif 1", "katalis 2", "katalis 3"],
  "risiko": ["risiko utama 1", "risiko 2", "risiko 3"],
  "katalis": ["katalis jangka pendek", "katalis menengah", "risiko utama"],
  "targetBull": "Target optimis misal: 8.200",
  "targetBear": "Target pesimis misal: 6.500",
  "rekomendasiSaham": ["KODE: nama — alasan", "KODE: nama — alasan", "KODE: nama — alasan"],
  "confidenceLevel": "${scoring?.confidence || 'Medium'}",
  "scoreTeknikal": "${scoring?.final || 5} — ${scoring?.label || 'berdasarkan indikator matematis'}"
}`;
}

async function callAI({ ticker, metadata, isIndex, priceData, priceContext, indicators, volumeData, structure, scoring }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak dikonfigurasi di environment variables');

  const technicalContext = buildTechnicalContext(indicators, volumeData, structure, scoring);
  const prompt = isIndex
    ? buildIndexPrompt(ticker, priceContext, technicalContext, scoring)
    : buildStockPrompt(ticker, metadata, priceContext, technicalContext, scoring);

  const res = await fetchWithRetry(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  3000,
      temperature: 0.25,
      messages: [
        {
          role:    'system',
          content: 'Kamu analis saham IHSG profesional. Jawab HANYA JSON valid — tidak ada teks lain, tidak ada markdown, tidak ada trailing comma. JANGAN ubah angka dari context. Isi semua field.'
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

module.exports = { callAI };
