#!/usr/bin/env node
import { getConfig } from "./config.js";
import { FalconClient } from "./falcon.js";
import { KalshiClient } from "./kalshi.js";
import { PolymarketGammaClient } from "./polymarket.js";

const config = getConfig();
const falcon = new FalconClient({
  baseUrl: config.falconBaseUrl,
  token: config.falconToken,
  marketsAgentId: config.falconMarketsAgentId
});
const gamma = new PolymarketGammaClient({ baseUrl: config.polymarketGammaUrl });
const kalshi = new KalshiClient();

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

try {
  switch (command) {
    case "gamma-markets":
      {
        const markets = await gamma.listMarkets({
          active: readBool(args.active, true),
          closed: readBool(args.closed, false),
          limit: readNumber(args.limit, 10)
        });
        printJson(readBool(args.summary, false) ? summarizeMarkets(markets) : markets);
      }
      break;

    case "falcon-markets":
      requireArg(args.slug, "--slug");
      printJson(
        await falcon.retrieveMarkets({
          marketSlug: args.slug,
          minVolume: args["min-volume"],
          closed: args.closed,
          limit: readNumber(args.limit, 100),
          offset: readNumber(args.offset, 0)
        })
      );
      break;

    case "trader-stats":
      requireArg(args.wallet, "--wallet");
      printJson(
        await falcon.traderStats({
          wallet: args.wallet,
          timeframe: args.timeframe || "90d"
        })
      );
      break;

    case "sentiment":
      requireArg(args.slug, "--slug");
      printJson(
        await falcon.sentiment({
          marketSlug: args.slug,
          window: args.window || "24h"
        })
      );
      break;

    case "cross-compare":
      requireArg(args.topic, "--topic");
      printJson(await falcon.compareCrossMarket({ topic: args.topic }));
      break;

    case "sentiment-vs-price":
      printJson(
        await compareSentimentVsPrice({
          limit: readNumber(args.limit, 5),
          active: readBool(args.active, true),
          closed: readBool(args.closed, false)
        })
      );
      break;

    case "find-arbs":
      printJson(
        await findArbs({
          polymarketLimit: readNumber(args["pm-limit"], 25),
          kalshiLimit: readNumber(args["kalshi-limit"], 250),
          minEdge: readNumber(args["min-edge"], 0.01),
          minSimilarity: readNumber(args["min-similarity"], 0.25),
          minKalshiLiquidity: readNumber(args["min-kalshi-liquidity"], 1),
          minKalshiVolume24h: readNumber(args["min-kalshi-volume-24h"], 0)
        })
      );
      break;

    case "find-polymarket-baskets":
      printJson(
        await findPolymarketBaskets({
          eventLimit: readNumber(args["event-limit"], 100),
          minEdge: readNumber(args["min-edge"], 0.005),
          minMarkets: readNumber(args["min-markets"], 3)
        })
      );
      break;

    case "smart-money":
      printJson(
        await findSmartMoney({
          leaderboardLimit: readNumber(args.limit, 25),
          walletLimit: readNumber(args["wallet-limit"], 10),
          minScore: readNumber(args["min-score"], 60),
          minPnl15d: readNumber(args["min-pnl"], 50000),
          minRoi15d: readNumber(args["min-roi"], 3),
          minTrades15d: readNumber(args["min-trades"], 100),
          minWinRate15d: readNumber(args["min-win-rate"], 0.5),
          minSharpe15d: readNumber(args["min-sharpe"], 0.3),
          maxRiskScore: readNumber(args["max-risk-score"], 30)
        })
      );
      break;

    case "falcon-agent":
      requireArg(args.agent, "--agent");
      printJson(
        await falcon.retrieve({
          agent_id: readNumber(args.agent),
          params: parseParams(args.param),
          pagination: {
            limit: readNumber(args.limit, 100, { min: 3 }),
            offset: readNumber(args.offset, 0)
          }
        })
      );
      break;

    case "help":
    case undefined:
      printHelp();
      break;

    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error.message);
  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  process.exitCode = 1;
}

function parseArgs(items) {
  const parsed = {};

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item.startsWith("--")) continue;

    const key = item.slice(2);
    const next = items[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      if (parsed[key] === undefined) {
        parsed[key] = next;
      } else if (Array.isArray(parsed[key])) {
        parsed[key].push(next);
      } else {
        parsed[key] = [parsed[key], next];
      }
      index += 1;
    }
  }

  return parsed;
}

function readBool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function readNumber(value, fallback, { min } = {}) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected number, got: ${value}`);
  }
  if (min !== undefined && parsed < min) {
    throw new Error(`Expected number >= ${min}, got: ${value}`);
  }
  return parsed;
}

function parseParams(values) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  const params = {};

  for (const item of items) {
    const eq = item.indexOf("=");
    if (eq === -1) {
      throw new Error(`Expected --param key=value, got: ${item}`);
    }
    params[item.slice(0, eq)] = item.slice(eq + 1);
  }

  return params;
}

function requireArg(value, name) {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function summarizeMarkets(markets) {
  return markets.map((market) => ({
    id: market.id,
    question: market.question,
    slug: market.slug,
    outcomes: parseJsonField(market.outcomes),
    outcomePrices: parseJsonField(market.outcomePrices),
    volume: numberOrString(market.volumeNum ?? market.volume),
    liquidity: numberOrString(market.liquidityNum ?? market.liquidity),
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    spread: market.spread,
    clobTokenIds: parseJsonField(market.clobTokenIds),
    endDate: market.endDate
  }));
}

function parseJsonField(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function numberOrString(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

async function compareSentimentVsPrice({ limit, active, closed }) {
  const markets = await gamma.listMarkets({ active, closed, limit });
  const rows = [];

  for (const market of markets) {
    const insight = await safeMarketInsight(market.conditionId);
    rows.push(buildComparisonRow(market, insight));
  }

  return {
    generatedAt: new Date().toISOString(),
    note:
      "Falcon Social Pulse agent 585 is not returning usable market-level sentiment for these params yet; sentimentProxy uses Falcon Market Insights agent 575.",
    count: rows.length,
    results: rows
  };
}

async function findArbs({
  polymarketLimit,
  kalshiLimit,
  minEdge,
  minSimilarity,
  minKalshiLiquidity,
  minKalshiVolume24h
}) {
  const [polymarketMarkets, kalshiMarkets] = await Promise.all([
    gamma.listMarkets({ active: true, closed: false, limit: polymarketLimit }),
    loadKalshiMarkets(kalshiLimit)
  ]);

  const candidates = [];
  for (const pm of polymarketMarkets) {
    const pmQuote = getPolymarketQuote(pm);
    if (!pmQuote) continue;

    for (const km of kalshiMarkets) {
      const similarity = titleSimilarity(pm.question, km.title);
      if (similarity < minSimilarity) continue;

      const kalshiQuote = getKalshiQuote(km);
      if (!kalshiQuote) continue;
      if ((numberOrNull(km.liquidity_dollars) || 0) < minKalshiLiquidity) continue;
      if ((numberOrNull(km.volume_24h_fp) || 0) < minKalshiVolume24h) continue;

      const buyPmYesBuyKalshiNo = 1 - (pmQuote.yesAsk + kalshiQuote.noAsk);
      const buyKalshiYesBuyPmNo = 1 - (kalshiQuote.yesAsk + pmQuote.noAsk);
      const edge = Math.max(buyPmYesBuyKalshiNo, buyKalshiYesBuyPmNo);
      if (edge < minEdge) continue;

      candidates.push({
        edge: round(edge),
        direction:
          buyPmYesBuyKalshiNo >= buyKalshiYesBuyPmNo
            ? "buy Polymarket YES + Kalshi NO"
            : "buy Kalshi YES + Polymarket NO",
        similarity: round(similarity),
        polymarket: {
          question: pm.question,
          slug: pm.slug,
          yesAsk: pmQuote.yesAsk,
          noAskEstimate: pmQuote.noAsk,
          spread: pmQuote.spread,
          volume: numberOrNull(pm.volumeNum ?? pm.volume),
          liquidity: numberOrNull(pm.liquidityNum ?? pm.liquidity)
        },
        kalshi: {
          title: km.title,
          ticker: km.ticker,
          yesAsk: kalshiQuote.yesAsk,
          noAsk: kalshiQuote.noAsk,
          yesBid: kalshiQuote.yesBid,
          noBid: kalshiQuote.noBid,
          volume24h: numberOrNull(km.volume_24h_fp),
          liquidity: numberOrNull(km.liquidity_dollars),
          closeTime: km.close_time
        }
      });
    }
  }

  candidates.sort((a, b) => b.edge - a.edge);

  return {
    generatedAt: new Date().toISOString(),
    searched: {
      polymarketMarkets: polymarketMarkets.length,
      kalshiMarkets: kalshiMarkets.length,
      minEdge,
      minSimilarity,
      minKalshiLiquidity,
      minKalshiVolume24h
    },
    note:
      "Candidates are text-matched and liquidity-filtered. Verify identical resolution rules, fees, and order book depth before trading.",
    count: candidates.length,
    results: candidates.slice(0, 25)
  };
}

async function findPolymarketBaskets({ eventLimit, minEdge, minMarkets }) {
  const events = await gamma.listEvents({
    active: true,
    closed: false,
    limit: eventLimit
  });
  const candidates = [];

  for (const event of events) {
    const markets = (event.markets || [])
      .filter((market) => market.active && !market.closed && market.acceptingOrders)
      .map((market) => ({
        question: market.question,
        slug: market.slug,
        yesAsk: numberOrNull(market.bestAsk),
        yesBid: numberOrNull(market.bestBid),
        volume: numberOrNull(market.volumeNum ?? market.volume),
        liquidity: numberOrNull(market.liquidityNum ?? market.liquidity)
      }))
      .filter((market) => market.yesAsk !== null && market.yesBid !== null);

    if (markets.length < minMarkets) continue;

    const sumYesAsk = markets.reduce((sum, market) => sum + market.yesAsk, 0);
    const allYesEdge = 1 - sumYesAsk;
    if (allYesEdge >= minEdge) {
      candidates.push({
        edge: round(allYesEdge),
        type: "buy all YES",
        event: {
          title: event.title,
          slug: event.slug,
          volume: numberOrNull(event.volume),
          liquidity: numberOrNull(event.liquidity)
        },
        basketCost: round(sumYesAsk),
        guaranteedPayoutAssumption: 1,
        markets
      });
    }

    const noAsks = markets.map((market) => 1 - market.yesBid);
    const sumNoAsk = noAsks.reduce((sum, value) => sum + value, 0);
    const allNoEdge = markets.length - 1 - sumNoAsk;
    if (allNoEdge >= minEdge) {
      candidates.push({
        edge: round(allNoEdge),
        type: "buy all NO",
        event: {
          title: event.title,
          slug: event.slug,
          volume: numberOrNull(event.volume),
          liquidity: numberOrNull(event.liquidity)
        },
        basketCost: round(sumNoAsk),
        guaranteedPayoutAssumption: markets.length - 1,
        markets: markets.map((market, index) => ({
          ...market,
          noAskEstimate: round(noAsks[index])
        }))
      });
    }
  }

  candidates.sort((a, b) => b.edge - a.edge);

  return {
    generatedAt: new Date().toISOString(),
    searched: {
      events: events.length,
      minEdge,
      minMarkets
    },
    note:
      "Basket candidates assume exactly one YES outcome in the event. Verify event rules and completeness before trading.",
    count: candidates.length,
    results: candidates.slice(0, 25)
  };
}

async function findSmartMoney({
  leaderboardLimit,
  walletLimit,
  minScore,
  minPnl15d,
  minRoi15d,
  minTrades15d,
  minWinRate15d,
  minSharpe15d,
  maxRiskScore
}) {
  const leaderboardResponse = await falcon.falconScoreLeaderboard({
    limit: leaderboardLimit,
    minPnl15d,
    minRoi15d,
    minTrades15d,
    minWinRate15d
  });
  const leaderboard = leaderboardResponse?.data?.results || [];
  const shortlisted = leaderboard
    .filter((row) => numberOrNull(row.h_score) >= minScore)
    .filter((row) => numberOrNull(row.sharpe_ratio_15d) >= minSharpe15d)
    .slice(0, walletLimit);

  const results = [];
  for (const row of shortlisted) {
    const wallet360 = await latestWallet360(row.wallet, "15d");
    const summary = summarizeSmartWallet(row, wallet360, { maxRiskScore });
    if (summary.decision !== "reject") results.push(summary);
  }

  results.sort((a, b) => b.watchScore - a.watchScore);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      leaderboardLimit,
      walletLimit,
      minScore,
      minPnl15d,
      minRoi15d,
      minTrades15d,
      minWinRate15d,
      minSharpe15d,
      maxRiskScore
    },
    count: results.length,
    leaderboardCandidates: leaderboard.length,
    enrichedCandidates: shortlisted.length,
    results
  };
}

async function latestWallet360(wallet, timeframe) {
  try {
    const response = await falcon.traderStats({ wallet, timeframe });
    const rows = response?.data?.results || [];
    return rows[0] || null;
  } catch (error) {
    return { error: error.body?.error?.message || error.message };
  }
}

function summarizeSmartWallet(row, wallet360, { maxRiskScore }) {
  const riskScore = numberOrNull(wallet360?.combined_risk_score);
  const riskFlags = wallet360 ? extractRiskFlags(wallet360) : ["wallet360_unavailable"];
  const decision = decideSmartWallet({ row, wallet360, riskScore, riskFlags, maxRiskScore });
  const category = bestCategory(wallet360?.performance_by_category);
  const watchScore = scoreSmartWallet(row, wallet360, riskScore, riskFlags);

  return {
    wallet: row.wallet,
    decision,
    watchScore,
    leaderboard: {
      rank: numberOrNull(row.leaderboard_rank),
      tier: row.tier,
      hScore: numberOrNull(row.h_score),
      trajectory: row.trajectory,
      pnl15d: numberOrNull(row.total_pnl_15d),
      roiPct15d: numberOrNull(row.roi_pct_15d),
      winRatePct15d: numberOrNull(row.win_rate_pct_15d),
      sharpe15d: numberOrNull(row.sharpe_ratio_15d),
      trades15d: numberOrNull(row.total_trades_15d),
      markets15d: numberOrNull(row.markets_traded_15d),
      volume15d: numberOrNull(row.total_volume_15d)
    },
    wallet360: wallet360?.error
      ? { error: wallet360.error }
      : {
          riskLevel: wallet360?.risk_level || null,
          combinedRiskScore: riskScore,
          statisticalConfidence: numberOrNull(wallet360?.statistical_confidence),
          profitFactor: numberOrNull(wallet360?.profit_factor),
          maxDrawdown: numberOrNull(wallet360?.max_drawdown),
          marketConcentration: numberOrNull(wallet360?.market_concentration_ratio),
          maxPositionPct: numberOrNull(wallet360?.max_position_pct),
          equityCurvePattern: wallet360?.equity_curve_pattern || null,
          performanceTrend: wallet360?.performance_trend || null,
          bestCategory: category,
          riskFlags
        },
    rationale: smartWalletRationale(row, wallet360, riskFlags)
  };
}

function decideSmartWallet({ row, wallet360, riskScore, riskFlags, maxRiskScore }) {
  if (wallet360?.error) return "watch_light";
  if (riskScore !== null && riskScore > maxRiskScore) return "reject";
  if (riskFlags.includes("sybil_risk") || riskFlags.includes("suspicious_timing")) {
    return "reject";
  }
  if (row.trajectory === "declining") return "watch_light";
  if (riskFlags.length > 0) return "watch_light";
  return "watch_strong";
}

function scoreSmartWallet(row, wallet360, riskScore, riskFlags) {
  let score = 0;
  score += numberOrNull(row.h_score) || 0;
  score += Math.min(numberOrNull(row.roi_pct_15d) || 0, 30) * 0.4;
  score += Math.min(numberOrNull(row.total_pnl_15d) || 0, 500000) / 50000;
  score += Math.max(0, (numberOrNull(row.sharpe_ratio_15d) || 0) * 5);
  if (row.trajectory === "improving") score += 5;
  if (row.trajectory === "declining") score -= 5;
  if (wallet360?.risk_level === "LOW") score += 4;
  if (riskScore !== null) score -= riskScore * 0.4;
  score -= riskFlags.length * 4;
  return round(score, 2);
}

function extractRiskFlags(wallet360) {
  const flags = [];
  if (wallet360.single_market_dependence_flag) flags.push("single_market_dependence");
  if (wallet360.position_size_volatility_flag) flags.push("position_size_volatility");
  if (wallet360.perfect_timing_flag) flags.push("perfect_timing");
  if (wallet360.suspicious_win_rate_flag) flags.push("suspicious_win_rate");
  if (wallet360.sybil_risk_flag) flags.push("sybil_risk");
  if (wallet360.timing_anomaly_flag) flags.push("timing_anomaly");
  if (numberOrNull(wallet360.max_position_pct) > 50) flags.push("large_max_position");
  if (numberOrNull(wallet360.market_concentration_ratio) > 0.5) {
    flags.push("high_market_concentration");
  }
  return flags;
}

function bestCategory(rawCategories) {
  const categories = parseJsonField(rawCategories);
  if (!Array.isArray(categories)) return null;
  const sorted = categories
    .map((item) => ({
      category: item.category,
      pnl: numberOrNull(item.total_pnl),
      roi: numberOrNull(item.roi),
      winRate: numberOrNull(item.win_rate),
      trades: numberOrNull(item.total_trades)
    }))
    .filter((item) => item.pnl !== null)
    .sort((a, b) => b.pnl - a.pnl);
  return sorted[0] || null;
}

function smartWalletRationale(row, wallet360, riskFlags) {
  const notes = [];
  notes.push(`${row.tier} rank ${row.leaderboard_rank}, h_score ${row.h_score}`);
  notes.push(`${row.total_pnl_15d} PnL / ${row.roi_pct_15d}% ROI over 15d`);
  notes.push(`${row.win_rate_pct_15d}% win rate, Sharpe ${row.sharpe_ratio_15d}`);
  if (row.trajectory) notes.push(`trajectory: ${row.trajectory}`);
  if (wallet360?.risk_level) notes.push(`risk: ${wallet360.risk_level}`);
  if (riskFlags.length) notes.push(`flags: ${riskFlags.join(", ")}`);
  return notes;
}

async function loadKalshiMarkets(maxMarkets) {
  const markets = [];
  let cursor;

  while (markets.length < maxMarkets) {
    const page = await kalshi.listMarkets({
      limit: Math.min(100, maxMarkets - markets.length),
      cursor,
      status: "open"
    });
    markets.push(...(page.markets || []));
    cursor = page.cursor;
    if (!cursor) break;
  }

  return markets;
}

function getPolymarketQuote(market) {
  const yesAsk = numberOrNull(market.bestAsk);
  const yesBid = numberOrNull(market.bestBid);
  if (yesAsk === null || yesBid === null) return null;

  return {
    yesAsk,
    noAsk: round(1 - yesBid),
    spread: numberOrNull(market.spread)
  };
}

function getKalshiQuote(market) {
  const yesAsk = numberOrNull(market.yes_ask_dollars);
  const noAsk = numberOrNull(market.no_ask_dollars);
  if (yesAsk === null || noAsk === null) return null;
  if (yesAsk <= 0 || noAsk <= 0) return null;

  return {
    yesAsk,
    noAsk,
    yesBid: numberOrNull(market.yes_bid_dollars),
    noBid: numberOrNull(market.no_bid_dollars)
  };
}

function titleSimilarity(left, right) {
  const leftTokens = keywordSet(left);
  const rightTokens = keywordSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function keywordSet(value) {
  const stop = new Set([
    "the",
    "and",
    "before",
    "after",
    "will",
    "yes",
    "no",
    "over",
    "under",
    "market",
    "by",
    "on",
    "in",
    "to",
    "a",
    "an",
    "of",
    "for",
    "with"
  ]);

  return new Set(
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stop.has(token))
  );
}

async function safeMarketInsight(conditionId) {
  if (!conditionId) return { error: "missing conditionId" };

  try {
    const response = await falcon.marketInsights({ conditionId, limit: 10 });
    return response?.data?.results?.[0] || null;
  } catch (error) {
    return {
      error: error.body?.error?.message || error.message
    };
  }
}

function buildComparisonRow(market, insight) {
  const prices = parseJsonField(market.outcomePrices) || [];
  const yesPrice = Number(prices[0]);
  const noPrice = Number(prices[1]);
  const spread = Number(market.spread);
  const volumeTrend = insight?.volume_trend || null;
  const top1WalletPct = numberOrNull(insight?.top1_wallet_pct);
  const uniqueTraders7d = numberOrNull(insight?.unique_traders_7d);
  const volume24h = numberOrNull(insight?.current_volume_24h);

  return {
    question: market.question,
    slug: market.slug,
    price: {
      yes: numberOrNull(yesPrice),
      no: numberOrNull(noPrice),
      bestBid: numberOrNull(market.bestBid),
      bestAsk: numberOrNull(market.bestAsk),
      spread: numberOrNull(spread)
    },
    market: {
      volume: numberOrNull(market.volumeNum ?? market.volume),
      liquidity: numberOrNull(market.liquidityNum ?? market.liquidity),
      endDate: market.endDate
    },
    sentimentProxy: insight?.error
      ? { error: insight.error }
      : {
          source: "Falcon Market Insights agent 575",
          volumeTrend,
          liquidityTier: insight?.liquidity_tier || null,
          liquidityPercentile: numberOrNull(insight?.liquidity_percentile),
          currentVolume24h: volume24h,
          currentVolume7d: numberOrNull(insight?.current_volume_7d),
          volumeRatio24hTo7d: numberOrNull(insight?.volume_ratio_24h_to_7d),
          uniqueTraders7d,
          top1WalletPct,
          top10WalletPct: numberOrNull(insight?.top10_wallet_pct),
          squeezeRisk: Boolean(insight?.squeeze_risk_flag),
          whaleControl: Boolean(insight?.whale_control_flag),
          tradeConcentration: Boolean(insight?.trade_concentration_flag)
        },
    signal: describeSignal({
      yesPrice,
      spread,
      volumeTrend,
      top1WalletPct,
      uniqueTraders7d,
      volume24h,
      hasInsightError: Boolean(insight?.error)
    })
  };
}

function describeSignal({
  yesPrice,
  spread,
  volumeTrend,
  top1WalletPct,
  uniqueTraders7d,
  volume24h,
  hasInsightError
}) {
  if (hasInsightError) return "price only: Falcon insight unavailable";

  const notes = [];
  if (volumeTrend === "Spiking" && yesPrice >= 0.4 && yesPrice <= 0.6) {
    notes.push("watch: volume spiking while price is near 50/50");
  }
  if (volumeTrend === "Declining" && (yesPrice >= 0.65 || yesPrice <= 0.35)) {
    notes.push("caution: strong price with declining activity");
  }
  if (top1WalletPct !== null && top1WalletPct >= 30) {
    notes.push("concentration: top wallet share is high");
  }
  if (spread !== null && spread <= 0.01 && volume24h !== null && volume24h > 5000) {
    notes.push("tradable: tight spread with meaningful 24h volume");
  }
  if (uniqueTraders7d !== null && uniqueTraders7d < 50) {
    notes.push("thin crowd: low unique trader count");
  }

  return notes.length ? notes.join("; ") : "neutral: no obvious price/pulse divergence";
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function printHelp() {
  console.log(`Polymarket Falcon Starter

Usage:
  npm run polymarket -- gamma-markets [--limit 10] [--active true] [--closed false] [--summary true]
  npm run polymarket -- falcon-markets --slug <market-slug> [--min-volume 100] [--closed true]
  npm run polymarket -- trader-stats --wallet <0x...> [--timeframe 90d]
  npm run polymarket -- sentiment --slug <market-slug> [--window 24h]
  npm run polymarket -- cross-compare --topic <topic-slug>
  npm run polymarket -- sentiment-vs-price [--limit 5]
  npm run polymarket -- find-arbs [--pm-limit 25] [--kalshi-limit 250] [--min-edge 0.01] [--min-kalshi-liquidity 1]
  npm run polymarket -- find-polymarket-baskets [--event-limit 100] [--min-edge 0.005]
  npm run polymarket -- smart-money [--limit 25] [--wallet-limit 10]
  npm run polymarket -- falcon-agent --agent <id> [--param key=value] [--limit 100]

Env:
  FALCON_API_TOKEN        Required for Falcon calls
  FALCON_BASE_URL         Defaults to https://narrative.agent.heisenberg.so
  FALCON_MARKETS_AGENT_ID Defaults to 574
  POLYMARKET_GAMMA_URL    Defaults to https://gamma-api.polymarket.com
`);
}
