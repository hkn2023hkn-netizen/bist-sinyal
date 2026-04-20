// netlify/functions/bist.js
// Sunucu taraflı Yahoo Finance proxy
// Netlify sunucusundan çağrıldığı için CORS engeli YOK

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  const ticker = event.queryStringParameters?.ticker;
  if (!ticker) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticker required' }) };
  }

  // BIST hisseleri Yahoo'da .IS uzantısıyla gelir: GARAN.IS
  const symbol = ticker.includes('.') ? ticker : `${ticker}.IS`;

  // Yahoo Finance v8 — günlük kapanış, son 60 gün
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=60d`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('NO_DATA');

    const meta   = result.meta;
    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp || [];
    const closes = quotes?.close || [];
    const opens  = quotes?.open  || [];
    const highs  = quotes?.high  || [];
    const lows   = quotes?.low   || [];

    // Geçerli (null olmayan) son kapanış değerleri
    const validCloses = closes.filter(v => v !== null && v !== undefined);
    if (validCloses.length < 2) throw new Error('INSUFFICIENT_DATA');

    const lastClose = validCloses[validCloses.length - 1];
    const prevClose = validCloses[validCloses.length - 2];
    const changePercent = ((lastClose - prevClose) / prevClose) * 100;

    // Son geçerli open/high/low
    const lastIdx = closes.length - 1 - [...closes].reverse().findIndex(v => v !== null);
    const lastOpen = opens[lastIdx]  || lastClose;
    const lastHigh = highs[lastIdx]  || lastClose;
    const lastLow  = lows[lastIdx]   || lastClose;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ticker: symbol,
        price:        lastClose,
        prevClose,
        change:       changePercent,
        open:         lastOpen,
        high:         lastHigh,
        low:          lastLow,
        closes:       validCloses,          // RSI hesabı için
        currency:     meta.currency || 'TRY',
        marketState:  meta.marketState || 'CLOSED',
        regularMarketPrice: meta.regularMarketPrice || lastClose,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message, ticker: symbol }),
    };
  }
};
