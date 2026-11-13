
export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").toUpperCase().trim();
  const date = String(req.query.date || "").trim();

  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
    return res.status(400).json({ error: "올바른 티커가 아닙니다." });
  }

  if (date && !/^\d{9,12}$/.test(date)) {
    return res.status(400).json({ error: "올바르지 않은 만기일입니다." });
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    const url =
      `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}` +
      (date ? `?date=${encodeURIComponent(date)}` : "");

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!response.ok) {
      throw new Error("옵션 데이터를 가져오지 못했습니다.");
    }

    const json = await response.json();
    const result = json?.optionChain?.result?.[0];

    if (!result) {
      throw new Error("옵션 체인 데이터가 없습니다.");
    }

    const expirationDates = result.expirationDates || [];
    const selected = result.options?.[0] || {};
    const puts = selected.puts || [];

    return res.status(200).json({
      symbol,
      underlyingPrice: result.quote?.regularMarketPrice ?? null,
      expirationDates,
      selectedExpiration: selected.expirationDate ?? null,
      puts: puts.map(option => ({
        contractSymbol: option.contractSymbol,
        strike: option.strike,
        bid: option.bid,
        ask: option.ask,
        lastPrice: option.lastPrice,
        impliedVolatility: option.impliedVolatility,
        openInterest: option.openInterest,
        volume: option.volume,
        inTheMoney: option.inTheMoney,
        contractSize: option.contractSize || "REGULAR"
      }))
    });
  } catch (error) {
    return res.status(502).json({
      error: error.message || "옵션 데이터를 불러오지 못했습니다."
    });
  }
}
