// 티커를 받아 SEC EDGAR 공시 데이터로 재무 지표를 계산해 돌려주는 서버리스 함수
const UA = process.env.SEC_UA || "StockSite contact@example.com";
let tickerMap = null; // 함수가 살아 있는 동안 재사용

async function sec(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("SEC " + r.status);
  return r.json();
}

async function findCompany(ticker) {
  if (!tickerMap) {
    const raw = await sec("https://www.sec.gov/files/company_tickers.json");
    tickerMap = {};
    for (const k in raw) {
      tickerMap[raw[k].ticker.toUpperCase().replace(".", "-")] = {
        cik: String(raw[k].cik_str).padStart(10, "0"),
        title: raw[k].title,
      };
    }
  }
  return tickerMap[ticker.replace(".", "-")];
}

const DAY = 86400000;

// 여러 태그를 우선순위대로 보면서 {연도: 값}으로 모으기 (연간 값만)
function pick(facts, tags, instant) {
  const out = {};
  for (const tag of tags) {
    const items = facts[tag] && facts[tag].units && facts[tag].units.USD;
    if (!items) continue;
    const byEnd = {};
    for (const it of items) {
      if (it.form !== "10-K" && it.form !== "10-K/A") continue;
      if (!instant) {
        const days = (new Date(it.end) - new Date(it.start)) / DAY;
        if (days < 350 || days > 380) continue;
      }
      if (!byEnd[it.end] || it.filed > byEnd[it.end].filed) byEnd[it.end] = it;
    }
    for (const end in byEnd) {
      const y = end.slice(0, 4);
      if (!(y in out)) out[y] = byEnd[end].val;
    }
  }
  return out;
}

const ratio = (a, b) => {
  const o = {};
  for (const y in a) if (b[y]) o[y] = Math.round((a[y] / b[y]) * 1000) / 10;
  return o;
};

const lastN = (o, n = 5) => {
  const r = {};
  Object.keys(o).sort().slice(-n).forEach((y) => (r[y] = o[y]));
  return r;
};

module.exports = async (req, res) => {
  const ticker = String(req.query.ticker || "").toUpperCase().trim();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker))
    return res.status(400).json({ error: "티커 형식이 올바르지 않아요. 예: AAPL" });

  try {
    const co = await findCompany(ticker);
    if (!co) return res.status(404).json({ error: ticker + " 종목을 찾지 못했어요. 미국 상장 티커인지 확인해 주세요." });

    const [facts, sub] = await Promise.all([
      sec(`https://data.sec.gov/api/xbrl/companyfacts/CIK${co.cik}.json`),
      sec(`https://data.sec.gov/submissions/CIK${co.cik}.json`),
    ]);
    const g = (facts.facts && facts.facts["us-gaap"]) || {};

    const revenue = pick(g, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"], false);
    if (!Object.keys(revenue).length)
      return res.status(422).json({ error: "재무 데이터가 없는 종목이에요. ETF이거나 보고 형식이 달라 분석이 어려울 수 있어요." });

    const gross = pick(g, ["GrossProfit"], false);
    const opInc = pick(g, ["OperatingIncomeLoss"], false);
    const net = pick(g, ["NetIncomeLoss"], false);
    const equity = pick(g, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], true);
    const ltd = pick(g, ["LongTermDebt"], true);
    const ltdNon = pick(g, ["LongTermDebtNoncurrent"], true);
    const cur = pick(g, ["DebtCurrent", "LongTermDebtCurrent"], true);
    const debt = {};
    for (const y of new Set([...Object.keys(ltd), ...Object.keys(ltdNon)])) {
      debt[y] = y in ltd ? ltd[y] : ltdNon[y] + (cur[y] || 0);
    }

    // 하루 동안 CDN에 저장해 SEC 요청을 줄임
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json({
      ticker,
      name: co.title,
      sector: sub.sicDescription || "",
      summary: "",
      revenue: lastN(revenue),
      gross_margin_pct: lastN(ratio(gross, revenue)),
      operating_margin_pct: lastN(ratio(opInc, revenue)),
      roe_pct: lastN(ratio(net, equity)),
      debt_to_equity_pct: lastN(ratio(debt, equity)),
    });
  } catch (e) {
    res.status(502).json({ error: "데이터를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
};
