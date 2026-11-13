
export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").toUpperCase().trim();

  const ranges = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y"];
  const intervals = ["1m", "5m", "15m", "1h", "1d", "1wk"];

  const range = ranges.includes(req.query.range) ? req.query.range : "1mo";
  const interval = intervals.includes(req.query.interval) ? req.query.interval : "1d";

  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
    return res.status(400).json({ error: "올바른 주식 티커를 입력해 주세요." });
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=${range}&interval=${interval}&includePrePost=false`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!response.ok) {
      throw new Error("주가 데이터를 가져오지 못했습니다.");
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      throw new Error("해당 종목의 차트 데이터가 없습니다.");
    }

    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];

    const candles = timestamps.map((time, i) => ({
      time,
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i] ?? 0
    })).filter(c =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    );

    const last = candles[candles.length - 1];
    const price = Number(meta.regularMarketPrice ?? last?.close);
    const previous = Number(
      meta.chartPreviousClose ?? meta.previousClose ?? price
    );

    if (!Number.isFinite(price)) {
      throw new Error("주가 정보가 없습니다.");
    }

    return res.status(200).json({
      symbol,
      name: meta.longName || meta.shortName || symbol,
      price,
      change: price - previous,
      changePercent: previous ? ((price - previous) / previous) * 100 : 0,
      volume: last?.volume ?? null,
      open: meta.regularMarketOpen ?? last?.open ?? null,
      high52: meta.fiftyTwoWeekHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? null,
      exchange: meta.fullExchangeName || "US Market",
      currency: meta.currency || "USD",
      marketState: meta.marketState || "",
      priceTime: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : null,
      candles
    });
  } catch (error) {
    return res.status(502).json({
      error: error.message || "주가 데이터를 불러오지 못했습니다."
    });
  }
}
