-- What the broker recorded when a copied position ended. Read back from the
-- broker's deal records rather than inferred from prices, so a stop loss or a
-- manual close is reported as accurately as one this platform sent.
CREATE TYPE "CloseReason" AS ENUM ('STOP_LOSS', 'TAKE_PROFIT', 'COPIED_CLOSE', 'MANUAL', 'OTHER');

ALTER TABLE "PositionMapping"
  ADD COLUMN "closePrice"  DECIMAL(18,5),
  ADD COLUMN "profit"      DECIMAL(18,2),
  ADD COLUMN "closeReason" "CloseReason";
