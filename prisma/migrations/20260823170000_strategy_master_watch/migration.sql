-- Lets a strategy publish from a trading account the platform already watches,
-- instead of from a master EA on a VPS. `watchStartedAt` marks the moment
-- watching began: positions open before it are a baseline, never copied.
ALTER TABLE "Strategy"
  ADD COLUMN "watchStartedAt"  TIMESTAMP(3),
  ADD COLUMN "watchLastPollAt" TIMESTAMP(3);
