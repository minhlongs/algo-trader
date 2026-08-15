-- Migration 048: prediction_history
-- Migrates flat-file predictions.json to PostgreSQL with proper indexes.
-- Dual-write: tracker writes to both PG and predictions.json during transition.

CREATE TABLE IF NOT EXISTS prediction_history (
  id VARCHAR(128) PRIMARY KEY,
  market_id VARCHAR(128) NOT NULL,
  title TEXT NOT NULL,
  predicted_outcome VARCHAR(4) NOT NULL CHECK (predicted_outcome IN ('YES', 'NO')),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  predicted_at BIGINT NOT NULL,
  market_yes_price NUMERIC(10,6) NOT NULL,
  strategy VARCHAR(128) NOT NULL,
  actual_outcome VARCHAR(4) NULL CHECK (actual_outcome IN ('YES', 'NO')),
  resolved_at BIGINT NULL,
  correct BOOLEAN NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_prediction_history_strategy ON prediction_history(strategy);
CREATE INDEX IF NOT EXISTS idx_prediction_history_predicted_at ON prediction_history(predicted_at);
CREATE INDEX IF NOT EXISTS idx_prediction_history_actual_outcome ON prediction_history(actual_outcome);
CREATE INDEX IF NOT EXISTS idx_prediction_history_market_id ON prediction_history(market_id);
CREATE INDEX IF NOT EXISTS idx_prediction_history_pending ON prediction_history(actual_outcome) WHERE actual_outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_prediction_history_correct ON prediction_history(correct) WHERE correct IS NOT NULL;
