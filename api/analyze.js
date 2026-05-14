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

    // =========================
    // YAHOO FINANCE
    // =========================

    const symbol =
      ticker.toUpperCase() + '.JK';

    const marketResponse =
      await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
      );

    const marketData =
      await marketResponse.json();

    const result =
      marketData.chart.result[0];

    const meta =
      result.meta;

    const currentPrice =
      meta.regularMarketPrice;

    const previousClose =
      meta.previousClose;

    const change =
      (
        (
          currentPrice -
          previousClose
        ) /
        previousClose
      ) * 100;

    // =========================
    // AI ANALYSIS
    // =========================

    const apiKey =
      process.env.ANTHROPIC_API_KEY;

    const prompt = `
Kamu adalah analis saham Indonesia profesional.

Data saham:

Ticker: ${ticker}
Harga sekarang: ${currentPrice}
Previous close: ${previousClose}
Perubahan: ${change.toFixed(2)}%

Berikan analisis profesional.

Jawab HANYA JSON valid:

{
  "summary":"analisis singkat",
  "sentiment":"BELI/TAHAN/JUAL",
  "rekomendasi":"strategi",
  "priceEst":"estimasi harga"
}
`;

    const aiResponse =
      await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method:'POST',

          headers:{
            'Content-Type':'application/json',
            'x-api-key':apiKey,
            'anthropic-version':'2023-06-01'
          },

          body:JSON.stringify({

            model:'claude-3-5-sonnet-20241022',

            max_tokens:500,

            messages:[
              {
                role:'user',
                content:prompt
              }
            ]

          })

        }
      );

    const aiData =
      await aiResponse.json();

    const raw =
      aiData.content[0].text
      .replace(/```json/g,'')
      .replace(/```/g,'')
      .trim();

    const parsed =
      JSON.parse(raw);

    return res.status(200).json({

      ticker,

      currentPrice,

      previousClose,

      change:
        change.toFixed(2),

      ...parsed

    });

  } catch(err){

    return res.status(500).json({
      error: err.message
    });

  }

}
