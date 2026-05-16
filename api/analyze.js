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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key tidak dikonfigurasi di server' });
  }

  const isIndex = clean === 'IHSG' || clean === 'LQ45';
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = isIndex
    ? `Kamu adalah analis pasar modal Indonesia senior. Analisis kondisi ${clean} saat ini. Jawab HANYA JSON valid tanpa markdown:
{"namaLengkap":"${clean === 'IHSG' ? 'Indeks Harga Saham Gabungan' : 'Indeks LQ45'}","sektor":"Indeks Pasar","summary":"analisis kondisi pasar 3 kalimat informatif","sentiment":"BULLISH atau BEARISH atau NETRAL","rekomendasi":"strategi investasi konkret 2 kalimat","priceEst":"estimasi range nilai indeks","pe":"rata-rata P/E pasar","pbv":"rata-rata P/BV pasar","divYield":"rata-rata yield","beta":"1.0","keunggulan":["poin1","poin2","poin3"],"risiko":["risiko1","risiko2","risiko3"],"katalis":["katalis1","katalis2"]}`
    : `Kamu adalah analis saham Indonesia senior. Analisis saham ${clean} di Bursa Efek Indonesia. Jawab HANYA JSON valid tanpa markdown:
{"namaLengkap":"nama perusahaan lengkap","sektor":"sektor industri","summary":"analisis fundamental dan teknikal 3 kalimat","sentiment":"BELI atau TAHAN atau JUAL","rekomendasi":"rekomendasi aksi dan target harga 2 kalimat","priceEst":"estimasi harga wajar Rp","pe":"P/E ratio","pbv":"P/BV","divYield":"dividend yield %","beta":"estimasi beta","keunggulan":["keunggulan1","keunggulan2","keunggulan3"],"risiko":["risiko1","risiko2","risiko3"],"katalis":["katalis1","katalis2"]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return res.status(502).json({ error: errBody.error?.message || `Claude API error ${response.status}` });
    }

    const body = await response.json();

    if (!body.content || !Array.isArray(body.content) || body.content.length === 0) {
      console.error('Unexpected API response structure:', JSON.stringify(body));
      return res.status(502).json({ error: 'Respons API tidak valid. Coba lagi dalam beberapa detik.' });
    }

    const raw = body.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('JSON parse error. Raw response:', raw);
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan server' });
  }
}
