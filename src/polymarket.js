import { requestJson } from "./http.js";

export class PolymarketGammaClient {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async listMarkets({ active = true, closed = false, limit = 10 } = {}) {
    const url = new URL(`${this.baseUrl}/markets`);
    url.searchParams.set("active", String(active));
    url.searchParams.set("closed", String(closed));
    url.searchParams.set("limit", String(limit));

    return requestJson(url);
  }

  async listEvents({ active = true, closed = false, limit = 10 } = {}) {
    const url = new URL(`${this.baseUrl}/events`);
    url.searchParams.set("active", String(active));
    url.searchParams.set("closed", String(closed));
    url.searchParams.set("limit", String(limit));

    return requestJson(url);
  }
}
