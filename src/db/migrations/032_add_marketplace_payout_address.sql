-- 032: Add payout_address to marketplace_strategies for creator USDT wallet
ALTER TABLE marketplace_strategies
  ADD COLUMN IF NOT EXISTS payout_address TEXT;
