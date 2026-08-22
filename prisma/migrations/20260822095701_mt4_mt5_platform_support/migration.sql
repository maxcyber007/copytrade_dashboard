-- Support members trading on MT4 as well as MT5.
-- The account table is renamed rather than recreated so existing rows survive.

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('MT4', 'MT5');

-- CreateEnum
CREATE TYPE "PositionMode" AS ENUM ('HEDGING', 'NETTING');

-- RenameTable
ALTER TABLE "MT5Account" RENAME TO "TradingAccount";

-- RenameConstraint / RenameIndex
ALTER TABLE "TradingAccount" RENAME CONSTRAINT "MT5Account_pkey" TO "TradingAccount_pkey";
ALTER TABLE "TradingAccount" RENAME CONSTRAINT "MT5Account_userId_fkey" TO "TradingAccount_userId_fkey";
ALTER INDEX "MT5Account_userId_idx" RENAME TO "TradingAccount_userId_idx";
ALTER INDEX "MT5Account_connectionStatus_idx" RENAME TO "TradingAccount_connectionStatus_idx";
ALTER INDEX "MT5Account_copyStatus_idx" RENAME TO "TradingAccount_copyStatus_idx";
ALTER INDEX "MT5Account_accountRole_idx" RENAME TO "TradingAccount_accountRole_idx";
ALTER INDEX "MT5Account_createdAt_idx" RENAME TO "TradingAccount_createdAt_idx";
ALTER INDEX "MT5Account_userId_login_server_key" RENAME TO "TradingAccount_userId_login_server_key";

-- AlterTable: platform and broker volume constraints
ALTER TABLE "TradingAccount" ADD COLUMN     "platform" "Platform" NOT NULL DEFAULT 'MT5',
ADD COLUMN     "positionMode" "PositionMode" NOT NULL DEFAULT 'HEDGING',
ADD COLUMN     "brokerMinLot" DECIMAL(10,2) NOT NULL DEFAULT 0.01,
ADD COLUMN     "brokerMaxLot" DECIMAL(10,2) NOT NULL DEFAULT 100,
ADD COLUMN     "brokerLotStep" DECIMAL(10,2) NOT NULL DEFAULT 0.01;

-- CreateIndex
CREATE INDEX "TradingAccount_platform_idx" ON "TradingAccount"("platform");

-- AlterTable: platform of the master account behind a strategy
ALTER TABLE "Strategy" ADD COLUMN     "masterPlatform" "Platform" NOT NULL DEFAULT 'MT5';

-- AlterTable: platform the master event originated from
ALTER TABLE "TradeEvent" ADD COLUMN     "platform" "Platform" NOT NULL DEFAULT 'MT5';

-- AlterTable: MT4 partial closes remap the member ticket
ALTER TABLE "PositionMapping" ADD COLUMN     "ticketHistory" TEXT[] DEFAULT ARRAY[]::TEXT[];
