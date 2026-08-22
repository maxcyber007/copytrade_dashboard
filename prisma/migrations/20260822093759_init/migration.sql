-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('DEMO', 'LIVE');

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('MASTER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CopyStatus" AS ENUM ('IDLE', 'COPYING', 'PAUSED', 'STOPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'STOPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LotMode" AS ENUM ('FIXED', 'MULTIPLIER', 'BALANCE_RATIO', 'RISK_PERCENT');

-- CreateEnum
CREATE TYPE "TradeEventType" AS ENUM ('OPEN', 'MODIFY', 'CLOSE', 'PARTIAL_CLOSE', 'PENDING_ORDER', 'DELETE_PENDING');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('BUY', 'SELL', 'BUY_LIMIT', 'SELL_LIMIT', 'BUY_STOP', 'SELL_STOP');

-- CreateEnum
CREATE TYPE "EventProcessingStatus" AS ENUM ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CopyTradeStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED', 'PARTIALLY_CLOSED', 'PENDING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'BASIC', 'PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerified" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MT5Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'DEMO',
    "accountRole" "AccountRole" NOT NULL DEFAULT 'MEMBER',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerAccountId" TEXT,
    "encryptedPassword" TEXT,
    "encryptedInvestor" TEXT,
    "connectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "copyStatus" "CopyStatus" NOT NULL DEFAULT 'IDLE',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "equity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "margin" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "freeMargin" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "floatingPnl" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "peakEquity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openTrades" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MT5Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "StrategyStatus" NOT NULL DEFAULT 'DRAFT',
    "masterAccountId" TEXT,
    "masterAccountCode" TEXT,
    "minPlanTier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "totalReturnPct" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "maxDrawdownPct" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "winRatePct" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategySubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "copyStatus" "CopyStatus" NOT NULL DEFAULT 'IDLE',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopySettings" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "lotMode" "LotMode" NOT NULL DEFAULT 'MULTIPLIER',
    "fixedLot" DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    "multiplier" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "balanceRatio" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "riskPercent" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "maxLot" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "minLot" DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    "lotStep" DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    "copyBuy" BOOLEAN NOT NULL DEFAULT true,
    "copySell" BOOLEAN NOT NULL DEFAULT true,
    "copySl" BOOLEAN NOT NULL DEFAULT true,
    "copyTp" BOOLEAN NOT NULL DEFAULT true,
    "copyPendingOrders" BOOLEAN NOT NULL DEFAULT false,
    "reverseCopy" BOOLEAN NOT NULL DEFAULT false,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 20,
    "allowedSymbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slippagePoints" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskProfile" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "maxDailyLoss" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxDailyLossPct" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "maxDrawdownPct" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "maxLotPerTrade" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxTotalLot" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stopCopyOnBreach" BOOLEAN NOT NULL DEFAULT true,
    "closePositionsOnBreach" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskState" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tradingDay" TIMESTAMP(3) NOT NULL,
    "dailyStartEquity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dailyRealizedPnl" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "breachReason" TEXT,
    "breachedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterTrade" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "masterAccountId" TEXT,
    "masterAccountCode" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "volume" DECIMAL(10,2) NOT NULL,
    "openPrice" DECIMAL(18,5) NOT NULL,
    "closePrice" DECIMAL(18,5),
    "sl" DECIMAL(18,5),
    "tp" DECIMAL(18,5),
    "profit" DECIMAL(18,2),
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "masterTradeId" TEXT,
    "eventType" "TradeEventType" NOT NULL,
    "masterAccountCode" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "volume" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(18,5) NOT NULL,
    "sl" DECIMAL(18,5),
    "tp" DECIMAL(18,5),
    "masterBalance" DECIMAL(18,2),
    "masterEquity" DECIMAL(18,2),
    "status" "EventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "fanOutCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "TradeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyTrade" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "masterTradeId" TEXT,
    "eventType" "TradeEventType" NOT NULL,
    "masterTicket" TEXT NOT NULL,
    "memberTicket" TEXT,
    "masterSymbol" TEXT NOT NULL,
    "memberSymbol" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "masterVolume" DECIMAL(10,2) NOT NULL,
    "memberVolume" DECIMAL(10,2) NOT NULL,
    "masterPrice" DECIMAL(18,5) NOT NULL,
    "memberPrice" DECIMAL(18,5),
    "sl" DECIMAL(18,5),
    "tp" DECIMAL(18,5),
    "profit" DECIMAL(18,2),
    "status" "CopyTradeStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "skipReason" TEXT,
    "providerRequest" JSONB,
    "providerResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "CopyTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionMapping" (
    "id" TEXT NOT NULL,
    "masterTradeId" TEXT,
    "subscriptionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "masterTicket" TEXT NOT NULL,
    "memberTicket" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "volume" DECIMAL(10,2) NOT NULL,
    "openPrice" DECIMAL(18,5) NOT NULL,
    "sl" DECIMAL(18,5),
    "tp" DECIMAL(18,5),
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymbolMapping" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT,
    "accountId" TEXT,
    "masterSymbol" TEXT NOT NULL,
    "memberSymbol" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SymbolMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxAccounts" INTEGER NOT NULL DEFAULT 1,
    "maxStrategies" INTEGER NOT NULL DEFAULT 1,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemError" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "accountId" TEXT,
    "eventId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "MT5Account_userId_idx" ON "MT5Account"("userId");

-- CreateIndex
CREATE INDEX "MT5Account_connectionStatus_idx" ON "MT5Account"("connectionStatus");

-- CreateIndex
CREATE INDEX "MT5Account_copyStatus_idx" ON "MT5Account"("copyStatus");

-- CreateIndex
CREATE INDEX "MT5Account_accountRole_idx" ON "MT5Account"("accountRole");

-- CreateIndex
CREATE INDEX "MT5Account_createdAt_idx" ON "MT5Account"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MT5Account_userId_login_server_key" ON "MT5Account"("userId", "login", "server");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_code_key" ON "Strategy"("code");

-- CreateIndex
CREATE INDEX "Strategy_status_idx" ON "Strategy"("status");

-- CreateIndex
CREATE INDEX "Strategy_isPublic_idx" ON "Strategy"("isPublic");

-- CreateIndex
CREATE INDEX "Strategy_masterAccountId_idx" ON "Strategy"("masterAccountId");

-- CreateIndex
CREATE INDEX "Strategy_createdAt_idx" ON "Strategy"("createdAt");

-- CreateIndex
CREATE INDEX "StrategySubscription_userId_idx" ON "StrategySubscription"("userId");

-- CreateIndex
CREATE INDEX "StrategySubscription_strategyId_idx" ON "StrategySubscription"("strategyId");

-- CreateIndex
CREATE INDEX "StrategySubscription_copyStatus_idx" ON "StrategySubscription"("copyStatus");

-- CreateIndex
CREATE INDEX "StrategySubscription_status_idx" ON "StrategySubscription"("status");

-- CreateIndex
CREATE INDEX "StrategySubscription_createdAt_idx" ON "StrategySubscription"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StrategySubscription_accountId_strategyId_key" ON "StrategySubscription"("accountId", "strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "CopySettings_subscriptionId_key" ON "CopySettings"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskProfile_subscriptionId_key" ON "RiskProfile"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskState_accountId_key" ON "RiskState"("accountId");

-- CreateIndex
CREATE INDEX "RiskState_tradingDay_idx" ON "RiskState"("tradingDay");

-- CreateIndex
CREATE INDEX "MasterTrade_strategyId_idx" ON "MasterTrade"("strategyId");

-- CreateIndex
CREATE INDEX "MasterTrade_symbol_idx" ON "MasterTrade"("symbol");

-- CreateIndex
CREATE INDEX "MasterTrade_status_idx" ON "MasterTrade"("status");

-- CreateIndex
CREATE INDEX "MasterTrade_openedAt_idx" ON "MasterTrade"("openedAt");

-- CreateIndex
CREATE INDEX "MasterTrade_createdAt_idx" ON "MasterTrade"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MasterTrade_strategyId_ticket_key" ON "MasterTrade"("strategyId", "ticket");

-- CreateIndex
CREATE UNIQUE INDEX "TradeEvent_eventId_key" ON "TradeEvent"("eventId");

-- CreateIndex
CREATE INDEX "TradeEvent_strategyId_idx" ON "TradeEvent"("strategyId");

-- CreateIndex
CREATE INDEX "TradeEvent_status_idx" ON "TradeEvent"("status");

-- CreateIndex
CREATE INDEX "TradeEvent_eventType_idx" ON "TradeEvent"("eventType");

-- CreateIndex
CREATE INDEX "TradeEvent_ticket_idx" ON "TradeEvent"("ticket");

-- CreateIndex
CREATE INDEX "TradeEvent_receivedAt_idx" ON "TradeEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "TradeEvent_occurredAt_idx" ON "TradeEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "CopyTrade_accountId_idx" ON "CopyTrade"("accountId");

-- CreateIndex
CREATE INDEX "CopyTrade_subscriptionId_idx" ON "CopyTrade"("subscriptionId");

-- CreateIndex
CREATE INDEX "CopyTrade_strategyId_idx" ON "CopyTrade"("strategyId");

-- CreateIndex
CREATE INDEX "CopyTrade_status_idx" ON "CopyTrade"("status");

-- CreateIndex
CREATE INDEX "CopyTrade_masterTicket_idx" ON "CopyTrade"("masterTicket");

-- CreateIndex
CREATE INDEX "CopyTrade_memberTicket_idx" ON "CopyTrade"("memberTicket");

-- CreateIndex
CREATE INDEX "CopyTrade_createdAt_idx" ON "CopyTrade"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CopyTrade_eventId_accountId_key" ON "CopyTrade"("eventId", "accountId");

-- CreateIndex
CREATE INDEX "PositionMapping_masterTicket_idx" ON "PositionMapping"("masterTicket");

-- CreateIndex
CREATE INDEX "PositionMapping_memberTicket_idx" ON "PositionMapping"("memberTicket");

-- CreateIndex
CREATE INDEX "PositionMapping_accountId_idx" ON "PositionMapping"("accountId");

-- CreateIndex
CREATE INDEX "PositionMapping_status_idx" ON "PositionMapping"("status");

-- CreateIndex
CREATE INDEX "PositionMapping_createdAt_idx" ON "PositionMapping"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PositionMapping_accountId_masterTicket_key" ON "PositionMapping"("accountId", "masterTicket");

-- CreateIndex
CREATE INDEX "SymbolMapping_masterSymbol_idx" ON "SymbolMapping"("masterSymbol");

-- CreateIndex
CREATE INDEX "SymbolMapping_accountId_idx" ON "SymbolMapping"("accountId");

-- CreateIndex
CREATE INDEX "SymbolMapping_strategyId_idx" ON "SymbolMapping"("strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "SymbolMapping_strategyId_accountId_masterSymbol_key" ON "SymbolMapping"("strategyId", "accountId", "masterSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_tier_key" ON "SubscriptionPlan"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_providerRef_key" ON "PaymentTransaction"("providerRef");

-- CreateIndex
CREATE INDEX "PaymentTransaction_userId_idx" ON "PaymentTransaction"("userId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_createdAt_idx" ON "PaymentTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SystemError_code_idx" ON "SystemError"("code");

-- CreateIndex
CREATE INDEX "SystemError_severity_idx" ON "SystemError"("severity");

-- CreateIndex
CREATE INDEX "SystemError_source_idx" ON "SystemError"("source");

-- CreateIndex
CREATE INDEX "SystemError_createdAt_idx" ON "SystemError"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MT5Account" ADD CONSTRAINT "MT5Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "MT5Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySubscription" ADD CONSTRAINT "StrategySubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySubscription" ADD CONSTRAINT "StrategySubscription_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySubscription" ADD CONSTRAINT "StrategySubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopySettings" ADD CONSTRAINT "CopySettings_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "StrategySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskProfile" ADD CONSTRAINT "RiskProfile_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "StrategySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskState" ADD CONSTRAINT "RiskState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterTrade" ADD CONSTRAINT "MasterTrade_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterTrade" ADD CONSTRAINT "MasterTrade_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "MT5Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEvent" ADD CONSTRAINT "TradeEvent_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEvent" ADD CONSTRAINT "TradeEvent_masterTradeId_fkey" FOREIGN KEY ("masterTradeId") REFERENCES "MasterTrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TradeEvent"("eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "StrategySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_masterTradeId_fkey" FOREIGN KEY ("masterTradeId") REFERENCES "MasterTrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionMapping" ADD CONSTRAINT "PositionMapping_masterTradeId_fkey" FOREIGN KEY ("masterTradeId") REFERENCES "MasterTrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionMapping" ADD CONSTRAINT "PositionMapping_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "StrategySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionMapping" ADD CONSTRAINT "PositionMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymbolMapping" ADD CONSTRAINT "SymbolMapping_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymbolMapping" ADD CONSTRAINT "SymbolMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MT5Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
