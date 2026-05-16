export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.body;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Kode saham tidak valid' });
  }

  const clean = ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || clean.length > 10) {
    return res.status(400).json({ error: 'Kode saham tidak valid' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key tidak dikonfigurasi di server' });
  }

  const isIndex = clean === 'IHSG' || clean === 'LQ45';

  // ── 1. Fetch real-time price + historical from Yahoo Finance ──
  let priceData = null;
  try {
    const symbol = isIndex
      ? (clean === 'IHSG' ? '%5EJKSE' : '%5EJKLQ45')
      : `${clean}.JK`;

    // Current quote
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
    const quoteRes = await fetch(quoteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (quoteRes.ok) {
      const quoteJson = await quoteRes.json();
      const meta = quoteJson?.chart?.result?.[0]?.meta;
      const quotes = quoteJson?.chart?.result?.[0]?.indicators?.quote?.[0];
      const timestamps = quoteJson?.chart?.result?.[0]?.timestamp;

      if (meta && quotes && timestamps) {
        const closes = quotes.close;
        const highs = quotes.high;
        const lows = quotes.low;
        const volumes = quotes.volume;

        // Build historical data (last 60 valid points)
        const history = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] !== null && closes[i] !== undefined) {
            history.push({
              date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
              close: Math.round(closes[i]),
              high: Math.round(highs[i] || closes[i]),
              low: Math.round(lows[i] || closes[i]),
              volume: volumes[i] || 0
            });
          }
        }

        const lastClose = meta.regularMarketPrice || closes[closes.length - 1];
        const prevClose = meta.chartPreviousClose || closes[closes.length - 2] || lastClose;
        const change = lastClose - prevClose;
        const changePct = prevClose ? ((change / prevClose) * 100) : 0;

        // Simple technical indicators
        const recentCloses = history.slice(-20).map(h => h.close).filter(Boolean);
        const ma20 = recentCloses.length > 0
          ? Math.round(recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length)
          : null;

        const last50 = history.slice(-50).map(h => h.close).filter(Boolean);
        const ma50 = last50.length >= 10
          ? Math.round(last50.reduce((a, b) => a + b, 0) / last50.length)
          : null;

        // 52 week high/low from meta
        const high52w = meta.fiftyTwoWeekHigh;
        const low52w = meta.fiftyTwoWeekLow;

        priceData = {
          currentPrice: Math.round(lastClose),
          prevClose: Math.round(prevClose),
          change: Math.round(change),
          changePct: changePct.toFixed(2),
          isUp: change >= 0,
          high52w: high52w ? Math.round(high52w) : null,
          low52w: low52w ? Math.round(low52w) : null,
          ma20,
          ma50,
          currency: meta.currency || 'IDR',
          history: history.slice(-60),
          volume: meta.regularMarketVolume || null,
          marketCap: meta.marketCap || null
        };
      }
    }
  } catch (e) {
    console.error('Price fetch error:', e.message);
    // Continue without price data
  }

  // ── 2. Build enriched prompt with price context ──
  const priceContext = priceData
    ? `Data pasar terkini:
- Harga saat ini: ${priceData.currency} ${priceData.currentPrice.toLocaleString('id-ID')}
- Perubahan hari ini: ${priceData.isUp ? '+' : ''}${priceData.change.toLocaleString('id-ID')} (${priceData.isUp ? '+' : ''}${priceData.changePct}%)
- MA20: ${priceData.ma20 ? priceData.ma20.toLocaleString('id-ID') : 'N/A'}
- MA50: ${priceData.ma50 ? priceData.ma50.toLocaleString('id-ID') : 'N/A'}
- 52W High: ${priceData.high52w ? priceData.high52w.toLocaleString('id-ID') : 'N/A'}
- 52W Low: ${priceData.low52w ? priceData.low52w.toLocaleString('id-ID') : 'N/A'}
Gunakan data ini dalam analisismu.`
    : 'Data harga real-time tidak tersedia, gunakan pengetahuanmu.';

  const prompt = isIndex
    ? `Kamu adalah analis pasar modal Indonesia senior dengan 20 tahun pengalaman. Analisis mendalam kondisi ${clean} saat ini.

${priceContext}

Jawab HANYA JSON valid tanpa markdown:
{
  "namaLengkap": "${clean === 'IHSG' ? 'Indeks Harga Saham Gabungan' : 'Indeks LQ45'}",
  "sektor": "Indeks Pasar",
  "summary": "analisis kondisi pasar 4-5 kalimat mendalam mencakup tren makro, sentimen investor, dan kondisi teknikal",
  "sentiment": "BULLISH atau BEARISH atau NETRAL",
  "rekomendasi": "strategi investasi konkret dan actionable 3 kalimat dengan level entry/exit",
  "priceEst": "estimasi range nilai indeks target 3-6 bulan ke depan",
  "pe": "rata-rata P/E pasar saat ini",
  "pbv": "rata-rata P/BV pasar",
  "divYield": "rata-rata dividend yield pasar",
  "beta": "1.0",
  "sektorKuat": ["sektor terkuat 1", "sektor terkuat 2", "sektor terkuat 3"],
  "sektorLemah": ["sektor lemah 1", "sektor lemah 2"],
  "analisisTeknikal": "analisis teknikal 2 kalimat mencakup support/resistance dan momentum",
  "analisisFundamental": "analisis fundamental makro 2 kalimat",
  "keunggulan": ["poin positif 1", "poin positif 2", "poin positif 3"],
  "risiko": ["risiko utama 1", "risiko utama 2", "risiko utama 3"],
  "katalis": ["katalis positif jangka pendek 1", "katalis positif 2", "katalis negatif yang perlu diwaspadai"],
  "targetBull": "target optimis indeks",
  "targetBear": "target pesimis indeks",
  "rekomendasiSaham": ["contoh saham defensif 1", "contoh saham growth 2", "contoh saham dividen 3"]
}`
    : `Kamu adalah analis saham Indonesia senior dengan 20 tahun pengalaman di IDX. Lakukan analisis MENDALAM saham ${clean} di Bursa Efek Indonesia.

${priceContext}

Jawab HANYA JSON valid tanpa markdown:
{
  "namaLengkap": "nama perusahaan lengkap resmi",
  "sektor": "sektor industri spesifik",
  "summary": "analisis komprehensif 4-5 kalimat mencakup bisnis, fundamental, posisi kompetitif, dan tren terkini",
  "sentiment": "BELI atau TAHAN atau JUAL",
  "rekomendasi": "rekomendasi aksi konkret 3 kalimat dengan harga target, level beli ideal, dan stop loss",
  "priceEst": "estimasi harga wajar berdasarkan DCF/PER dengan range Rp X - Rp Y",
  "pe": "P/E ratio vs rata-rata industri misal: 15x (industri: 18x)",
  "pbv": "P/BV dengan konteks misal: 2.1x (wajar untuk ROE 14%)",
  "divYield": "dividend yield % dengan track record",
  "beta": "estimasi beta vs IHSG",
  "analisisTeknikal": "analisis teknikal mendalam 3 kalimat: trend, support, resistance, MA, volume",
  "analisisFundamental": "analisis fundamental 3 kalimat: revenue growth, margin, ROE, DER, cashflow",
  "posisiKompetitif": "posisi di industri vs kompetitor 2 kalimat",
  "keunggulan": ["keunggulan kompetitif 1", "keunggulan 2", "keunggulan 3", "keunggulan 4"],
  "risiko": ["risiko bisnis 1", "risiko 2", "risiko 3"],
  "katalis": ["katalis positif jangka pendek", "katalis positif jangka panjang", "potensi risiko mendatang"],
  "targetHarga": "target harga 12 bulan: Rp X",
  "stopLoss": "level stop loss: Rp X",
  "levelBeli": "zona beli ideal: Rp X - Rp Y",
  "scoreFundamental": "skor fundamental 1-10 dengan penjelasan singkat",
  "scoreTeknikal": "skor teknikal 1-10 dengan penjelasan singkat"
}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah analis saham IDX senior berpengalaman. Selalu jawab HANYA dengan JSON valid, tanpa markdown, tanpa komentar, tanpa teks di luar JSON.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.json().catch(() => ({}));
      return res.status(502).json({ error: errBody.error?.message || `Groq API error ${groqRes.status}` });
    }

    const body = await groqRes.json();
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) return res.status(502).json({ error: 'Tidak ada respons dari AI. Coba lagi.' });

    const cleaned = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse error:', cleaned.slice(0, 300));
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }

    // Merge price data into response
    if (priceData) {
      parsed.priceData = priceData;
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan server' });
  }
}
