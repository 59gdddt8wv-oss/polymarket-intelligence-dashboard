#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadEnv } from "../src/config.js";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "dashboard", "public", "data");

loadEnv(path.join(rootDir, ".env"));

const jobs = [
  {
    file: "smart-money.json",
    args: ["scripts/watch-smart-money.js", "--report"]
  },
  {
    file: "markets.json",
    args: ["src/cli.js", "gamma-markets", "--limit", "12", "--summary", "true"],
    normalize: (value) => ({
      generatedAt: new Date().toISOString(),
      count: Array.isArray(value) ? value.length : 0,
      results: Array.isArray(value) ? value : []
    })
  },
  {
    file: "sentiment-vs-price.json",
    args: ["src/cli.js", "sentiment-vs-price", "--limit", "8"]
  },
  {
    file: "arbs.json",
    args: [
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
    ]
  },
  {
    file: "baskets.json",
    args: [
      "src/cli.js",
      "find-polymarket-baskets",
      "--event-limit",
      "100",
      "--min-edge",
      "0.005",
      "--min-markets",
      "3"
    ]
  }
];

await fs.mkdir(dataDir, { recursive: true });

for (const job of jobs) {
  const raw = await runNode(job.args);
  const data = job.normalize ? job.normalize(raw) : raw;
  await fs.writeFile(path.join(dataDir, job.file), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote dashboard/public/data/${job.file}`);
}

async function runNode(args) {
  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: rootDir,
    maxBuffer: 20 * 1024 * 1024
  });

  if (!stdout.trim()) {
    return { generatedAt: new Date().toISOString(), count: 0, results: [] };
  }

  return JSON.parse(stdout);
}
