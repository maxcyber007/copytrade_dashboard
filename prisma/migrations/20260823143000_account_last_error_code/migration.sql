-- Records the error code behind `lastError`, so a connection attempt the broker
-- already rejected can be refused on its merits instead of being retried at the
-- provider's expense.
ALTER TABLE "TradingAccount" ADD COLUMN "lastErrorCode" TEXT;
