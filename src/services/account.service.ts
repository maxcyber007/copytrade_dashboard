import { accountRepository } from "@/repositories/account.repository";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { AppError, ErrorCode } from "@/lib/errors";
import { logEvent, logErrorEvent } from "@/lib/logger";
import { getTradeProvider, assertPlatformSupported } from "@/providers/trading/factory";
import type { CreateAccountInput } from "@/lib/validation/account";
import { AuditAction, recordAudit } from "./audit.service";
import type { RequestMeta } from "./auth.service";

/** Hard ceiling regardless of plan, so one account cannot exhaust the workers. */
const MAX_ACCOUNTS_PER_USER = 20;

export async function listAccounts(userId: string) {
  return accountRepository.listForUser(userId);
}

export async function getAccount(id: string, userId: string) {
  const account = await accountRepository.findOwned(id, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");
  return account;
}

export async function createAccount(userId: string, input: CreateAccountInput, meta: RequestMeta) {
  assertPlatformSupported(input.platform);

  if ((await accountRepository.countForUser(userId)) >= MAX_ACCOUNTS_PER_USER) {
    throw new AppError(ErrorCode.CONFLICT, `A maximum of ${MAX_ACCOUNTS_PER_USER} accounts is allowed`);
  }

  if (await accountRepository.existsForUser(userId, input.login, input.server)) {
    throw new AppError(ErrorCode.CONFLICT, "That login already exists on this server");
  }

  const account = await accountRepository.create({
    userId,
    label: input.label,
    platform: input.platform,
    broker: input.broker,
    login: input.login,
    server: input.server,
    accountType: input.accountType,
    currency: input.currency,
    // MT4 is hedging by definition; MT5 reports its real mode on connect.
    positionMode: input.platform === "MT4" ? "HEDGING" : "HEDGING",
    provider: "mock",
    encryptedPassword: encryptSecret(input.password),
  });

  await recordAudit({
    action: AuditAction.ACCOUNT_ADDED,
    userId,
    resourceType: "TradingAccount",
    resourceId: account.id,
    metadata: { platform: input.platform, broker: input.broker },
    ...meta,
  });

  return account;
}

/**
 * Establishes a provider session and stores what the broker reports back:
 * position mode and volume limits, which the copy engine later clamps to.
 */
export async function connectAccount(id: string, userId: string, meta: RequestMeta) {
  const account = await accountRepository.findOwnedWithSecrets(id, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");
  if (!account.encryptedPassword) {
    throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "No stored credentials for this account");
  }

  assertPlatformSupported(account.platform);
  await accountRepository.update(id, { connectionStatus: "CONNECTING", lastError: null });

  try {
    const provider = getTradeProvider();
    const result = await provider.connectAccount({
      accountId: account.id,
      platform: account.platform,
      login: account.login,
      server: account.server,
      broker: account.broker,
      // Decrypted in memory for the call only — never logged or returned.
      password: decryptSecret(account.encryptedPassword),
    });

    const info = await provider.getAccountInfo(result.providerAccountId);
    const positions = await provider.getPositions(result.providerAccountId);

    const updated = await accountRepository.update(id, {
      providerAccountId: result.providerAccountId,
      positionMode: result.positionMode,
      currency: result.currency,
      brokerMinLot: result.minLot,
      brokerMaxLot: result.maxLot,
      brokerLotStep: result.lotStep,
      balance: info.balance,
      equity: info.equity,
      margin: info.margin,
      freeMargin: info.freeMargin,
      floatingPnl: Number((info.equity - info.balance).toFixed(2)),
      peakEquity: info.equity,
      openTrades: positions.length,
      connectionStatus: "CONNECTED",
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      lastError: null,
    });

    logEvent({ event: "ACCOUNT_CONNECTED", accountId: id, platform: account.platform });
    await recordAudit({
      action: AuditAction.ACCOUNT_CONNECTED,
      userId,
      resourceType: "TradingAccount",
      resourceId: id,
      ...meta,
    });

    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    await accountRepository.update(id, { connectionStatus: "ERROR", lastError: message });
    logErrorEvent({ event: "ACCOUNT_CONNECT_FAILED", accountId: id, reason: message });

    if (error instanceof AppError) throw error;
    throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, message);
  }
}

export async function disconnectAccount(id: string, userId: string, meta: RequestMeta) {
  const account = await accountRepository.findOwnedWithSecrets(id, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");

  if (account.providerAccountId) {
    try {
      await getTradeProvider().disconnectAccount(account.providerAccountId);
    } catch (error) {
      // Losing the provider session is not a reason to keep the account marked
      // connected — record it and continue.
      logErrorEvent({
        event: "ACCOUNT_DISCONNECT_PROVIDER_ERROR",
        accountId: id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const updated = await accountRepository.update(id, {
    connectionStatus: "DISCONNECTED",
    copyStatus: "IDLE",
    connectedAt: null,
  });

  await recordAudit({
    action: AuditAction.ACCOUNT_DISCONNECTED,
    userId,
    resourceType: "TradingAccount",
    resourceId: id,
    ...meta,
  });

  return updated;
}

/** Refreshes cached metrics from the provider. Used by the dashboard and sync job. */
export async function syncAccount(id: string, userId: string) {
  const account = await accountRepository.findOwnedWithSecrets(id, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");
  if (account.connectionStatus !== "CONNECTED" || !account.providerAccountId) {
    throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "Account is not connected");
  }

  const provider = getTradeProvider();
  const [info, positions] = await Promise.all([
    provider.getAccountInfo(account.providerAccountId),
    provider.getPositions(account.providerAccountId),
  ]);

  const peakEquity = Math.max(Number(account.peakEquity), info.equity);

  return accountRepository.update(id, {
    balance: info.balance,
    equity: info.equity,
    margin: info.margin,
    freeMargin: info.freeMargin,
    floatingPnl: Number((info.equity - info.balance).toFixed(2)),
    peakEquity,
    openTrades: positions.length,
    lastSyncAt: new Date(),
  });
}

/**
 * Guarantees the calling process has a live provider session for this account.
 *
 * Sessions live in the provider client, not in the database, so a process that
 * did not perform the original connect — the copy worker, or the web tier after
 * a restart — has none. Rather than failing the copy, the session is
 * re-established from the stored credentials and the work continues.
 */
export async function ensureProviderSession(accountId: string): Promise<string> {
  const account = await prisma.tradingAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");
  if (account.connectionStatus !== "CONNECTED") {
    throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "Account is not connected");
  }
  if (!account.providerAccountId || !account.encryptedPassword) {
    throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "No stored provider session for this account");
  }

  const provider = getTradeProvider();

  try {
    await provider.getAccountInfo(account.providerAccountId);
    return account.providerAccountId;
  } catch {
    // No session in this process — re-establish it from the stored credentials.
    const result = await provider.connectAccount({
      accountId: account.id,
      platform: account.platform,
      login: account.login,
      server: account.server,
      broker: account.broker,
      password: decryptSecret(account.encryptedPassword),
    });

    logEvent({ event: "PROVIDER_SESSION_REESTABLISHED", accountId, platform: account.platform });

    if (result.providerAccountId !== account.providerAccountId) {
      await accountRepository.update(accountId, { providerAccountId: result.providerAccountId });
    }

    return result.providerAccountId;
  }
}

/** Live positions for the dashboard. Returns an empty list when disconnected. */
export async function getOpenPositions(id: string, userId: string) {
  const account = await accountRepository.findOwnedWithSecrets(id, userId);
  if (!account?.providerAccountId || account.connectionStatus !== "CONNECTED") return [];

  try {
    return await getTradeProvider().getPositions(account.providerAccountId);
  } catch {
    return [];
  }
}

export async function deleteAccount(id: string, userId: string, meta: RequestMeta) {
  const account = await accountRepository.findOwned(id, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");
  if (account.copyStatus === "COPYING") {
    throw new AppError(ErrorCode.CONFLICT, "Stop copying before removing this account");
  }

  await accountRepository.delete(id);
  await recordAudit({
    action: AuditAction.ACCOUNT_DELETED,
    userId,
    resourceType: "TradingAccount",
    resourceId: id,
    ...meta,
  });
}
