
(() => {
  const state = {
    symbol: null,
    spot: 0,
    capital: 10000,
    safe: 40,
    balanced: 35,
    tail: 25,
    budgetPct: 3,
    expirations: [],
    puts: [],
    expiry: null,
    selections: {},
    loading: false,
    error: ""
  };

  const groups = [
    { id: "safe", name: "안정형", color: "#16a36a", target: 0.95 },
    { id: "balanced", name: "절충형", color: "#3182f6", target: 0.82 },
    { id: "tail", name: "폭락 대비형", color: "#9865df", target: 0.65 }
  ];

  const $ = id => document.getElementById(id);

  const money = n => Number.isFinite(Number(n))
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2
      }).format(n)
    : "—";

  const number = n => new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(n);

  const esc = s => String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);

  function ensurePanel() {
    if ($("hedgeLab")) return;

    const detail = $("detailSection");
    if (!detail) return;

    detail.insertAdjacentHTML("afterend", `
      <section id="hedgeLab" class="hl">
        <div class="hl-header">
          <div>
            <div class="hl-kicker">MARKET PICK · STRATEGY</div>
            <h2>HEDGE LAB</h2>
            <p>현물과 풋옵션을 조합해 하락 위험을 분석합니다.</p>
          </div>
          <span class="hl-live">전략 분석</span>
        </div>

        <div class="hl-card">
          <h3>투자 설정</h3>

          <label class="hl-label" for="hlCapital">현물 투자금 (USD)</label>
          <input id="hlCapital" type="number" min="100" step="100"
            value="10000" class="hl-input"/>

          <div class="hl-row">
            <label class="hl-label" for="hlBudget">풋옵션 보험료 예산</label>
            <strong id="hlBudgetText">3%</strong>
          </div>
          <input id="hlBudget" type="range" min="0.5" max="10"
            step="0.5" value="3" class="hl-range"/>
          <div class="hl-muted">
            선택한 만기 기준 총 보험료 예산:
            <strong id="hlBudgetMoney">$300</strong>
          </div>

          <div class="hl-divider"></div>
          <h3>헷지 비중 조절</h3>
          <p class="hl-muted">세 유형의 비중 합계는 100%로 유지됩니다.</p>

          <div class="hl-weight">
            <div class="hl-row">
              <label for="hlSafe">안정형</label>
              <strong id="hlSafeText">40%</strong>
            </div>
            <input id="hlSafe" type="range" min="0" max="100"
              value="40" class="hl-range"/>
          </div>

          <div class="hl-weight">
            <div class="hl-row">
              <label for="hlBalanced">절충형</label>
              <strong id="hlBalancedText">35%</strong>
            </div>
            <input id="hlBalanced" type="range" min="0" max="100"
              value="35" class="hl-range"/>
          </div>

          <div class="hl-weight">
            <div class="hl-row">
              <label for="hlTail">초저가 폭락 대비형</label>
              <strong id="hlTailText">25%</strong>
            </div>
            <input id="hlTail" type="range" min="0" max="100"
              value="25" class="hl-range"/>
          </div>

          <div class="hl-total">
            <span>전체 비중</span><strong id="hlWeightTotal">100%</strong>
          </div>
        </div>

        <div class="hl-card">
          <div class="hl-row">
            <h3>실제 풋옵션 체인</h3>
            <button id="hlReload" class="hl-button">새로고침</button>
          </div>

          <div class="hl-row">
            <label for="hlExpiry" class="hl-label">옵션 만기일</label>
            <select id="hlExpiry" class="hl-input">
              <option value="">만기일 불러오는 중</option>
            </select>
          </div>

          <div id="hlOptionStatus" class="hl-muted">
            종목을 선택하면 옵션 데이터를 불러옵니다.
          </div>

          <div id="hlCandidates"></div>
        </div>

        <div class="hl-card">
          <h3>예상 투자 및 헷지 비용</h3>
          <div id="hlSummary" class="hl-summary">
            종목과 옵션 데이터를 기다리는 중입니다.
          </div>
        </div>

        <div class="hl-card">
          <h3>만기 시나리오 분석</h3>
          <p class="hl-muted">
            현재 가격에서 각 하락률로 움직였다고 가정한 만기 손익입니다.
          </p>
          <div id="hlScenarios"></div>
        </div>

        <div class="hl-disclaimer">
          분석용 시뮬레이션입니다. 옵션은 원금 전액 손실이 가능하며,
          실제 체결 가격·수수료·세금·조기 청산 가격은 달라질 수 있습니다.
          Yahoo Finance 데이터는 실시간 또는 완전한 데이터가 아닐 수 있습니다.
        </div>
      </section>
    `);

    addStyles();
    bindControls();
  }

  function addStyles() {
    if ($("hlStyles")) return;

    const style = document.createElement("style");
    style.id = "hlStyles";
    style.textContent = `
      .hl { margin:24px 0; color:#191f28; display:grid; gap:14px; }
      .hl-header { display:flex; justify-content:space-between; gap:12px; align-items:center; }
      .hl-header h2 { font-size:24px; margin:5px 0; letter-spacing:-.7px; }
      .hl-header p,.hl-muted { color:#8b95a1; font-size:12px; line-height:1.6; }
      .hl-kicker { color:#3182f6; font-size:10px; font-weight:800; letter-spacing:1px; }
      .hl-live { background:#edf5ff; color:#2878e8; padding:7px 10px; border-radius:9px; font-size:11px; }
      .hl-card { background:white; border:1px solid #edf0f2; border-radius:17px; padding:20px; }
      .hl-card h3 { font-size:16px; margin:0 0 16px; }
      .hl-label { display:block; color:#68717d; font-size:12px; margin:12px 0 7px; }
      .hl-input { width:100%; box-sizing:border-box; border:1px solid #e4e8ed; border-radius:10px; padding:11px; background:white; color:#191f28; }
      .hl-range { width:100%; accent-color:#3182f6; cursor:pointer; }
      .hl-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .hl-row h3 { margin:0; }
      .hl-row strong { font-size:13px; }
      .hl-divider { border-top:1px solid #edf0f2; margin:20px 0; }
      .hl-weight { margin:14px 0; }
      .hl-total { display:flex; justify-content:space-between; border-top:1px solid #edf0f2; padding-top:12px; font-size:13px; }
      .hl-button { border:0; border-radius:8px; background:#edf5ff; color:#2878e8; padding:8px 12px; cursor:pointer; }
      .hl-option-group { border-top:1px solid #edf0f2; padding:15px 0; }
      .hl-option-group h4 { margin:0 0 8px; font-size:14px; }
      .hl-option-meta { color:#8b95a1; font-size:11px; margin:6px 0; line-height:1.6; }
      .hl-summary { display:grid; grid-template-columns:1fr 1fr; gap:15px; }
      .hl-metric { background:#f7f9fb; padding:13px; border-radius:11px; min-width:0; }
      .hl-metric span { display:block; font-size:11px; color:#8b95a1; margin-bottom:6px; }
      .hl-metric strong { font-size:17px; overflow-wrap:anywhere; }
      .hl-table-wrap { overflow-x:auto; }
      .hl-table { width:100%; border-collapse:collapse; font-size:12px; white-space:nowrap; }
      .hl-table th,.hl-table td { text-align:right; padding:11px 8px; border-bottom:1px solid #edf0f2; }
      .hl-table th:first-child,.hl-table td:first-child { text-align:left; }
      .hl-positive { color:#e34b50; font-weight:700; }
      .hl-negative { color:#3182f6; font-weight:700; }
      .hl-disclaimer { font-size:11px; line-height:1.7; color:#929ba6; padding:5px 3px; }
      @media(max-width:600px) { .hl-card { padding:15px; } .hl-summary { gap:8px; } .hl-metric strong { font-size:15px; } }
    `;
    document.head.appendChild(style);
  }

  function bindControls() {
    $("hlCapital").addEventListener("input", e => {
      state.capital = Math.max(0, Number(e.target.value) || 0);
      renderCalculations();
    });

    $("hlBudget").addEventListener("input", e => {
      state.budgetPct = Number(e.target.value);
      renderSettings();
      renderCalculations();
    });

    $("hlSafe").addEventListener("input", e => {
      const remaining = 100 - Number(e.target.value);
      const oldOther = state.balanced + state.tail || 1;
      state.safe = Number(e.target.value);
      state.balanced = Math.round(remaining * state.balanced / oldOther);
      state.tail = remaining - state.balanced;
      renderSettings();
      renderCandidates();
      renderCalculations();
    });

    $("hlBalanced").addEventListener("input", e => {
      state.balanced = Math.min(100 - state.safe, Number(e.target.value));
      state.tail = 100 - state.safe - state.balanced;
      renderSettings();
      renderCandidates();
      renderCalculations();
    });

    $("hlTail").addEventListener("input", e => {
      state.tail = Math.min(100 - state.safe, Number(e.target.value));
      state.balanced = 100 - state.safe - state.tail;
      renderSettings();
      renderCandidates();
      renderCalculations();
    });

    $("hlExpiry").addEventListener("change", e => {
      state.expiry = Number(e.target.value);
      loadOptions();
    });

    $("hlReload").addEventListener("click", loadOptions);

    $("hlCandidates").addEventListener("change", e => {
      if (!e.target.matches("[data-option]")) return;
      state.selections[e.target.dataset.option] = e.target.value;
      renderCalculations();
    });
  }

  function renderSettings() {
    $("hlCapital").value = state.capital;
    $("hlBudget").value = state.budgetPct;
    $("hlBudgetText").textContent = `${state.budgetPct}%`;
    $("hlBudgetMoney").textContent = money(state.capital * state.budgetPct / 100);

    $("hlSafe").value = state.safe;
    $("hlBalanced").value = state.balanced;
    $("hlTail").value = state.tail;

    $("hlSafe").max = 100;
    $("hlBalanced").max = 100 - state.safe;
    $("hlTail").max = 100 - state.safe;

    $("hlSafeText").textContent = `${state.safe}%`;
    $("hlBalancedText").textContent = `${state.balanced}%`;
    $("hlTailText").textContent = `${state.tail}%`;
    $("hlWeightTotal").textContent =
      `${state.safe + state.balanced + state.tail}%`;
  }

  async function loadOptions() {
    if (!state.symbol) return;

    $("hlOptionStatus").textContent = "옵션 데이터를 조회하고 있어요...";
    $("hlCandidates").innerHTML = "";
    state.loading = true;

    try {
      const query = new URLSearchParams({ symbol: state.symbol });
      if (state.expiry) query.set("date", state.expiry);

      const response = await fetch(`/api/options?${query}`, {
        cache: "no-store"
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "옵션 조회 실패");

      state.expirations = data.expirationDates || [];
      state.expiry = data.selectedExpiration || state.expiry;
      state.puts = data.puts || [];

      if (Number.isFinite(Number(data.underlyingPrice)) && Number(data.underlyingPrice) > 0) {
        state.spot = Number(data.underlyingPrice);
      }

      renderExpiry();
      renderCandidates();
      renderCalculations();

      $("hlOptionStatus").textContent =
        `${state.symbol} · 풋옵션 ${state.puts.length}개 조회`;
    } catch (error) {
      state.puts = [];
      $("hlOptionStatus").textContent = error.message;
      renderCandidates();
      renderCalculations();
    } finally {
      state.loading = false;
    }
  }

  function renderExpiry() {
    const select = $("hlExpiry");
    select.innerHTML = state.expirations.map(timestamp => {
      const date = new Date(timestamp * 1000);
      return `<option value="${timestamp}" ${timestamp === state.expiry ? "selected" : ""}>
        ${date.toLocaleDateString("ko-KR")}
      </option>`;
    }).join("");

    if (!state.expirations.length) {
      select.innerHTML = `<option value="">만기 데이터 없음</option>`;
    }
  }

  function optionLabel(option) {
    const ask = Number(option.ask);
    const bid = Number(option.bid);
    const spread = ask > 0 && bid >= 0 ? ask - bid : null;

    return `행사가 ${money(option.strike)} · 매도호가 ${money(ask)} · 계약 비용 ${money(ask * 100)}`
      + (spread !== null ? ` · 스프레드 ${money(spread)}` : "");
  }

  function getCandidates(group) {
    if (!state.spot) return [];

    const ratio = option => Number(option.strike) / state.spot;

    let candidates = state.puts.filter(option => {
      const ask = Number(option.ask);
      const strike = Number(option.strike);
      if (!(ask > 0) || !(strike > 0)) return false;

      const r = ratio(option);

      if (group.id === "safe") return r >= 0.90 && r < 1;
      if (group.id === "balanced") return r >= 0.75 && r < 0.90;
      return r < 0.75 && ask <= 10;
    });

    if (group.id === "tail") {
      const cheap = candidates.filter(o => Number(o.ask) <= 1);
      if (cheap.length) candidates = cheap;
    }

    return candidates.sort((a, b) => {
      const score = option => {
        const ask = Number(option.ask);
        const bid = Number(option.bid) || 0;
        const spread = ask > 0 ? (ask - bid) / ask : 1;
        const targetDistance = Math.abs(ratio(option) - group.target);
        const liquidity = Math.log1p(Number(option.volume) || 0)
          + Math.log1p(Number(option.openInterest) || 0);
        return targetDistance + spread * 0.2 - liquidity * 0.002;
      };
      return score(a) - score(b);
    });
  }

  function renderCandidates() {
    const root = $("hlCandidates");
    if (!root) return;

    if (!state.puts.length || !state.spot) {
      root.innerHTML = `<p class="hl-muted">조회 가능한 옵션 데이터가 없습니다.</p>`;
      return;
    }

    root.innerHTML = groups.map(group => {
      const candidates = getCandidates(group);
      const chosen = state.selections[group.id];
      const selected = candidates.find(o => o.contractSymbol === chosen)
        || candidates[0];

      if (selected) state.selections[group.id] = selected.contractSymbol;

      return `
        <div class="hl-option-group">
          <h4 style="color:${group.color}">${group.name}</h4>
          ${
            candidates.length
              ? `
                <select class="hl-input" data-option="${group.id}">
                  ${candidates.slice(0, 40).map(option => `
                    <option value="${esc(option.contractSymbol)}"
                      ${option.contractSymbol === state.selections[group.id] ? "selected" : ""}>
                      ${esc(optionLabel(option))}
                    </option>
                  `).join("")}
                </select>
                <div class="hl-option-meta">
                  행사가 대비 현재 주가:
                  ${((1 - Number(selected.strike) / state.spot) * 100).toFixed(1)}% 낮음
                  · 거래량 ${number(selected.volume || 0)}
                  · 미결제약정 ${number(selected.openInterest || 0)}
                  · IV ${Number.isFinite(Number(selected.impliedVolatility))
                    ? (Number(selected.impliedVolatility) * 100).toFixed(1) + "%"
                    : "정보 없음"}
                </div>
              `
              : `<div class="hl-muted">이 유형에 해당하는 옵션이 없습니다.</div>`
          }
        </div>
      `;
    }).join("");
  }

  function selectedOption(group) {
    const candidates = getCandidates(group);
    return candidates.find(o => o.contractSymbol === state.selections[group.id])
      || candidates[0]
      || null;
  }

  function calculate() {
    const stockShares = state.spot > 0
      ? Math.floor(state.capital / state.spot)
      : 0;

    const totalBudget = state.capital * state.budgetPct / 100;
    const allocations = {
      safe: state.safe,
      balanced: state.balanced,
      tail: state.tail
    };

    const options = groups.map(group => {
      const option = selectedOption(group);
      const budget = totalBudget * allocations[group.id] / 100;

      if (!option) {
        return { group, option: null, budget, contracts: 0, cost: 0 };
      }

      const ask = Number(option.ask);
      const cost = ask * 100;
      const contracts = cost > 0 ? Math.floor(budget / cost) : 0;

      return {
        group,
        option,
        budget,
        contracts,
        cost: contracts * cost
      };
    });

    const totalCost = options.reduce((sum, item) => sum + item.cost, 0);

    return { stockShares, totalBudget, options, totalCost };
  }

  function renderCalculations() {
    const summary = $("hlSummary");
    const scenarios = $("hlScenarios");
    if (!summary || !scenarios) return;

    if (!state.spot || !state.puts.length) {
      summary.textContent = "옵션 데이터가 조회되면 계산 결과가 표시됩니다.";
      scenarios.innerHTML = "";
      return;
    }

    const result = calculate();
    const { stockShares, totalBudget, options, totalCost } = result;

    summary.innerHTML = `
      <div class="hl-metric">
        <span>현재 주가</span><strong>${money(state.spot)}</strong>
      </div>
      <div class="hl-metric">
        <span>현물 매수 가능 수량</span><strong>${number(stockShares)}주</strong>
      </div>
      <div class="hl-metric">
        <span>옵션 예산 한도</span><strong>${money(totalBudget)}</strong>
      </div>
      <div class="hl-metric">
        <span>실제 옵션 보험료</span><strong>${money(totalCost)}</strong>
      </div>
    `;

    const rows = options.map(item => {
      if (!item.option) {
        return `<tr><td>${item.group.name}</td><td colspan="4">후보 없음</td></tr>`;
      }

      const o = item.option;
      return `
        <tr>
          <td>${item.group.name}</td>
          <td>${money(o.strike)}</td>
          <td>${money(o.ask)}</td>
          <td>${item.contracts}계약</td>
          <td>${money(item.cost)}</td>
        </tr>
      `;
    }).join("");

    const sharesCost = stockShares * state.spot;

    summary.innerHTML += `
      <div class="hl-table-wrap" style="grid-column:1/-1">
        <table class="hl-table">
          <thead><tr>
            <th>유형</th><th>행사가</th><th>매도호가</th>
            <th>계약 수</th><th>비용</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="hl-muted" style="grid-column:1/-1">
        현물 매수금 ${money(sharesCost)} · 잔여 현금 ${money(state.capital - sharesCost)}
      </div>
    `;

    const scenariosList = [0, -5, -10, -20, -30, -40, 10];

    scenarios.innerHTML = `
      <div class="hl-table-wrap">
        <table class="hl-table">
          <thead><tr>
            <th>주가 변화</th><th>가정 주가</th>
            <th>현물 손익</th><th>풋옵션 손익</th><th>합산 손익</th>
          </tr></thead>
          <tbody>
            ${scenariosList.map(change => {
              const futurePrice = state.spot * (1 + change / 100);
              const stockPnl = stockShares * (futurePrice - state.spot);

              const optionPnl = options.reduce((sum, item) => {
                if (!item.option || !item.contracts) return sum;
                const intrinsic = Math.max(
                  Number(item.option.strike) - futurePrice, 0
                );
                const premium = Number(item.option.ask);
                return sum + item.contracts * 100 * (intrinsic - premium);
              }, 0);

              const total = stockPnl + optionPnl;
              const cls = total >= 0 ? "hl-positive" : "hl-negative";

              return `
                <tr>
                  <td>${change > 0 ? "+" : ""}${change}%</td>
                  <td>${money(futurePrice)}</td>
                  <td class="${stockPnl >= 0 ? "hl-positive" : "hl-negative"}">${money(stockPnl)}</td>
                  <td class="${optionPnl >= 0 ? "hl-positive" : "hl-negative"}">${money(optionPnl)}</td>
                  <td class="${cls}">${money(total)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <p class="hl-muted">
        옵션 손익은 만기 시 내재가치에서 매수 프리미엄을 뺀 값이며,
        현물은 현재가를 매입 기준으로 가정했습니다.
        수수료·세금·슬리피지 및 환율은 제외했습니다.
      </p>
    `;
  }

  async function selectSymbol(symbol) {
    state.symbol = symbol;

    const stock = typeof stocks !== "undefined" ? stocks[symbol] : null;
    if (stock && Number(stock.price) > 0) state.spot = Number(stock.price);

    state.expiry = null;
    state.selections = {};
    state.puts = [];
    state.expirations = [];

    ensurePanel();
    renderSettings();

    $("hlOptionStatus").textContent = `${symbol} 옵션 체인 조회 중...`;
    await loadOptions();
  }

  document.addEventListener("stock-selected", event => {
    if (event.detail?.symbol) selectSymbol(event.detail.symbol);
  });

  ensurePanel();
  renderSettings();

  if (typeof selectedSymbol !== "undefined" && selectedSymbol) {
    selectSymbol(selectedSymbol);
  }
})();
