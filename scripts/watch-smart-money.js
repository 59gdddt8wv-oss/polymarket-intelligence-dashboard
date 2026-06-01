#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadEnv } from "../src/config.js";
import { sendTelegramMessage } from "../src/telegram.js";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statePath = path.join(rootDir, "data", "smart-money-seen.json");
loadEnv(path.join(rootDir, ".env"));

const args = new Set(process.argv.slice(2));
const init = args.has("--init");
const report = args.has("--report");
const telegramTest = args.has("--telegram-test");

const scan = await runSmartMoneyScan();
const seen = await readSeen();
const currentWallets = new Set(scan.results.map((item) => item.wallet));
const newResults = scan.results.filter((item) => !seen.wallets.includes(item.wallet));
const reportedResults = report || telegramTest ? scan.results : newResults;
const payload = reportedResults.length
  ? {
      generatedAt: scan.generatedAt,
      mode: report ? "report" : "new_only",
      newSmartMoneyWallets: newResults.length,
      reportedWallets: reportedResults.length,
      summary: summarizeScan(reportedResults),
      results: reportedResults.map(formatWalletReport)
    }
  : null;

if (!report && !telegramTest) {
  await writeSeen({
    updatedAt: scan.generatedAt,
    wallets: [...new Set([...seen.wallets, ...currentWallets])].sort()
  });
}

if (init) {
  console.log(
    JSON.stringify(
      {
        initialized: true,
        baselineWallets: currentWallets.size,
        updatedAt: scan.generatedAt
      },
      null,
      2
    )
  );
} else if (telegramTest) {
  await sendTelegramReport({
    ...payload,
    mode: "telegram_test",
    results: payload?.results?.slice(0, 3) || []
  });
  console.log(JSON.stringify({ telegramSent: true, wallets: payload?.results?.length || 0 }, null, 2));
} else if (payload) {
  if (!report) {
    await sendTelegramReport(payload);
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function runSmartMoneyScan() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "src/cli.js",
      "smart-money",
      "--limit",
      process.env.SMART_MONEY_LEADERBOARD_LIMIT || "25",
      "--wallet-limit",
      process.env.SMART_MONEY_WALLET_LIMIT || "10",
      "--min-score",
      process.env.SMART_MONEY_MIN_SCORE || "60",
      "--min-pnl",
      process.env.SMART_MONEY_MIN_PNL || "50000",
      "--min-roi",
      process.env.SMART_MONEY_MIN_ROI || "3",
      "--min-trades",
      process.env.SMART_MONEY_MIN_TRADES || "100",
      "--min-win-rate",
      process.env.SMART_MONEY_MIN_WIN_RATE || "0.5",
      "--min-sharpe",
      process.env.SMART_MONEY_MIN_SHARPE || "0.3",
      "--max-risk-score",
      process.env.SMART_MONEY_MAX_RISK_SCORE || "30"
    ],
    {
      cwd: rootDir,
      maxBuffer: 10 * 1024 * 1024
    }
  );

  return JSON.parse(stdout);
}

async function readSeen() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch {
    return { wallets: [] };
  }
}

async function writeSeen(value) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(`${statePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(`${statePath}.tmp`, statePath);
}

function summarizeScan(results) {
  const strong = results.filter((item) => item.decision === "watch_strong").length;
  const light = results.filter((item) => item.decision === "watch_light").length;
  const totalPnl = sum(results.map((item) => item.leaderboard?.pnl15d));
  const avgWinRate = average(results.map((item) => item.leaderboard?.winRatePct15d));
  const avgRoi = average(results.map((item) => item.leaderboard?.roiPct15d));
  const avgWatchScore = average(results.map((item) => item.watchScore));

  return {
    watchStrong: strong,
    watchLight: light,
    totalPnl15d: round(totalPnl),
    averageWinRatePct15d: round(avgWinRate),
    averageRoiPct15d: round(avgRoi),
    averageWatchScore: round(avgWatchScore)
  };
}

function formatWalletReport(item) {
  const leaderboard = item.leaderboard || {};
  const wallet360 = item.wallet360 || {};
  const category = wallet360.bestCategory || {};

  return {
    wallet: item.wallet,
    decision: item.decision,
    watchScore: item.watchScore,
    analytics: {
      earned15d: round(numberOrZero(leaderboard.pnl15d)),
      roiPct15d: round(numberOrZero(leaderboard.roiPct15d)),
      winRatePct15d: round(numberOrZero(leaderboard.winRatePct15d)),
      sharpe15d: round(numberOrZero(leaderboard.sharpe15d)),
      volume15d: round(numberOrZero(leaderboard.volume15d)),
      trades15d: numberOrZero(leaderboard.trades15d),
      markets15d: numberOrZero(leaderboard.markets15d),
      trajectory: leaderboard.trajectory || null
    },
    risk: {
      level: wallet360.riskLevel || null,
      combinedRiskScore: wallet360.combinedRiskScore ?? null,
      flags: wallet360.riskFlags || []
    },
    edge: {
      bestCategory: category.category || null,
      bestCategoryPnl: round(numberOrZero(category.pnl)),
      bestCategoryRoi: round(numberOrZero(category.roi)),
      bestCategoryWinRatePct: round(numberOrZero(category.winRate) * 100)
    },
    reason: buildReason(item)
  };
}

function buildReason(item) {
  const leaderboard = item.leaderboard || {};
  const wallet360 = item.wallet360 || {};
  const flags = wallet360.riskFlags || [];
  const parts = [
    `${formatMoney(leaderboard.pnl15d)} earned in 15d`,
    `${round(numberOrZero(leaderboard.winRatePct15d))}% win rate`,
    `${round(numberOrZero(leaderboard.roiPct15d))}% ROI`,
    `Sharpe ${round(numberOrZero(leaderboard.sharpe15d))}`
  ];
  if (leaderboard.trajectory) parts.push(`trajectory ${leaderboard.trajectory}`);
  if (wallet360.riskLevel) parts.push(`risk ${wallet360.riskLevel}`);
  if (flags.length) parts.push(`flags: ${flags.join(", ")}`);
  return parts.join("; ");
}

function average(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  return numeric.length ? sum(numeric) / numeric.length : 0;
}

function sum(values) {
  return values.map(Number).filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function formatMoney(value) {
  return `$${Math.round(numberOrZero(value)).toLocaleString("en-US")}`;
}

async function sendTelegramReport(payload) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.");
  }

  await sendTelegramMessage({
    botToken,
    chatId,
    text: formatTelegramReport(payload)
  });
}

function formatTelegramReport(payload) {
  const summary = payload.summary || summarizeScan([]);
  const lines = [
    `<b>Polymarket smart money</b>`,
    payload.mode === "telegram_test"
      ? `Test report: ${payload.results.length} wallets`
      : `New wallets: ${payload.newSmartMoneyWallets}`,
    `Total PnL 15d: ${formatMoney(summary.totalPnl15d)}`,
    `Avg win rate: ${round(summary.averageWinRatePct15d)}%`,
    `Avg ROI: ${round(summary.averageRoiPct15d)}%`,
    ""
  ];

  for (const item of payload.results.slice(0, 8)) {
    const analytics = item.analytics || {};
    const risk = item.risk || {};
    const edge = item.edge || {};
    lines.push(`<b>${escapeHtml(item.decision)} | score ${item.watchScore}</b>`);
    lines.push(`<code>${escapeHtml(item.wallet)}</code>`);
    lines.push(
      `Earned: ${formatMoney(analytics.earned15d)} | Win rate: ${round(
        analytics.winRatePct15d
      )}% | ROI: ${round(analytics.roiPct15d)}%`
    );
    lines.push(
      `Sharpe: ${round(analytics.sharpe15d)} | Volume: ${formatMoney(
        analytics.volume15d
      )} | Trades: ${analytics.trades15d}`
    );
    lines.push(
      `Category: ${escapeHtml(edge.bestCategory || "n/a")} (${formatMoney(
        edge.bestCategoryPnl
      )}, ROI ${round(edge.bestCategoryRoi)}%)`
    );
    lines.push(
      `Risk: ${escapeHtml(risk.level || "n/a")}${
        risk.flags?.length ? ` | Flags: ${escapeHtml(risk.flags.join(", "))}` : ""
      }`
    );
    lines.push(escapeHtml(item.reason || ""));
    lines.push("");
  }

  return lines.join("\n").slice(0, 3900);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
