import fs from "node:fs";

export function loadEnv(path = ".env") {
  if (!fs.existsSync(path)) return;

  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getConfig() {
  loadEnv();

  return {
    falconToken: process.env.FALCON_API_TOKEN,
    falconBaseUrl:
      process.env.FALCON_BASE_URL || "https://narrative.agent.heisenberg.so",
    falconMarketsAgentId: Number(process.env.FALCON_MARKETS_AGENT_ID || 574),
    polymarketGammaUrl:
      process.env.POLYMARKET_GAMMA_URL || "https://gamma-api.polymarket.com"
  };
}
