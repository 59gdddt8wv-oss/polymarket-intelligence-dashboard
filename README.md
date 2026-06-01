# Polymarket Falcon Starter

Минимальный CLI для работы с:

- Falcon / Polymarket Analytics API: аналитика рынков, трейдеров, sentiment.
- Официальным публичным Polymarket Gamma API: поиск активных рынков без ключа.

## Быстрый старт

```bash
cp .env.example .env
# Впиши FALCON_API_TOKEN в .env
npm run help
```

Node.js 18+ достаточно, внешних npm-зависимостей нет. Если `npm` недоступен в окружении, запускай напрямую:

```bash
node src/cli.js help
```

## Команды

Dashboard:

```bash
node dashboard/server.js
```

Открой `http://localhost:4173`.

Static dashboard для GitHub Pages:

```bash
node scripts/build-static-dashboard.js
```

GitHub Pages workflow публикует `dashboard/public` и обновляет JSON-данные каждые 6 часов.

Публичные активные рынки Polymarket:

```bash
npm run polymarket -- gamma-markets --limit 5
```

Короткий summary вместо полного сырого JSON:

```bash
node src/cli.js gamma-markets --limit 5 --summary true
```

Любой Falcon agent из документации можно дернуть напрямую:

```bash
node src/cli.js falcon-agent \
  --agent 574 \
  --param market_slug=will-jesus-christ-return-before-gta-vi-665 \
  --param min_volume=100 \
  --param closed=False \
  --limit 10
```

Рынок через Falcon Analytics:

```bash
npm run polymarket -- falcon-markets \
  --slug bitcoin-up-or-down-january-17-3pm-et \
  --min-volume 100 \
  --closed true
```

Статистика трейдера:

```bash
npm run polymarket -- trader-stats \
  --wallet 0x1a2b3c4d5e6f0000000000000000000000000000 \
  --timeframe 90d
```

Sentiment по рынку:

```bash
npm run polymarket -- sentiment \
  --slug fed-rate-cut-march-2026 \
  --window 24h
```

Сравнение цены с рыночным sentiment/pulse по нескольким рынкам:

```bash
node src/cli.js sentiment-vs-price --limit 5
```

Пока Falcon Social Pulse `agent_id 585` не возвращает стабильный market-level ответ по `market_slug`/`condition_id`, команда использует надежный proxy из Falcon Market Insights `agent_id 575`: тренд объема, концентрацию кошельков, squeeze/liquidity flags и число трейдеров.

Поиск потенциальных вилок Polymarket vs Kalshi:

```bash
node src/cli.js find-arbs --pm-limit 25 --kalshi-limit 250 --min-edge 0.01
```

Команда сравнивает похожие по тексту бинарные рынки и считает два направления: `Polymarket YES + Kalshi NO` и `Kalshi YES + Polymarket NO`. Это черновой сканер: перед сделкой нужно вручную сверить правила разрешения, комиссии и доступную глубину стакана.

По умолчанию отбрасываются Kalshi-рынки с нулевой ликвидностью:

```bash
node src/cli.js find-arbs \
  --pm-limit 100 \
  --kalshi-limit 1000 \
  --min-edge 0.005 \
  --min-similarity 0.3 \
  --min-kalshi-liquidity 1
```

Внутренние корзинные вилки Polymarket по event-группам:

```bash
node src/cli.js find-polymarket-baskets --event-limit 100 --min-edge 0.005
```

Команда считает `buy all YES` и `buy all NO` внутри события. Это корректно только для событий, где ровно один исход должен стать YES, поэтому каждый кандидат нужно сверять с правилами event.

Поиск smart money:

```bash
node src/cli.js smart-money --limit 25 --wallet-limit 10
```

Команда берет Falcon Score Leaderboard `agent_id 584`, затем обогащает кошельки через Wallet 360 `agent_id 581`. Фильтр оставляет трейдеров с высоким score/PnL/ROI/win-rate/sharpe и понижает или отбрасывает кошельки с risk flags: sybil, suspicious timing, single-market dependence, высокой концентрацией и нестабильным sizing.

Stateful watcher для автоматизации:

```bash
node scripts/watch-smart-money.js --init
node scripts/watch-smart-money.js
node scripts/watch-smart-money.js --report
node scripts/watch-smart-money.js --telegram-test
```

Первый запуск сохраняет baseline в `data/smart-money-seen.json`, последующие печатают JSON только если появились новые кошельки. Режим `--report` печатает текущую сводку вручную: сколько заработано за 15 дней, win rate, ROI, Sharpe, объем, число сделок, лучшая категория и risk flags.

Для отправки в Telegram добавь в `.env`:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

`--telegram-test` отправит тестовую сводку в Telegram. Обычный watcher отправляет сообщение только когда появились новые кошельки.

## Как это можно развивать

1. Собирать `gamma-markets` по категориям и объемам.
2. Обогащать выбранные рынки через Falcon: sentiment, smart money, cross-market gaps.
3. Сохранять ответы в `data/` или SQLite.
4. Добавить scoring: ликвидность, спред, объем, divergence sentiment/price.
5. Отправлять лучшие сигналы в Telegram или dashboard.

## Источники API

- Falcon API: `https://api.polymarketanalytics.com/`
- Polymarket docs: `https://docs.polymarket.com/`
