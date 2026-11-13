
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const symbol = String(req.query.symbol || "")
    .toUpperCase()
    .trim();

  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
    return res.status(400).json({
      error: "올바른 주식 티커를 입력해 주세요."
    });
  }

  async function getChart(range, interval) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      throw new Error("주가 데이터 조회에 실패했습니다.");
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      throw new Error("해당 종목의 데이터를 찾을 수 없습니다.");
    }

    return result;
  }

  try {
    const [dailyResult, minuteResult] =
      await Promise.allSettled([
        getChart("1mo", "1d"),
        getChart("1d", "1m")
      ]);

    const daily =
      dailyResult.status === "fulfilled"
        ? dailyResult.value
        : null;

    const minute =
      minuteResult.status === "fulfilled"
        ? minuteResult.value
        : null;

    const result = minute || daily;

    if (!result) {
      throw new Error("주가 데이터를 가져오지 못했습니다.");
    }

    const meta = result.meta || {};
    const dailyQuote = daily?.indicators?.quote?.[0] || {};
    const minuteQuote = minute?.indicators?.quote?.[0] || {};

    const history = (dailyQuote.close || [])
      .filter(Number.isFinite);

    const intraday = (minute?.timestamp || [])
      .map((time, i) => ({
        time: new Date(time * 1000).toISOString(),
        price: minuteQuote.close?.[i] ?? null,
        volume: minuteQuote.volume?.[i] ?? null
      }))
      .filter(item => Number.isFinite(item.price));

    const lastMinute = intraday.at(-1);
    const price = Number(
      meta.regularMarketPrice ??
      lastMinute?.price ??
      history.at(-1)
    );

    const previous = Number(
      meta.chartPreviousClose ??
      meta.previousClose ??
      history.at(-2) ??
      price
    );

    if (!Number.isFinite(price)) {
      throw new Error("유효한 주가 정보가 없습니다.");
    }

    const priceTime = meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : lastMinute?.time ?? null;

    return res.status(200).json({
      symbol,
      name: meta.longName || meta.shortName || symbol,
      price,
      change: price - previous,
      changePercent: previous
        ? ((price - previous) / previous) * 100
        : 0,
      volume: meta.regularMarketVolume ??
        dailyQuote.volume?.filter(Number.isFinite).at(-1) ??
        null,
      open: meta.regularMarketOpen ?? null,
      high52: meta.fiftyTwoWeekHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? null,
      exchange: meta.fullExchangeName || "US Market",
      currency: meta.currency || "USD",
      marketState: meta.marketState || "UNKNOWN",
      priceTime,
      provider: "Yahoo Finance",
      priceNote: "실시간 시세가 보장되지 않는 무료 데이터입니다.",
      history,
      intraday
    });

  } catch (error) {
    return res.status(502).json({
      error: error.message || "주가 조회 중 오류가 발생했습니다."
    });
  }
}

