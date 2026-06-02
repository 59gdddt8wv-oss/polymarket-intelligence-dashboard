const state = {
  smart: null,
  markets: null,
  sentiment: null,
  arbs: null,
  baskets: null
};

const endpoints = {
  smart: { api: "/api/telegram-report", static: "data/smart-money.json" },
  markets: { api: "/api/markets", static: "data/markets.json" },
  sentiment: { api: "/api/sentiment-vs-price", static: "data/sentiment-vs-price.json" },
  arbs: { api: "/api/arbs", static: "data/arbs.json" },
  baskets: { api: "/api/baskets", static: "data/baskets.json" }
};

document.querySelector("#refresh-all").addEventListener("click", refreshAll);
document.querySelectorAll("[data-load]").forEach((button) => {
  button.addEventListener("click", () => load(button.dataset.load));
});

refreshAll();

async function refreshAll() {
  await load("smart");
  load("markets");
  load("sentiment");
  load("arbs");
  load("baskets");
}

async function load(key) {
  setStatus(key, "Loading...");
  try {
    const data = await fetchData(key);
    state[key] = data;
    render(key, data);
    setStatus(key, `${data.count ?? data.reportedWallets ?? data.results?.length ?? 0} rows`);
  } catch (error) {
    setStatus(key, error.message);
  }
}

async function fetchData(key) {
  const endpoint = endpoints[key];
  const urls = isStaticHost() ? [endpoint.static] : [endpoint.api, endpoint.static];

  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Request failed");
}

function isStaticHost() {
  return location.hostname.endsWith("github.io") || location.protocol === "file:";
}

function render(key, data) {
  if (key === "smart") renderSmart(data);
  if (key === "markets") renderMarkets(data);
  if (key === "sentiment") renderSignals(data);
  if (key === "arbs") renderArbs(data);
  if (key === "baskets") renderBaskets(data);
}

function renderSmart(data) {
  const summary = data.summary || {};
  document.querySelector("#metric-pnl").textContent = money(summary.totalPnl15d);
  document.querySelector("#metric-winrate").textContent = pct(summary.averageWinRatePct15d);
  document.querySelector("#metric-roi").textContent = pct(summary.averageRoiPct15d);
  document.querySelector("#metric-strong").textContent = String(summary.watchStrong ?? 0);

  const rows = data.results || [];
  document.querySelector("#smart-table").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Wallet</th>
          <th>Decision</th>
          <th>Earned 15d</th>
          <th>Win Rate</th>
          <th>ROI</th>
          <th>Sharpe</th>
          <th>Volume</th>
          <th>Best Category</th>
          <th>Risk</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((item) => {
            const a = item.analytics || {};
            const r = item.risk || {};
            const e = item.edge || {};
            return `
              <tr>
                <td>${walletLink(item.wallet)}<div class="subtle">${escapeHtml(item.reason || "")}</div></td>
                <td><span class="pill ${item.decision === "watch_strong" ? "strong" : "light"}">${escapeHtml(item.decision)}</span><div class="subtle">score ${num(item.watchScore)}</div></td>
                <td>${money(a.earned15d)}</td>
                <td>${pct(a.winRatePct15d)}</td>
                <td>${pct(a.roiPct15d)}</td>
                <td>${num(a.sharpe15d)}</td>
                <td>${money(a.volume15d)}</td>
                <td>${escapeHtml(e.bestCategory || "n/a")}<div class="subtle">${money(e.bestCategoryPnl)} / ROI ${pct(e.bestCategoryRoi)}</div></td>
                <td>${escapeHtml(r.level || "n/a")}<div class="subtle">${escapeHtml((r.flags || []).join(", ") || "no flags")}</div></td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function renderMarkets(data) {
  renderCards("#markets-list", data, (market) => ({
    title: market.question,
    fields: {
      "Yes / No": `${market.outcomePrices?.[0] ?? "?"} / ${market.outcomePrices?.[1] ?? "?"}`,
      Spread: num(market.spread),
      Volume: money(market.volume),
      Liquidity: money(market.liquidity)
    }
  }));
}

function renderSignals(data) {
  renderCards("#signals-list", data, (item) => ({
    title: item.question,
    fields: {
      "Yes price": num(item.price?.yes),
      Spread: num(item.price?.spread),
      Trend: item.sentimentProxy?.volumeTrend || "n/a",
      Signal: item.signal
    }
  }));
}

function renderArbs(data) {
  renderCards("#arbs-list", data, (item) => ({
    title: item.polymarket?.question || "No candidates",
    fields: {
      Edge: pct((item.edge || 0) * 100),
      Direction: item.direction || "n/a",
      Similarity: pct((item.similarity || 0) * 100),
      Kalshi: item.kalshi?.title || "n/a"
    }
  }));
}

function renderBaskets(data) {
  renderCards("#baskets-list", data, (item) => ({
    title: item.event?.title || "No candidates",
    fields: {
      Edge: pct((item.edge || 0) * 100),
      Type: item.type || "n/a",
      Cost: num(item.basketCost),
      Markets: String(item.markets?.length || 0)
    }
  }));
}

function renderCards(selector, data, mapper) {
  const rows = data.results || [];
  const target = document.querySelector(selector);
  if (!rows.length) {
    target.innerHTML = `<div class="card"><h3>No candidates</h3><p class="subtle">Nothing passed the current filters.</p></div>`;
    return;
  }

  target.innerHTML = rows
    .slice(0, 8)
    .map((row) => {
      const card = mapper(row);
      return `
        <article class="card">
          <h3>${escapeHtml(card.title || "Untitled")}</h3>
          <dl>
            ${Object.entries(card.fields)
              .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
              .join("")}
          </dl>
        </article>`;
    })
    .join("");
}

function setStatus(key, text) {
  const ids = {
    smart: "#smart-status",
    markets: "#markets-status",
    sentiment: "#signals-status",
    arbs: "#arbs-status",
    baskets: "#baskets-status"
  };
  document.querySelector(ids[key]).textContent = text;
}

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return `$${Math.round(parsed).toLocaleString("en-US")}`;
}

function pct(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return `${parsed.toFixed(parsed >= 10 ? 1 : 2)}%`;
}

function num(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return parsed.toFixed(Math.abs(parsed) >= 10 ? 1 : 3);
}

function shortWallet(wallet) {
  if (!wallet) return "n/a";
  return `${wallet.slice(0, 8)}...${wallet.slice(-6)}`;
}

function walletLink(wallet) {
  if (!wallet) return "<code>n/a</code>";
  const safeWallet = escapeHtml(wallet);
  const short = escapeHtml(shortWallet(wallet));
  return `<a class="wallet-link" href="https://polygonscan.com/address/${safeWallet}" target="_blank" rel="noreferrer noopener" title="${safeWallet}"><code>${short}</code></a>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
