-- CreateTable
CREATE TABLE "MetaApiBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "trialAmount" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "advanceAmount" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "deployedAccounts" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaApiBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaApiBalanceSnapshot_recordedAt_idx" ON "MetaApiBalanceSnapshot"("recordedAt");
