export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {

    const { ticker } = req.body;

    if (!ticker) {
      return res.status(400).json({
        error: 'Ticker kosong'
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    const prompt = `
Analisis saham ${ticker}.

Jawab HANYA JSON valid:

{
  "namaLengkap":"nama perusahaan",
  "sektor":"sektor",
  "summary":"analisis singkat",
  "sentiment":"BELI/Tahan/JUAL",
  "rekomendasi":"rekomendasi",
  "priceEst":"harga wajar",
  "pe":"P/E",
  "pbv":"P/BV",
  "divYield":"yield"
}
`;

    const response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },

        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',

          max_tokens: 500,

          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      }
    );

    const data = await response.json();

    const raw = data.content[0].text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(raw);

    return res.status(200).json(parsed);

  } catch (err) {

    return res.status(500).json({
      error: err.message
    });

  }
}
