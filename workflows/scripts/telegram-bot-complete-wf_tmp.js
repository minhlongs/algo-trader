export const meta = {
  name: 'telegram-bot-complete',
  description: 'Complete Telegram bot: trading commands, alerts, portfolio management, testing, production deployment',
  phases: [
    { title: 'Telegram Bot Planning', detail: 'Design bot commands, security, deployment' },
    { title: 'Bot Commands', detail: 'Trading commands: /buy, /sell, /positions, /pnl, /alerts' },
    { title: 'Alert Integration', detail: 'Real-time alerts: price targets, P&L, anomalies' },
    { title: 'Security & Auth', detail: 'Chat ID whitelist, 2FA verification, command approval' },
    { title: 'Testing', detail: 'Unit tests, integration tests, mock Telegram API' },
    { title: 'Deployment & Sign-off', detail: 'Bot deployment, webhook setup, production validation' },
  ],
};

phase('Planning');
const planning = await agent('Telegram Bot Plan', {
  label: 'telegram-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan Telegram bot completion. Task #253.

Scope:
- Trading commands (/buy, /sell, /cancel, /positions)
- Portfolio queries (/pnl, /balance, /performance)
- Alert management (/alert add price BTC 100000, /alert list)
- Admin commands (/admin status, /admin pause)
- Security: chat ID whitelist, 2FA

Create plan in ./plans/telegram-bot/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Bot Commands');
const commands = await parallel([
  () => agent('Implement Trading Commands', {
    label: 'trading-commands-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement trading commands:

/buy <symbol> <quantity> [limit|market] [price]
/sell <symbol> <quantity> [limit|market] [price]
/cancel <orderId>
/positions [symbol] -- show open positions
/orders [status] -- show orders

Implementation:
- src/bot/telegram/commands/trading.ts
- src/bot/telegram/handlers/trading.handler.ts
- Use StrategyShard service for order execution

`,
  }),
  () => agent('Implement Portfolio Commands', {
    label: 'portfolio-commands-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement portfolio commands:

/pnl [period] -- P&L summary (today, week, month, all)
/balance -- account balances across exchanges
/performance -- Sharpe, max drawdown, win rate
/history [limit] -- recent trades

Files: src/bot/telegram/commands/portfolio.ts, src/bot/telegram/handlers/portfolio.handler.ts

`,
  }),
  () => agent('Implement Alert Commands', {
    label: 'alert-commands-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement alert commands:

/alert add price BTC > 100000 -- price alert
/alert add volume ETH > 1000 -- volume alert
/alert add pnl -1000 -- stop-loss alert
/alert list -- show all alerts
/alert remove <id> -- delete alert

Files: src/bot/telegram/commands/alerts.ts, src/bot/telegram/handlers/alerts.handler.ts, src/services/alert-manager.ts

`,
  }),
]);

phase('Alert Integration');
const alertIntegration = await parallel([
  () => agent('Integrate Alert System', {
    label: 'alert-system-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate alerts with monitoring/risk system.

1. Alert manager: monitors market data, triggers alerts
2. Push notifications: send to Telegram chat when alert fires
3. Rate limiting: max 10 alerts per minute per user
4. Alert history: store in DB, view with /alert history

Files: src/services/alert-dispatcher.service.ts, src/bot/telegram/alert-sender.ts

`,
  }),
  () => agent('Test Alert Delivery', {
    label: 'alert-delivery-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test alert delivery:

1. Price alert: BTC crosses 100k → Telegram message received within 5s
2. Volume alert: ETH volume > threshold → message
3. P&L alert: loss > limit → message
4. Alert suppression: don't spam same alert repeatedly
5. Alert recovery: notify when condition clears

`,
  }),
]);

phase('Security & Auth');
const security = await parallel([
  () => agent('Implement Chat ID Whitelist', {
    label: 'chat-whitelist-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement chat ID whitelist.

Only pre-approved Telegram chat IDs can use the bot.

Implementation:
1. Admin command: /admin allow <chatId> (requires 2FA)
2. Database table: telegram_bot_chats (chat_id, user_id, added_at)
3. Middleware: check chat_id against whitelist before processing commands
4. Auto-reject: unknown chat → "unauthorized"

Files: src/bot/telegram/security/chat-whitelist.ts, src/bot/telegram/middleware/auth.ts, database/migrations/telegram_bot_chats.sql
`,
  }),
  () => agent('Implement 2FA for Sensitive Commands', {
    label: '2fa-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement 2FA for sensitive commands.

Sensitive: /admin, trading commands > $10k value.

2FA via:
1. Time-based OTP (TOTP) using user's authenticator app
2. Or Telegram 2FA (if bot has user's phone)

Flow:
- Command requires 2FA → bot sends "Enter code"
- User replies with 6-digit code
- Verify TOTP → execute

Files: src/bot/telegram/security/twofa.ts, src/services/totp.service.ts
`,
  }),
]);

phase('Testing');
const testing = await parallel([
  () => agent('Unit Tests for Bot', {
    label: 'bot-unit-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Unit tests for Telegram bot:

1. Command parsing: extract args, validate
2. Handler logic: mock services, verify calls
3. Error handling: invalid input, insufficient balance
4. Security: unauthorized chat blocked, 2FA required
5. Edge cases: empty responses, timeouts, malformed Telegram updates

Coverage >80%.

Files: tests/bot/telegram/*.test.ts
`,
  }),
  () => agent('Integration Tests with Mock Bot API', {
    label: 'bot-integration-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Integration tests:

Use telegram-mtproto or mock Telegram Bot API.

Scenarios:
1. User sends /buy BTC 0.1 → order placed → confirmation message
2. Alert fires → bot sends message
3. Unauthorized chat → rejected
4. 2FA flow: code verified → command executes
5. Concurrent commands: handled sequentially

`,
  }),
  () => agent('Load Test Bot', {
    label: 'bot-load-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Load test Telegram bot:

- 1000 concurrent users
- 10 commands/sec per user (peak)
- Bot API latency <200ms p95
- Memory usage stable (no leaks)

Tools: k6 or artillery.

`,
  }),
]);

phase('Deployment & Sign-off');
const deployment = await parallel([
  () => agent('Deploy Telegram Bot', {
    label: 'bot-deploy',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Deploy Telegram bot to production.

1. Set webhook: POST https://api.telegram.org/bot<token>/setWebhook?url=https://bot.algo-trader.workers.dev/webhook
2. Environment: BOT_TOKEN, ALLOWED_CHAT_IDS (config)
3. Worker: src/workers/telegram-bot.worker.ts
4. Secrets: BOT_TOKEN in Cloudflare Workers secrets
5. Monitoring: bot command count, errors, latency

`,
  }),
  () => agent('Production Smoke Tests', {
    label: 'bot-smoke-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Production smoke tests:

1. Send /start to bot → welcome message
2. /buy test (small amount) → order placed
3. /pnl → P&L displayed
4. Alert trigger → message received
5. Unauthorized chat → blocked

`,
  }),
  () => agent('Telegram Bot Sign-off', {
    label: 'telegram-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Telegram bot.

Review: commands, alerts, security, testing, deployment.

Decision: PRODUCTION.

`,
  }),
]);

log('Telegram Bot workflow launched');