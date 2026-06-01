import { requestJson } from "./http.js";

export class FalconClient {
  constructor({ baseUrl, token, marketsAgentId }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.marketsAgentId = marketsAgentId;
  }

  async retrieveMarkets({ marketSlug, minVolume, closed, limit = 100, offset = 0 }) {
    return this.retrieve({
      agent_id: this.marketsAgentId,
      params: compact({
        market_slug: marketSlug,
        min_volume: minVolume === undefined ? undefined : String(minVolume),
        closed: closed === undefined ? undefined : titleBool(closed)
      }),
      pagination: { limit, offset },
      formatter_config: { format_type: "raw" }
    });
  }

  async traderStats({ wallet, timeframe = "90d" }) {
    return this.retrieve({
      agent_id: 581,
      params: {
        proxy_wallet: wallet,
        window_days: timeframeToDays(timeframe)
      },
      pagination: { limit: 100, offset: 0 }
    });
  }

  async falconScoreLeaderboard({
    limit = 50,
    offset = 0,
    minPnl15d = 0,
    minRoi15d = 0,
    minTrades15d = 50,
    minWinRate15d = 0.45,
    maxWinRate15d = 0.95,
    maxTrades15d = 100000,
    sortBy = "h_score"
  } = {}) {
    return this.retrieve({
      agent_id: 584,
      params: {
        min_pnl_15d: String(minPnl15d),
        min_roi_15d: String(minRoi15d),
        min_total_trades_15d: String(minTrades15d),
        min_win_rate_15d: String(minWinRate15d),
        max_win_rate_15d: String(maxWinRate15d),
        max_total_trades_15d: String(maxTrades15d),
        sort_by: sortBy
      },
      pagination: { limit, offset }
    });
  }

  async sentiment({ marketSlug, window = "24h" }) {
    return this.retrieve({
      agent_id: 585,
      params: {
        market_slug: marketSlug,
        window
      },
      pagination: { limit: 100, offset: 0 }
    });
  }

  async marketInsights({ conditionId, limit = 10, offset = 0 }) {
    return this.retrieve({
      agent_id: 575,
      params: {
        condition_id: conditionId
      },
      pagination: { limit, offset }
    });
  }

  async compareCrossMarket({
    topic,
    venues = ["polymarket", "kalshi"],
    metrics = ["price_gap", "volume_ratio"]
  }) {
    return this.retrieve({
      agent_id: 575,
      params: { topic, venues, metrics },
      pagination: { limit: 100, offset: 0 }
    });
  }

  async retrieve(body) {
    return this.post("/api/v2/semantic/retrieve/parameterized", {
      ...body,
      formatter_config: body.formatter_config || { format_type: "raw" }
    });
  }

  async post(path, body) {
    if (!this.token) {
      throw new Error("FALCON_API_TOKEN is required for Falcon API calls.");
    }

    return requestJson(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify(body)
    });
  }
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== "")
  );
}

function titleBool(value) {
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value).toLowerCase() === "true" ? "True" : "False";
}

function timeframeToDays(value) {
  const match = String(value).match(/^(\d+)\s*d?$/i);
  return match ? match[1] : String(value);
}
