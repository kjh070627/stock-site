
const DEFAULT_SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL"];

const names = {
  AAPL: "Apple", NVDA: "NVIDIA", MSFT: "Microsoft",
  TSLA: "Tesla", AMZN: "Amazon", GOOGL: "Alphabet",
  META: "Meta Platforms", AMD: "AMD", NFLX: "Netflix",
  COST: "Costco", AVGO: "Broadcom"
};

const $ = (id) => document.getElementById(id);

let stocks = {};
let selectedSymbol = null;
let watchlist = loadWatchlist();
let refreshInProgress = false;
let lastChecked = null;

const REFRESH_INTERVAL = 60 * 1000;

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem("stockly-watchlist")) || DEFAULT_SYMBOLS;
  } catch {
    return DEFAULT_SYMBOLS;
  }
}

function saveWatchlist() {
  localStorage.setItem("stockly-watchlist", JSON.stringify(watchlist));
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function compact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function setStatus(message, error = false) {
  $("statusMessage").textContent = message;
  $("statusMessage").classList.toggle("error", error);
}

function formatTime(value) {
  if (!value) return "시간 정보 없음";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "시간 정보 없음";

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

async function fetchStock(symbol) {
  const response = await fetch(
    `/api/stock?symbol=${encodeURIComponent(symbol)}`,
    { cache: "no-store" }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "주가 데이터를 불러오지 못했어요.");
  }

  return data;
}

async function loadSymbols(symbols, silent = false) {
  if (refreshInProgress) return;

  refreshInProgress = true;

  if (!silent) {
    setStatus("주가 데이터를 확인하고 있어요...");
  }

  const unique = [
    ...new Set(
      symbols.map(s => s.toUpperCase().trim()).filter(Boolean)
    )
  ];

  try {
    const results = await Promise.allSettled(unique.map(fetchStock));

    let success = 0;

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        stocks[unique[index]] = result.value;
        success++;
      }
    });

    lastChecked = new Date();

    renderGrid();

    if (selectedSymbol && stocks[selectedSymbol]) {
      renderDetail(selectedSymbol);
    } else if (success) {
      const first = unique.find(s => stocks[s]);
      if (first) renderDetail(first);
    }

    if (success) {
      setStatus(
        `주가 데이터 확인 완료 · 마지막 조회 ${formatTime(lastChecked)} · 시세는 지연될 수 있어요.`
      );
    } else if (!silent) {
      setStatus(
        "현재 주가 데이터를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
        true
      );
    }
  } finally {
    refreshInProgress = false;
  }
}

function renderGrid() {
  const grid = $("stockGrid");

  $("watchCount").textContent = `${watchlist.length}개 종목`;

  const available = watchlist.filter(s => stocks[s]);

  if (!available.length) {
    grid.innerHTML = `
      <div class="empty-card">
        표시할 종목 데이터가 없어요. 티커를 검색해 추가해 보세요.
      </div>`;
    return;
  }

  grid.innerHTML = available.map(symbol => {
    const s = stocks[symbol];
    const up = s.changePercent >= 0;
    const saved = watchlist.includes(symbol);

    return `
      <article class="stock-card ${selectedSymbol === symbol ? "selected" : ""}"
        data-symbol="${symbol}">

        <div class="stock-top">
          <div class="stock-identity">
            <div class="ticker-logo">${symbol.slice(0, 2)}</div>
            <div>
              <div class="stock-name">${escapeHtml(s.name || names[symbol] || symbol)}</div>
              <div class="stock-symbol">${symbol}</div>
            </div>
          </div>

          <button class="star-button ${saved ? "saved" : ""}"
            data-star="${symbol}"
            aria-label="관심 종목 ${saved ? "해제" : "추가"}">
            ${saved ? "★" : "☆"}
          </button>
        </div>

        <div class="stock-price-row">
          <div class="stock-price">${money(s.price)}</div>
          <span class="stock-change ${up ? "positive" : "negative"}">
            ${up ? "+" : ""}${s.changePercent.toFixed(2)}%
          </span>
        </div>

        <div class="stock-meta">
          전일 대비 ${s.change >= 0 ? "+" : ""}${money(s.change)}
        </div>
      </article>`;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function toggleWatch(symbol) {
  watchlist = watchlist.includes(symbol)
    ? watchlist.filter(s => s !== symbol)
    : [...watchlist, symbol];

  saveWatchlist();
  renderGrid();

  if (selectedSymbol === symbol) {
    $("addWatchBtn").textContent =
      watchlist.includes(symbol)
        ? "★ 관심 종목 저장됨"
        : "☆ 관심 종목 추가";
  }
}

function selectStock(symbol) {
  selectedSymbol = symbol;
  renderGrid();
  renderDetail(symbol);

  $("detailSection").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderDetail(symbol) {
  const s = stocks[symbol];

  if (!s) return;

  const up = s.changePercent >= 0;

  $("detailTitle").textContent =
    `${s.name || names[symbol] || symbol} (${symbol})`;

  $("addWatchBtn").disabled = false;

  $("addWatchBtn").textContent =
    watchlist.includes(symbol)
      ? "★ 관심 종목 저장됨"
      : "☆ 관심 종목 추가";

  const values = s.history || [];

  const points = values.map((v, i) =>
    `${values.length < 2 ? 0 : i / (values.length - 1) * 600},${145 - (v / Math.max(...values) * 125)}`
  ).join(" ");

  const min = s.low52 ? money(s.low52) : "정보 없음";
  const max = s.high52 ? money(s.high52) : "정보 없음";

  $("detailContent").innerHTML = `
    <div class="detail-layout">

      <div class="detail-card">
        <h3>주가 흐름 <span class="subtle">· 최근 1개월</span></h3>

        <div>
          <span class="big-price">${money(s.price)}</span>
          <span class="big-change ${up ? "positive" : "negative"}">
            ${up ? "+" : ""}${money(s.change)}
            (${up ? "+" : ""}${s.changePercent.toFixed(2)}%)
          </span>
        </div>

        <div class="chart-wrap">
          <svg viewBox="0 0 600 160"
            preserveAspectRatio="none"
            role="img"
            aria-label="최근 주가 차트">

            <defs>
              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#3182f6" stop-opacity=".18"/>
                <stop offset="100%" stop-color="#3182f6" stop-opacity="0"/>
              </linearGradient>
            </defs>

            <path class="chart-grid"
              d="M0 35H600 M0 80H600 M0 125H600"/>

            ${values.length > 1
              ? `<polygon class="chart-fill" points="0,160 ${points} 600,160"/>
                 <polyline class="chart-line" points="${points}"/>`
              : `<text x="300" y="80" text-anchor="middle"
                   fill="#9aa4b2" font-size="12">차트 데이터 없음</text>`
            }
          </svg>
        </div>

        <div class="subtle">
          데이터 기준 시각: ${formatTime(s.priceTime)}
        </div>
        <div class="subtle">
          무료 데이터 제공처 기준이며 실시간 시세가 보장되지는 않아요.
        </div>
      </div>

      <div class="detail-card">
        <h3>주요 지표</h3>

        <div class="stats-grid">
          <div class="stat">
            <span>거래량</span>
            <strong>${s.volume ? compact(s.volume) : "—"}</strong>
          </div>

          <div class="stat">
            <span>시가</span>
            <strong>${s.open ? money(s.open) : "—"}</strong>
          </div>

          <div class="stat">
            <span>52주 최고</span>
            <strong>${max}</strong>
          </div>

          <div class="stat">
            <span>52주 최저</span>
            <strong>${min}</strong>
          </div>
        </div>

        <p class="detail-company">
          ${escapeHtml(s.exchange || "미국 시장")}
          · ${escapeHtml(s.currency || "USD")}
        </p>
      </div>

    </div>`;
}

$("searchForm").addEventListener("submit", async e => {
  e.preventDefault();

  const symbol = $("symbolInput").value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.-]/g, "");

  if (!symbol) return;

  setStatus(`${symbol} 데이터를 찾고 있어요...`);

  try {
    const data = await fetchStock(symbol);

    stocks[symbol] = data;

    if (!watchlist.includes(symbol)) {
      watchlist.unshift(symbol);
    }

    saveWatchlist();
    renderGrid();
    selectStock(symbol);

    $("symbolInput").value = "";

    lastChecked = new Date();

    setStatus(
      `${symbol} 조회 완료 · 마지막 조회 ${formatTime(lastChecked)}`
    );
  } catch (err) {
    setStatus(err.message, true);
  }
});

document.querySelectorAll("[data-symbol]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const symbol = btn.dataset.symbol;

    if (!watchlist.includes(symbol)) {
      watchlist.unshift(symbol);
      saveWatchlist();
    }

    if (!stocks[symbol]) {
      await loadSymbols([symbol]);
    }

    if (stocks[symbol]) {
      renderGrid();
      selectStock(symbol);
    }
  });
});

$("addWatchBtn").addEventListener("click", () => {
  if (selectedSymbol) toggleWatch(selectedSymbol);
});

$("watchlistNav").addEventListener("click", () => {
  $("stockGrid").scrollIntoView({
    behavior: "smooth"
  });
});

// 처음 접속하면 관심 종목 불러오기
loadSymbols(watchlist);

// 60초마다 관심 종목 가격 자동 갱신
setInterval(() => {
  if (document.visibilityState === "visible") {
    loadSymbols(watchlist, true);
  }
}, REFRESH_INTERVAL);

// 브라우저로 돌아왔을 때 가격 갱신
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadSymbols(watchlist, true);
  }
});
atchBtn").addEventListener("click",()=>{if(selectedSymbol) toggleWatch(selectedSymbol);});
$("watchlistNav").addEventListener("click",()=>$("stockGrid").scrollIntoView({behavior:"smooth"}));
loadSymbols(watchlist);
