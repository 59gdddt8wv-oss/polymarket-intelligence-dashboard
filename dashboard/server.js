#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadEnv } from "../src/config.js";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "dashboard", "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const cache = new Map();

loadEnv(path.join(rootDir, ".env"));

const routes = {
  "/api/smart-money": () =>
    runNode(["src/cli.js", "smart-money", "--limit", "25", "--wallet-limit", "10"]),
  "/api/markets": () =>
    runNode(["src/cli.js", "gamma-markets", "--limit", "12", "--summary", "true"]).then(
      (results) => ({
        generatedAt: new Date().toISOString(),
        count: Array.isArray(results) ? results.length : 0,
        results: Array.isArray(results) ? results : []
      })
    ),
  "/api/sentiment-vs-price": () =>
    runNode(["src/cli.js", "sentiment-vs-price", "--limit", "8"]),
  "/api/arbs": () =>
    runNode([
      "src/cli.js",
      "find-arbs",
      "--pm-limit",
      "80",
      "--kalshi-limit",
      "500",
      "--min-edge",
      "0.005",
      "--min-similarity",
      "0.3",
      "--min-kalshi-liquidity",
      "1"
    ]),
  "/api/baskets": () =>
    runNode([
      "src/cli.js",
      "find-polymarket-baskets",
      "--event-limit",
      "100",
      "--min-edge",
      "0.005",
      "--min-markets",
      "3"
    ]),
  "/api/telegram-report": () =>
    runNode(["scripts/watch-smart-money.js", "--report"])
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname in routes) {
      const body = await cached(url.pathname, routes[url.pathname]);
      sendJson(response, 200, body);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error.message,
      stderr: error.stderr || undefined
    });
  }
});

server.listen(port, host, () => {
  console.log(`Polymarket dashboard running at http://${host}:${port}`);
});

async function cached(key, loader) {
  const ttlMs = 60_000;
  const cachedValue = cache.get(key);
  if (cachedValue && Date.now() - cachedValue.createdAt < ttlMs) {
  return attachCacheFlag(cachedValue.value, true);
  }

  const value = await loader();
  cache.set(key, { createdAt: Date.now(), value });
  return attachCacheFlag(value, false);
}

async function runNode(args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, args, {
    cwd: rootDir,
    maxBuffer: 20 * 1024 * 1024
  });

  if (!stdout.trim()) {
    return { generatedAt: new Date().toISOString(), count: 0, results: [], stderr };
  }

  return JSON.parse(stdout);
}

function attachCacheFlag(value, cached) {
  if (Array.isArray(value)) {
    return { generatedAt: new Date().toISOString(), count: value.length, results: value, cached };
  }

  return { ...value, cached };
}

async function serveStatic(pathname, response) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, normalized));
  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function contentType(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "text/html";
}
