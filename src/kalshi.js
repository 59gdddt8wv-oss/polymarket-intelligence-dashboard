import { requestJson } from "./http.js";

export class KalshiClient {
  constructor({ baseUrl = "https://api.elections.kalshi.com/trade-api/v2" } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async listMarkets({ limit = 100, cursor, status = "open" } = {}) {
    const url = new URL(`${this.baseUrl}/markets`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("status", status);
    if (cursor) url.searchParams.set("cursor", cursor);

    return requestJson(url);
  }
}
