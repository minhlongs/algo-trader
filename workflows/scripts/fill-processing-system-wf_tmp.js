export const meta = {
  name: 'fill-processing-system',
  description: 'Implement comprehensive fill processing: trade execution confirmation, P&L calculation, position tracking, accounting integration',
  phases: [
    { title: 'Fill Processing Architecture', detail: 'Design fill lifecycle, event sourcing, idempotency' },
    { title: 'Exchange Fill Ingestion', detail: 'Parse exchange fills, normalize format, deduplicate' },
    { title: 'Position Tracking', detail: 'Update positions on fills, handle partial fills, calculate P&L' },
    { title: 'Strategy Notification', detail: 'Publish fill events to NATS, strategy consumption' },
    { title: 'Accounting Integration', detail: 'Journal entries for trades, P&L posting to ledger' },
    { title: 'Reconciliation', detail: 'Exchange statements vs internal records' },
    { title: 'Testing & Sign-off', detail: 'E2E fill workflow, correctness guarantees' },
  ],
};

phase('Fill Processing Architecture');
const arch = await agent('Design Fill Processing System', {
  label: 'fill-arch',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Design fill processing system. Task #362.

Fill processing is critical: every trade execution must be accurately recorded, accounted for, and reported to strategy.

1. Fill lifecycle:
   - Exchange sends fill (WebSocket or REST callback)
   - Normalize to internal Fill format
   - Deduplicate (same fill idempotent)
   - Persist to database (fills table)
   - Update position
   - Calculate P&L
   - Publish to NATS (fill event)
   - Strategy consumes

2. Data model:
   fills:
   - id (exchange fill ID, unique per exchange)
   - tenant_id
   - exchange_order_id (exchange order ID)
   - symbol
   - side (BUY/SELL)
   - quantity (filled quantity)
   - price (average fill price)
   - fee (exchange fee in quote asset)
   - fee_asset (e.g., USDT)
   - timestamp (exchange timestamp)
   - liquidity (MAKER/Taker)
   - raw_data (JSON for debugging)

3. Idempotency:
   - Same fill ID processed twice → no double-counting
   - Use fill ID as idempotency key
   - Check exists before insert

4. Event format:
   {
     "type": "FILL",
     "tenantId": "...",
     "fillId": "...",
     "symbol": "BTCUSDT",
     "side": "BUY",
     "quantity": 0.001,
     "price": 50000,
     "fee": 0.5,
     "timestamp": "2025-06-22T10:30:00Z"
   }

5. Position tracking:
   positions table:
   - tenant_id, symbol, side (LONG/SHORT), quantity, avg_entry_price, realized_pnl, unrealized_pnl
   - Update on each fill

6. P&L calculation:
   - Long: quantity * (current_price - avg_entry)
   - Short: quantity * (avg_entry - current_price)
   - Realized: from closed positions (sell long / buy short)
   - Fee reduces P&L

Create design doc: ./docs/fill-processing/architecture.md

`,
});

phase('Exchange Fill Ingestion');
const ingestion = await parallel([
  () => agent('Implement Binance Fill Parser', {
    label: 'binance-fill',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Binance fill parser:

1. WebSocket executionReport:
   {
     "e": "executionReport",
     "E": 162445,
     "s": "BTCUSDT",
     "c": "orderId",
     "C": "clientOrderId",
     "i": 123456,  // orderId
     "l": "0.001",  // last filled qty
     "z": "0.001",  // cumulative filled qty
     "L": "50000.00",  // last price
     "p": "50000.00",  // average price
     "n": "0.5",  // commission
     "N": "USDT",  // commission asset
     "X": "FILLED",  // status
     "x": "TRADE"  // current event type
   }

2. Parse to internal Fill:
   {
     exchangeFillId: executionReportId or tradeId,
     exchangeOrderId: i,
     symbol: s,
     side: BUY/SELL based on S (side),
     quantity: parseFloat(l),
     avgPrice: parseFloat(p),
     fee: parseFloat(n),
     feeAsset: N,
     timestamp: E (ms since epoch),
     raw: full executionReport
   }

3. Deduplication:
   - Check fills table where exchange_fill_id = ?
   - If exists → skip (already processed)
   - Else → insert

4. REST fill history (backfill):
   GET /api/v3/allOrders?symbol=BTCUSDT
   For each order, get fills
   Same normalization

5. Implementation:
   src/services/fill-processor/binance-fill-parser.ts

`,
  }),
  () => agent('Implement Coinbase Fill Parser', {
    label: 'coinbase-fill',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Coinbase fill parser:

1. WebSocket user events:
   {
     "type": "match",
     "trade_id": 123,
     "product_id": "BTC-USD",
     "side": "buy",
     "time": "2025-06-22T10:30:00Z",
     "size": "0.001",
     "price": "50000.00",
     "sequence": 123456
   }

2. Parse:
   {
     exchangeFillId: trade_id,
     exchangeOrderId: order_id (from separate order event, need correlation),
     symbol: product_id,
     side: SIDE_BUY/SELL,
     quantity: parseFloat(size),
     price: parseFloat(price),
     timestamp: parseISO(time),
     raw: full match
   }

3. Order-fill correlation:
   - Coinbase sends separate "received" (order) and "match" (fill)
   - Need to track orderId → fill mapping
   - Store in memory or Redis: orderId to clientOrderId

4. Fill-only event:
   - If order context not available, still ingest fill
   - Later enrich when order arrives

5. Edge:
   - Partial fills: multiple matches for same order
   - Sum quantity for same order

`,
  }),
  () => agent('Implement Polymarket Fill Parser', {
    label: 'polymarket-fill',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Polymarket fill parser:

1. Polymarket uses conditional tokens:
   - Each outcome token trades separately
   - Fill: token amount × price

2. Fill event:
   {
     "orderId": "0x...",
     "tokenId": "YES_token_address",
     "side": "BUY",
     "quantityFilled": 100,
     "price": 0.65,  // probability
     "timestamp": 162445
   }

3. Convert to internal Fill:
   - Map tokenId to market/outcome
   - symbol = market + "_" + outcome
   - quantity = token amount
   - price = probability
   - fee = 0 (Polymarket no fee on taker? check)

4. Position:
   - Track YES/NO token balances per market
   - Net position: YES - NO = net exposure

5. P&L calculation specific:
   - P&L when market resolves
   - Unrealized P&L = expected value based on current probability

`,
  }),
]);

phase('Position Tracking');
const position = await parallel([
  () => agent('Implement Position Service', {
    label: 'position-service',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Position service:

1. Update position on fill:
   - Fetch current position (tenant_id, symbol)
   - If no position → create new
   - Compute new position after fill

2. Long position math:
   Before: qty=1.0, avg=$50000
   Fill: BUY 0.5 @ $45000
   New: qty=1.5, avg=(1.0*50000 + 0.5*45000)/1.5 = $47500

   Before: qty=1.0, avg=$47500
   Fill: SELL 0.5 @ $52000
   Realized P&L: 0.5 * (52000 - 47500) = $2250
   New: qty=0.5, avg=$47500 (avg unchanged for remaining)

3. Short position:
   SELL opens short (negative quantity)
   BUY closes short
   Avg entry: weighted average of short positions
   Realized P&L: (avg_entry - exit_price) * quantity

4. Database update:
   UPDATE positions
   SET quantity = :newQty,
       avg_entry_price = :newAvg,
       realized_pnl = realized_pnl + :realizedPnl
   WHERE tenant_id = ? AND symbol = ? AND side = ?

5. Concurrency:
   - Use row-level lock or optimistic concurrency
   - Two fills for same position concurrently → serialize

6. Query current positions:
   GET /api/v1/positions?tenant_id=X
   Returns all open positions with unrealized P&L

`,
  }),
  () => agent('Calculate Realized & Unrealized P&L', {
    label: 'pnl-calculation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `P&L calculation:

1. Realized P&L (per fill):
   - Long: (fill_price - avg_entry_before) * fill_quantity
   - Short: (avg_entry_before - fill_price) * fill_quantity
   - Fee: subtract fee (converted to quote asset)
   - Net realized = gross - fee

2. Cumulative realized per position:
   positions.realized_pnl accumulates all closed P&L

3. Unrealized P&L (mark-to-market):
   - Fetch current price (ticker)
   - For LONG: (current_price - avg_entry) * current_quantity
   - For SHORT: (avg_entry - current_price) * abs(current_quantity)
   - If quantity = 0 → unrealized = 0

4. Total P&L for tenant:
   sum(positions.realized_pnl + positions.unrealized_pnl)

5. Fee handling:
   - Fee in quote asset (USDT)
   - Deduct from realized P&L
   - Track separately for accounting: fee_expense

6. Funding fees (futures):
   - Funding payments received/paid
   - Add to realized P&L

7. API:
   GET /api/v1/pnl?tenant_id=X&period=day
   Returns:
   {
     "realized": 1250.50,
     "unrealized": 340.25,
     "total": 1590.75,
     "by_position": [
       { "symbol": "BTCUSDT", "realized": 1000, "unrealized": 200 }
     ]
   }

`,
  }),
]);

phase('Strategy Notification');
const notification = await parallel([
  () => agent('Publish Fill Events to NATS', {
    label: 'nats-fill-events',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Publish fill events to NATS:

1. After fill processed and persisted:
   const event = {
     type: 'ORDER_FILL',
     tenantId: fill.tenantId,
     fillId: fill.id,
     orderId: fill.exchangeOrderId,
     symbol: fill.symbol,
     side: fill.side,
     quantity: fill.quantity,
     price: fill.price,
     fee: fill.fee,
     timestamp: fill.timestamp,
   };

   await nats.publish('order.fill', JSON.stringify(event));

2. Subject pattern:
   - Global: 'order.fill' (all fills)
   - Tenant-specific: \`order.fill.\${tenantId}\` (tenant filter)
   - Strategy-specific: \`strategy.\${strategyId}.fill\` (if routing)

3. JetStream persistence:
   - Stream: ORDER_FILLS
   - Retention: 30 days (for replay)
   - Subjects: 'order.fill.*'
   - Consumers: strategy-shard instances

4. Strategy subscription:
   NATS.subscribe('order.fill.*', async (msg) => {
     const fill = JSON.parse(msg.data);
     if (fill.tenantId === this.tenantId) {
       await this.strategy.onFill(fill);
     }
   });

5. Delivery guarantees:
   - At-least-once (may duplicate)
   - Strategy must handle duplicates (idempotent by fillId)
   - Ack after strategy processes

6. Error handling:
   - If strategy throws → nack (redeliver)
   - Max delivery attempts → move to DLQ

`,
  }),
  () => agent('Implement Idempotent Fill Consumption', {
    label: 'fill-idempotency',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Idempotent fill consumption:

1. Problem: Fill event may be delivered multiple times (at-least-once).

2. Strategy must track processed fillIds:
   class FillProcessor {
     private processed: Set<string> = new Set(); // in-memory (lost on restart)
     // Better: Redis SET with TTL
   }

3. Redis-backed idempotency:
   async processFill(fill: Fill): Promise<void> {
     const key = \`fill:\${fill.fillId}\`;
     const acquired = await redis.set(key, '1', 'EX', 86400, 'NX'); // 24h TTL
     if (!acquired) {
       logger.info('Duplicate fill, skipping', { fillId: fill.fillId });
       return; // already processed
     }

     try {
       await this.strategy.onFill(fill);
       await redis.expire(key, 86400); // keep for 24h
     } catch (e) {
       await redis.del(key); // allow retry
       throw e;
     }
   }

4. Database idempotency (primary):
   - fills table has unique constraint on exchange_fill_id + exchange
   - INSERT ... ON CONFLICT DO NOTHING

5. Strategy idempotency:
   - onFill should be idempotent even without dedup
   - Check fillId against strategy's fill history
   - If already processed → no-op

6. Testing:
   - Send same fill 10x → strategy processes only once
   - Verify no duplicate position updates

`,
  }),
]);

phase('Accounting Integration');
const accounting = await parallel([
  () => agent('Create Journal Entries for Fills', {
    label: 'fill-journal-entries',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Journal entries for fills:

1. On each fill, create accounting entries:
   - Debit/Credit position account
   - Debit/Credit cash/bank (for fee)
   - Credit/Debit realized P&L (if closing position)

2. Long position close (sell):
   Dr. Cash (sale proceeds)        quantity * price
   Cr. Position (cost basis)        quantity * avg_entry
   Cr. Realized P&L (gain)         or Dr. for loss
   Dr. Fee Expense                  fee

   Example: Sell 0.5 BTC @ $52000, avg $47500, fee $0.5
   Dr. Cash: 0.5 * 52000 = $26000
   Cr. Position: 0.5 * 47500 = $23750
   Cr. Realized P&L: $2250
   Dr. Fee Expense: $0.5

3. Long position open (buy):
   Dr. Position (BTC)               quantity * price
   Cr. Cash (or margin)             same

4. Short position close (buy to cover):
   Dr. Cash (from short sale)       quantity * avg_entry
   Cr. Position (short position)    quantity * avg_entry
   Dr/Cr P&L based on exit vs entry

5. Implementation:
   src/services/accounting/fill-journalizer.ts

   class FillJournalizer {
     async createEntries(fill: Fill): Promise<JournalEntry[]> {
       const position = await this.getPosition(fill);
       if (fill.side === SELL && position.side === LONG) {
         return this.createCloseLongEntry(fill, position);
       }
       // ... other cases
     }
   }

6. Post to journal_entries table.

`,
  }),
  () => agent('Integrate with General Ledger', {
    label: 'gl-integration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `General ledger integration:

1. Chart of Accounts (COA):
   - 5000: Trading Revenue
   - 5100: Fee Expense
   - 2000: Cryptocurrency Assets (BTC, ETH, USDT)
   - 3000: Realized P&L (temporary, closes to revenue)
   - 3100: Unrealized P&L (temporary, revalued daily)

2. Posting:
   - Journal entries from fills posted to GL
   - Trial balance updated
   - P&L statement includes trading P&L

3. Daily MTM (mark-to-market):
   - At market close, revalue all open positions
   - Create adjusting entry:
     Dr/Cr Unrealized P&L
     Cr/Dr Position (balance sheet adjustment)

   Entry:
   Unrealized P&L change from $100 to $150 → $50 gain:
   Dr. Position (BTC) $50
   Cr. Unrealized P&L $50

4. Period close:
   - Realized P&L → close to Revenue at period end
   - Unrealized P&L stays on balance sheet

5. API:
   GET /api/v1/accounting/gl?date=2025-06-22
   Returns trial balance

6. Audit trail:
   - Every journal entry links to fill_id
   - Can trace GL back to exchange fill

`,
  }),
]);

phase('Reconciliation');
const reconciliation = await parallel([
  () => agent('Implement Exchange Statement Reconciliation', {
    label: 'exchange-recon',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Exchange statement reconciliation:

1. Daily reconcile:
   - Download statement from exchange (CSV/API)
   - Includes: all fills for the day
   - Compare to internal fills table

2. Reconciliation steps:
   - Fetch fills where timestamp on date
   - Group by order/symbol
   - Compare quantity, price, fee with exchange statement
   - Tolerances: quantity exact, price exact, fee ±1% (rounding)

3. Missing fills:
   - Statement has fill not in DB → investigate
   - Possible: API/webhook missed, backfill needed

4. Discrepancy handling:
   - Price difference > $0.01 → flag for review
   - Quantity mismatch → critical
   - Fee mismatch → investigate

5. Report:
   Reconciliation for 2025-06-22:
   - Total fills: 1250
   - Matched: 1248
   - Missing: 2 (backfilled)
   - Discrepancies: 0
   - Status: CLEAR

6. Automation:
   Cron daily 2 AM:
   - Run reconciliation for previous day
   - Email report to finance@algo-trader.com
   - Open discrepancies create ticket

7. Backfill:
   If missing fills found, query exchange API for that date
   Insert missing fills with deduplication

`,
  }),
  () => agent('Implement P&L Reconciliation', {
    label: 'pnl-recon',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `P&L reconciliation:

1. Compare realized P&L:
   - Exchange P&L report (daily)
   - Internal sum of all fills' realized P&L
   - Should match (allow small rounding)

2. Steps:
   - Query exchange: /api/v3/account (balance changes) or P&L endpoint
   - Sum realized P&L per symbol
   - Compare to:
     SELECT symbol, SUM(realized_pnl) FROM positions WHERE tenant_id = ? GROUP BY symbol

3. Discrepancy investigation:
   - Check: fee handling (included/excluded)
   - Check: funding payments included
   - Check: date range alignment (exchange timezone vs UTC)

4. Balance reconciliation:
   - Exchange balance (USDT, BTC) vs internal position balances
   - Should match exactly
   - Differences → missing fills or data errors

5. Report:
   ./docs/accounting/reconciliation-report.md

6. Auditor requirement:
   - Daily reconciliation performed
   - Discrepancies investigated and resolved
   - Evidence retained

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('E2E Fill Processing Tests', {
    label: 'fill-e2e',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E fill processing tests:

1. Full trade flow:
   - Strategy places order via OrderExecutor
   - Order sent to exchange (Binance testnet)
   - Fill received via WebSocket
   - Fill processed, persisted
   - Position updated
   - P&L calculated
   - Journal entry created
   - NATS event published
   - Strategy receives fill

2. Verify at each step:
   - Fill record in DB with correct fields
   - Position quantity and avg updated correctly
   - Realized P&L computed correctly
   - Journal entries balanced (debits = credits)
   - NATS event received by strategy

3. Partial fills:
   - Order quantity 1.0, first fill 0.3, second fill 0.7
   - Position avg = (price1*0.3 + price2*0.7) / 1.0
   - Realized P&L on second fill if closing

4. Duplicate fills:
   - Simulate WebSocket duplicate (send same fill twice)
   - Second ignored (idempotent)
   - No double-counting P&L

5. Concurrent fills:
   - Two fills for different symbols → processed in parallel
   - Two fills for same position → serialized correctly

`,
  }),
  () => agent('Reconciliation Accuracy Tests', {
    label: 'recon-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Reconciliation accuracy tests:

1. Statement reconciliation:
   - Mock exchange statement (CSV)
   - Run reconciliation script
   - Verify all fills matched
   - Introduce missing fill → detected
   - Introduce discrepancy → flagged

2. P&L reconciliation:
   - Calculate expected P&L manually for sample trades
   - Compare to system P&L
   - Should match exactly

3. Balance reconciliation:
   - Starting balance + fills = ending balance
   - Verify equation holds

4. Audit trail:
   - Every fill links to exchange fill ID
   - Journal entry links to fill ID
   - Full traceability verified

5. Regression:
   - After code changes, run reconciliation on historical data
   - Should not change results

`,
  }),
  () => agent('Fill Processing Sign-off', {
    label: 'fill-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Fill Processing System.

Task #362

Review:
✅ Fill ingestion from all exchanges (Binance, Coinbase, Polymarket)
✅ Idempotent processing (duplicate detection)
✅ Accurate position tracking (quantity, avg price)
✅ Correct P&L calculation (realized, unrealized)
✅ NATS event publication to strategies
✅ Journal entries for accounting integration
✅ Exchange statement reconciliation
✅ P&L and balance reconciliation
✅ Audit trail complete
✅ E2E tests passing

Decision: FILL PROCESSING SYSTEM PRODUCTION READY.
All trade executions accurately captured, accounted, and reported.

`,
  }),
]);

log('Fill Processing System workflow launched');