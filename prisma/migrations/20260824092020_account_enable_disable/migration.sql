-- AlterTable
ALTER TABLE "TradingAccount" ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "TradingAccount_isEnabled_idx" ON "TradingAccount"("isEnabled");
