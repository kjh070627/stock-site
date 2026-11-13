
const DEFAULT_SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL"];
const REFRESH_INTERVAL = 60 * 1000;

const names = {
  AAPL: "Apple", NVDA: "NVIDIA", MSFT: "Microsoft",
  TSLA: "Tesla", AMZN: "Amazon", GOOGL: "Alphabet",
  META: "Meta Platforms", AMD: "AMD", NFLX: "Netflix",
  COST: "Costco", AVGO: "Broadcom"
};

const $ = id => document.getElementById(id);

let stocks = {};
let selectedSymbol = null;
let watchlist = loadWatchlist();
let currentRange = "1mo";
let currentInterval = "1d";
let lastUpdated = null;
let refreshBusy = false;

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem("stockly-watchlist"));
    return Array.isArray(saved) ? saved : [...DEFAULT_SYMBOLS];
  } catch {
    return [...DEFAULT_SYMBOLS];
  }
}

function saveWatchlist() {
  localStorage.setItem("stockly-watchlist", JSON.stringify(watchlist));
}

function money(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function compact(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(value) {
  if (!value) return "시간 정보 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 정보 없음";
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setStatus(message, error = false) {
  const el = $("statusMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

async function fetchStock(symbol, range = "1mo", interval = "1d") {
  const url = `/api/stock?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`;
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "주가 데이터를 불러오지 못했어요.");
  }

  return data;
}

async function loadSymbols(symbols, showStatus = true) {
  const unique = [...new Set(
    symbols.map(s => s.toUpperCase().trim()).filter(Boolean)
  )];

  if (showStatus) setStatus("주가 데이터를 확인하고 있어요...");

  const results = await Promise.allSettled(
    unique.map(symbol => fetchStock(symbol))
  );

  let success = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      stocks[unique[index]] = result.value;
      success++;
    }
  });

  lastUpdated = new Date();

  renderGrid();

  if (showStatus) {
    if (success) {
      setStatus("데이터 제공처 기준 정보입니다. 시세는 지연될 수 있어요.");
    } else {
      setStatus("주가 데이터를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.", true);
    }
  }

  if (selectedSymbol && stocks[selectedSymbol]) {
    await refreshSelectedDetail();
  } else if (success) {
    const first = unique.find(s => stocks[s]);
    if (first) selectStock(first);
  }
}

function renderGrid() {
  const grid = $("stockGrid");
  if (!grid) return;

  if ($("watchCount")) {
    $("watchCount").textContent = `${watchlist.length}개 종목`;
  }

  const available = watchlist.filter(s => stocks[s]);

  if (!available.length) {
    grid.innerHTML = `<div class="empty-card">표시할 종목 데이터가 없어요. 티커를 검색해 추가해 보세요.</div>`;
    return;
  }

  grid.innerHTML = available.map(symbol => {
    const s = stocks[symbol];
    const up = s.changePercent >= 0;
    const saved = watchlist.includes(symbol);

    return `
      <article class="stock-card ${selectedSymbol === symbol ? "selected" : ""}" data-symbol="${symbol}">
        <div class="stock-top">
          <div class="stock-identity">
            <div class="ticker-logo">${symbol.slice(0, 2)}</div>
            <div>
              <div class="stock-name">${escapeHtml(s.name || names[symbol] || symbol)}</div>
              <div class="stock-symbol">${symbol}</div>
            </div>
          </div>
          <button class="star-button ${saved ? "saved" : ""}" data-star="${symbol}">
            ${saved ? "★" : "☆"}
          </button>
        </div>
        <div class="stock-price-row">
          <div class="stock-price">${money(s.price)}</div>
          <span class="stock-change ${up ? "positive" : "negative"}">
            ${up ? "+" : ""}${Number(s.changePercent).toFixed(2)}%
          </span>
        </div>
        <div class="stock-meta">
          전일 대비 ${s.change >= 0 ? "+" : ""}${money(s.change)}
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll(".stock-card").forEach(card => {
    card.addEventListener("click", () => selectStock(card.dataset.symbol));
  });

  grid.querySelectorAll("[data-star]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      toggleWatch(btn.dataset.star);
    });
  });
}

function toggleWatch(symbol) {
  watchlist = watchlist.includes(symbol)
    ? watchlist.filter(s => s !== symbol)
    : [...watchlist, symbol];

  saveWatchlist();
  renderGrid();

  if (selectedSymbol === symbol && $("addWatchBtn")) {
    $("addWatchBtn").textContent = watchlist.includes(symbol)
      ? "★ 관심 종목 저장됨"
      : "☆ 관심 종목 추가";
  }
}

function selectStock(symbol) {
  selectedSymbol = symbol;

  document.dispatchEvent(new CustomEvent("stock-selected", {
    detail: { symbol }
  }));

  currentRange = "1mo";
  currentInterval = "1d";

  renderGrid();

  if ($("detailTitle")) {
    const s = stocks[symbol];
    $("detailTitle").textContent = `${s?.name || names[symbol] || symbol} (${symbol})`;
  }

  if ($("addWatchBtn")) {
    $("addWatchBtn").disabled = false;
    $("addWatchBtn").textContent = watchlist.includes(symbol)
      ? "★ 관심 종목 저장됨"
      : "☆ 관심 종목 추가";
  }

  renderDetail(symbol);

  if ($("detailSection")) {
    $("detailSection").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

async function refreshSelectedDetail() {
  if (!selectedSymbol) return;

  try {
    const data = await fetchStock(
      selectedSymbol,
      currentRange,
      currentInterval
    );

    stocks[selectedSymbol] = {
      ...stocks[selectedSymbol],
      ...data
    };

    renderGrid();
    renderDetail(selectedSymbol);
  } catch (error) {
    console.warn("상세 차트 갱신 실패:", error.message);
  }
}

function renderDetail(symbol) {
  const s = stocks[symbol];
  if (!s || !$("detailContent")) return;

  const up = s.changePercent >= 0;
  const candles = s.candles || [];

  $("detailContent").innerHTML = `
    <div class="mp-detail">
      <div class="mp-price-card">
        <div class="mp-price-label">현재가</div>
        <div class="mp-big-price">${money(s.price)}</div>
        <div class="mp-price-change ${up ? "up" : "down"}">
          ${up ? "+" : ""}${money(s.change)}
          (${up ? "+" : ""}${Number(s.changePercent).toFixed(2)}%)
        </div>
        <div class="mp-update">데이터 기준 시각 · ${formatTime(s.priceTime)}</div>
      </div>

      <div class="mp-chart-card">
        <div class="mp-chart-heading">
          <div>
            <strong>주가 차트</strong>
            <span>USD</span>
          </div>
          <div class="mp-chart-price" id="mpHoverPrice">${money(s.price)}</div>
        </div>

        <div class="mp-periods">
          ${[
            ["1d", "1일", "1m"],
            ["5d", "1주", "5m"],
            ["1mo", "1개월", "15m"],
            ["3mo", "3개월", "1h"],
            ["1y", "1년", "1d"],
            ["5y", "전체", "1wk"]
          ].map(([range, label, interval]) => `
            <button class="mp-period ${currentRange === range ? "active" : ""}"
              data-range="${range}" data-interval="${interval}">${label}</button>
          `).join("")}
        </div>

        <div class="mp-chart-info" id="mpCandleInfo">
          캔들을 선택하면 시가·고가·저가·종가를 확인할 수 있어요.
        </div>

        <div class="mp-chart-container" id="mpChartContainer">
          ${drawCandlestickChart(candles)}
        </div>

        <div class="mp-chart-legend">
          <span><i class="mp-dot red"></i> 상승</span>
          <span><i class="mp-dot blue"></i> 하락</span>
          <span>거래량</span>
        </div>

        <div class="mp-chart-note">
          무료 데이터 제공처 기준이며 실시간 체결 가격과 차이가 있을 수 있어요.
        </div>
      </div>

      <div class="mp-stats-card">
        <h3>주요 주가 정보</h3>
        <div class="mp-stats-grid">
          <div><span>시가</span><strong>${money(s.open)}</strong></div>
          <div><span>거래량</span><strong>${compact(s.volume)}</strong></div>
          <div><span>52주 최고</span><strong>${money(s.high52)}</strong></div>
          <div><span>52주 최저</span><strong>${money(s.low52)}</strong></div>
        </div>
        <div class="mp-exchange">${escapeHtml(s.exchange || "미국 시장")} · ${escapeHtml(s.currency || "USD")}</div>
      </div>
    </div>
  `;

  attachChartEvents();
}

function drawCandlestickChart(candles) {
  if (!candles || candles.length < 2) {
    return `<div class="mp-no-chart">차트 데이터가 충분하지 않습니다.</div>`;
  }

  const width = 900;
  const height = 330;
  const left = 12;
  const right = 72;
  const top = 18;
  const chartBottom = 245;
  const volumeBottom = 310;
  const chartWidth = width - left - right;

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const priceRange = maxPrice - minPrice || 1;
  const maxVolume = Math.max(1, ...candles.map(c => c.volume || 0));

  const y = value =>
    top + ((maxPrice - value) / priceRange) * (chartBottom - top);

  const step = chartWidth / candles.length;
  const candleWidth = Math.max(2, Math.min(12, step * 0.62));

  let svg = `
    <svg class="mp-candle-svg" viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="none" role="img" aria-label="주가 캔들 차트">
      <defs>
        <clipPath id="mpChartClip">
          <rect x="${left}" y="${top}" width="${chartWidth}" height="${volumeBottom - top}"/>
        </clipPath>
      </defs>
  `;

  for (let i = 0; i <= 4; i++) {
    const price = maxPrice - priceRange * i / 4;
    const yy = y(price);

    svg += `
      <line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"
        stroke="#edf0f3" stroke-width="1"/>
      <text x="${width - right + 8}" y="${yy + 4}"
        fill="#8b95a1" font-size="12">${price.toFixed(2)}</text>
    `;
  }

  svg += `<g clip-path="url(#mpChartClip)">`;

  candles.forEach((c, i) => {
    const x = left + i * step + step / 2;
    const rising = c.close >= c.open;
    const color = rising ? "#e34b50" : "#3182f6";
    const bodyTop = y(Math.max(c.open, c.close));
    const bodyBottom = y(Math.min(c.open, c.close));
    const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
    const volumeHeight = ((c.volume || 0) / maxVolume) * 55;
    const volumeY = volumeBottom - volumeHeight;

    svg += `
      <g class="mp-candle" data-index="${i}" tabindex="0"
        role="button" aria-label="${new Date(c.time * 1000).toLocaleString("ko-KR")}">
        <line x1="${x}" y1="${y(c.high)}" x2="${x}" y2="${y(c.low)}"
          stroke="${color}" stroke-width="1.4"/>
        <rect x="${x - candleWidth / 2}" y="${bodyTop}"
          width="${candleWidth}" height="${bodyHeight}"
          fill="${color}" rx="0.7"/>
        <rect x="${x - Math.max(2, step / 2)}" y="${volumeY}"
          width="${Math.max(1, step - 1)}" height="${volumeHeight}"
          fill="${color}" opacity=".23"/>
      </g>
    `;
  });

  svg += `</g>`;

  const firstDate = new Date(candles[0].time * 1000);
  const lastDate = new Date(candles[candles.length - 1].time * 1000);

  svg += `
    <text x="${left}" y="328" fill="#8b95a1" font-size="11">
      ${firstDate.toLocaleDateString("ko-KR")}
    </text>
    <text x="${width - right}" y="328" text-anchor="end"
      fill="#8b95a1" font-size="11">
      ${lastDate.toLocaleDateString("ko-KR")}
    </text>
    </svg>
  `;

  return svg;
}

function attachChartEvents() {
  const container = $("mpChartContainer");
  if (!container) return;

  const candles = stocks[selectedSymbol]?.candles || [];

  container.querySelectorAll(".mp-candle").forEach(el => {
    const show = () => {
      const c = candles[Number(el.dataset.index)];
      if (!c) return;

      const date = new Date(c.time * 1000).toLocaleString("ko-KR");
      const info = $("mpCandleInfo");

      if (info) {
        info.innerHTML = `
          <span>${date}</span>
          <span>시 ${money(c.open)}</span>
          <span>고 ${money(c.high)}</span>
          <span>저 ${money(c.low)}</span>
          <span>종 ${money(c.close)}</span>
        `;
      }

      const price = $("mpHoverPrice");
      if (price) price.textContent = money(c.close);
    };

    el.addEventListener("mouseenter", show);
    el.addEventListener("focus", show);
    el.addEventListener("click", show);
  });

  document.querySelectorAll(".mp-period").forEach(btn => {
    btn.addEventListener("click", async () => {
      currentRange = btn.dataset.range;
      currentInterval = btn.dataset.interval;

      document.querySelectorAll(".mp-period").forEach(b =>
        b.classList.toggle("active", b === btn)
      );

      const info = $("mpCandleInfo");
      if (info) info.textContent = "차트 데이터를 불러오고 있어요...";

      try {
        const data = await fetchStock(
          selectedSymbol,
          currentRange,
          currentInterval
        );

        stocks[selectedSymbol] = {
          ...stocks[selectedSymbol],
          ...data
        };

        renderDetail(selectedSymbol);
        renderGrid();
      } catch (error) {
        if (info) info.textContent = error.message;
      }
    });
  });
}

function addChartStyles() {
  if ($("mpChartStyles")) return;

  const style = document.createElement("style");
  style.id = "mpChartStyles";

  style.textContent = `
    .mp-detail { display:grid; gap:14px; color:#191f28; }
    .mp-price-card,.mp-chart-card,.mp-stats-card {
      background:#fff; border:1px solid #eef0f2;
      border-radius:18px; padding:22px;
    }
    .mp-price-label { color:#8b95a1; font-size:13px; margin-bottom:8px; }
    .mp-big-price { font-size:34px; font-weight:750; letter-spacing:-1.2px; }
    .mp-price-change { margin-top:5px; font-size:15px; font-weight:650; }
    .mp-price-change.up { color:#e34b50; }
    .mp-price-change.down { color:#3182f6; }
    .mp-update { color:#929ba6; font-size:12px; margin-top:12px; }
    .mp-chart-heading { display:flex; justify-content:space-between; align-items:center; }
    .mp-chart-heading strong { font-size:18px; }
    .mp-chart-heading span { color:#929ba6; font-size:12px; margin-left:8px; }
    .mp-chart-price { font-size:16px; font-weight:700; }
    .mp-periods { display:flex; gap:7px; flex-wrap:wrap; margin:20px 0 12px; }
    .mp-period {
      border:0; background:#f3f5f7; color:#68717d;
      padding:8px 13px; border-radius:9px; cursor:pointer;
      font-size:13px; font-weight:600;
    }
    .mp-period.active { background:#eaf2ff; color:#2878e8; }
    .mp-chart-info {
      min-height:28px; display:flex; gap:12px; flex-wrap:wrap;
      align-items:center; color:#7b8490; font-size:12px; margin-bottom:8px;
    }
    .mp-chart-container { width:100%; overflow:hidden; }
    .mp-candle-svg { display:block; width:100%; height:auto; min-height:220px; }
    .mp-candle { cursor:crosshair; outline:none; }
    .mp-candle:focus rect { stroke:#191f28; stroke-width:1; }
    .mp-chart-legend { display:flex; gap:16px; color:#929ba6; font-size:12px; margin-top:8px; }
    .mp-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:5px; }
    .mp-dot.red { background:#e34b50; }
    .mp-dot.blue { background:#3182f6; }
    .mp-chart-note { color:#9aa2ad; font-size:11px; margin-top:12px; line-height:1.5; }
    .mp-stats-card h3 { font-size:17px; margin:0 0 18px; }
    .mp-stats-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px 12px; }
    .mp-stats-grid div { display:flex; flex-direction:column; gap:6px; }
    .mp-stats-grid span { color:#8b95a1; font-size:12px; }
    .mp-stats-grid strong { font-size:15px; font-weight:650; }
    .mp-exchange { border-top:1px solid #eef0f2; padding-top:14px; margin-top:18px; color:#929ba6; font-size:12px; }
    .mp-no-chart { padding:50px 10px; text-align:center; color:#929ba6; }
    @media(max-width:600px) {
      .mp-price-card,.mp-chart-card,.mp-stats-card { padding:16px; border-radius:15px; }
      .mp-big-price { font-size:29px; }
      .mp-chart-info { gap:7px; font-size:11px; }
      .mp-period { padding:7px 10px; }
    }
  `;

  document.head.appendChild(style);
}

function setupApp() {
  addChartStyles();

  $("searchForm")?.addEventListener("submit", async e => {
    e.preventDefault();

    const symbol = $("symbolInput").value
      .trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");

    if (!symbol) return;

    setStatus(`${symbol} 데이터를 찾고 있어요...`);

    try {
      const data = await fetchStock(symbol);
      stocks[symbol] = data;

      if (!watchlist.includes(symbol)) {
        watchlist.unshift(symbol);
        saveWatchlist();
      }

      renderGrid();
      selectStock(symbol);
      $("symbolInput").value = "";
      setStatus("종목 데이터를 불러왔어요.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  document.querySelectorAll("[data-symbol]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const symbol = btn.dataset.symbol;

      if (!watchlist.includes(symbol)) {
        watchlist.unshift(symbol);
        saveWatchlist();
      }

      if (!stocks[symbol]) await loadSymbols([symbol]);
      if (stocks[symbol]) selectStock(symbol);
    });
  });

  $("addWatchBtn")?.addEventListener("click", () => {
    if (selectedSymbol) toggleWatch(selectedSymbol);
  });

  $("watchlistNav")?.addEventListener("click", () => {
    $("stockGrid")?.scrollIntoView({ behavior: "smooth" });
  });

  loadSymbols(watchlist);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && selectedSymbol) {
    loadSymbols(watchlist, false);
  }
});

setInterval(() => {
  if (document.hidden || refreshBusy) return;

  refreshBusy = true;

  loadSymbols(watchlist, false)
    .finally(() => {
      refreshBusy = false;
    });
}, REFRESH_INTERVAL);

setupApp();
