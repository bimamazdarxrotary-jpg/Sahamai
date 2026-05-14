export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticker } = req.body || {};
  if (!ticker) return res.status(400).json({ error: 'Kode saham tidak valid' });

  const clean = ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key belum dikonfigurasi' });

  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const isIndex = clean === 'IHSG' || clean === 'LQ45';

  const prompt = isIndex
    ? `Analisis kondisi ${clean} saat ini. Jawab HANYA JSON valid tanpa markdown: {"namaLengkap":"${clean === 'IHSG' ? 'Indeks Harga Saham Gabungan' : 'Indeks LQ45'}","sektor":"Indeks Pasar","summary":"analisis 3 kalimat","sentiment":"BULLISH atau BEARISH atau NETRAL","rekomendasi":"strategi 2 kalimat","priceEst":"range nilai","pe":"rata-rata P/E","pbv":"rata-rata P/BV","divYield":"rata-rata yield","beta":"1.0","keunggulan":["poin1","poin2","poin3"],"risiko":["risiko1","risiko2","risiko3"],"katalis":["katalis1","katalis2"]}`
    : `Analisis saham ${clean} di BEI. Jawab HANYA JSON valid tanpa markdown: {"namaLengkap":"nama perusahaan","sektor":"sektor","summary":"analisis 3 kalimat","sentiment":"BELI atau TAHAN atau JUAL","rekomendasi":"rekomendasi 2 kalimat","priceEst":"harga wajar Rp","pe":"P/E ratio","pbv":"P/BV","divYield":"dividend yield %","beta":"beta","keunggulan":["k1","k2","k3"],"risiko":["r1","r2","r3"],"katalis":["k1","k2"]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    const body = await response.json();
    if (!response.ok) return res.status(502).json({ error: body.error?.message || 'Claude API error' });
    const raw = body.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
    return res.status(200).json(JSON.parse(raw));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
