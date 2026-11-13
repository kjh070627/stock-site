
export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").toUpperCase().trim();

  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
    return res.status(400).json({ error: "올바른 주식 티커를 입력해 주세요." });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!response.ok) throw new Error("주가 데이터를 가져오지 못했습니다.");

    const json = await response.json();
    const result = json?.chart?.result?.[0];

    if (!result) throw new Error("해당 종목을 찾을 수 없습니다.");

    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const closes = (quote.close || []).filter(Number.isFinite);

    const price = Number(meta.regularMarketPrice ?? closes.at(-1));
    const previous = Number(meta.chartPreviousClose ?? meta.previousClose ?? closes.at(-2) ?? price);

    if (!Number.isFinite(price)) throw new Error("주가 정보가 없습니다.");

    return res.status(200).json({
      symbol,
      name: meta.longName || meta.shortName || symbol,
      price,
      change: price - previous,
      changePercent: previous ? ((price - previous) / previous) * 100 : 0,
      volume: quote.volume?.filter(Number.isFinite).at(-1) ?? null,
      open: meta.regularMarketOpen ?? null,
      high52: meta.fiftyTwoWeekHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? null,
      exchange: meta.fullExchangeName || "US Market",
      currency: meta.currency || "USD",
      history: closes
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
}


