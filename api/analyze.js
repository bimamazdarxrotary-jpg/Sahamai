export default async function handler(req, res) {
  // Allow only POST
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key tidak dikonfigurasi di server' });
  }

  const isIndex = clean === 'IHSG' || clean === 'LQ45';

  const prompt = isIndex
    ? `Kamu adalah analis pasar modal Indonesia senior. Analisis kondisi ${clean} saat ini. Jawab HANYA JSON valid tanpa markdown dan tanpa komentar apapun:
{"namaLengkap":"${clean === 'IHSG' ? 'Indeks Harga Saham Gabungan' : 'Indeks LQ45'}","sektor":"Indeks Pasar","summary":"analisis kondisi pasar 3 kalimat informatif","sentiment":"BULLISH atau BEARISH atau NETRAL","rekomendasi":"strategi investasi konkret 2 kalimat","priceEst":"estimasi range nilai indeks","pe":"rata-rata P/E pasar","pbv":"rata-rata P/BV pasar","divYield":"rata-rata yield","beta":"1.0","keunggulan":["poin1","poin2","poin3"],"risiko":["risiko1","risiko2","risiko3"],"katalis":["katalis1","katalis2"]}`
    : `Kamu adalah analis saham Indonesia senior. Analisis saham ${clean} di Bursa Efek Indonesia. Jawab HANYA JSON valid tanpa markdown dan tanpa komentar apapun:
{"namaLengkap":"nama perusahaan lengkap","sektor":"sektor industri","summary":"analisis fundamental dan teknikal 3 kalimat","sentiment":"BELI atau TAHAN atau JUAL","rekomendasi":"rekomendasi aksi dan target harga 2 kalimat","priceEst":"estimasi harga wajar Rp","pe":"P/E ratio","pbv":"P/BV","divYield":"dividend yield %","beta":"estimasi beta","keunggulan":["keunggulan1","keunggulan2","keunggulan3"],"risiko":["risiko1","risiko2","risiko3"],"katalis":["katalis1","katalis2"]}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `Gemini API error ${response.status}`;
      return res.status(502).json({ error: errMsg });
    }

    const body = await response.json();

    const candidate = body.candidates?.[0];
    if (!candidate) {
      return res.status(502).json({ error: 'Tidak ada respons dari Gemini. Coba lagi.' });
    }

    const raw = candidate.content?.parts
      ?.map(p => p.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    if (!raw) {
      return res.status(502).json({ error: 'Respons Gemini kosong. Coba lagi.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('JSON parse error. Raw:', raw);
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan server' });
  }
}
