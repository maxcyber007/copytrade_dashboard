import { accountRepository } from "@/repositories/account.repository";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { AppError, ErrorCode } from "@/lib/errors";
import { logEvent, logErrorEvent } from "@/lib/logger";
import { getTradeProvider, assertPlatformSupported } from "@/providers/trading/factory";
import type { CreateAccountInput } from "@/lib/validation/account";
import { AuditAction, recordAudit } from "./audit.service";
import { assertWithinPlanLimits } from "./subscription.service";
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

  // The plan decides how many accounts a member may run at once.
  await assertWithinPlanLimits(userId, "ACCOUNT");

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
  if (!account.isEnabled) {
    throw new AppError(ErrorCode.CONFLICT, "Enable this account before connecting it");
  }
  if (!account.encryptedPassword) {
    throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "No stored credentials for this account");
  }

  assertPlatformSupported(account.platform);

  // The broker already rejected these exact credentials. Trying again cannot
  // succeed — nothing about them has changed — and the provider may charge for
  // each repeated authentication failure, so the member is told what to fix
  // instead of being allowed to hammer the button.
  if (account.lastErrorCode === ErrorCode.BROKER_AUTH_FAILED) {
    throw new AppError(
      ErrorCode.BROKER_AUTH_FAILED,
      "These credentials were already rejected by the broker. Remove this account and add it again with the " +
        "corrected login, trading password and server name.",
    );
  }

  await accountRepository.update(id, { connectionStatus: "CONNECTING", lastError: null, lastErrorCode: null });

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
      lastErrorCode: null,
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
    await accountRepository.update(id, {
      connectionStatus: "ERROR",
      lastError: message,
      // Recorded so a retry can be refused on its merits rather than by
      // matching on a provider's wording.
      lastErrorCode: error instanceof AppError ? error.code : null,
    });
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
  if (!account.isEnabled) {
    throw new AppError(ErrorCode.CONFLICT, "This account is disabled");
  }
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
export async function ensureProviderSession(
  accountId: string,
  options: { allowRecovery?: boolean } = {},
): Promise<string> {
  const account = await prisma.tradingAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");

  // The reconcile sweep passes allowRecovery so an account left in ERROR can
  // come back on its own once the broker is reachable again.
  const usable =
    account.connectionStatus === "CONNECTED" ||
    (options.allowRecovery === true && account.connectionStatus === "ERROR");

  if (!usable) {
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

/**
 * Turns an account off or back on.
 *
 * Replaces deletion on purpose. The provider account is created by us on first
 * connect, so deleting our row would strand it there — still provisioned, still
 * billed, with nothing left pointing at it. Undeploying stops it costing
 * anything while keeping its id, so enabling again is a redeploy rather than a
 * brand new account.
 */
/**
 * Asks the provider what state an account is really in.
 *
 * Never throws: this runs while rendering a page the member asked for, and a
 * provider outage should leave the last known value on screen rather than
 * taking the whole page down. An unreachable provider is reported as UNKNOWN.
 */
async function readDeploymentState(providerAccountId: string): Promise<string> {
  try {
    return await getTradeProvider().getDeploymentState(providerAccountId);
  } catch (error) {
    logErrorEvent({
      event: "PROVIDER_STATE_READ_FAILED",
      providerAccountId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return "UNKNOWN";
  }
}

/**
 * Refreshes the cached provider state for a member's accounts.
 *
 * Done in parallel and only for accounts that exist at the provider — an
 * account that has never connected has nothing to ask about.
 */
export async function refreshProviderStates(userId: string): Promise<void> {
  const accounts = await accountRepository.listForUser(userId);
  const targets = accounts.filter((a) => a.providerAccountId);
  if (targets.length === 0) return;

  await Promise.all(
    targets.map(async (account) => {
      const state = await readDeploymentState(account.providerAccountId!);
      await accountRepository.update(account.id, {
        providerState: state,
        providerStateAt: new Date(),
      });
    }),
  );
}

/**
 * How many members still follow strategies published from these accounts.
 *
 * A cancelled subscription is not a follower, but a paused one is: the member
 * intends to resume, and pulling the master out from under them would break
 * that. Counting only ACTIVE would let a master be switched off while people
 * are still attached to it.
 */
export async function getFollowerCounts(accountIds: string[]): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {};

  const strategies = await prisma.strategy.findMany({
    where: { masterAccountId: { in: accountIds } },
    select: {
      masterAccountId: true,
      _count: { select: { subscriptions: { where: { status: { not: "CANCELLED" } } } } },
    },
  });

  const counts: Record<string, number> = {};
  for (const strategy of strategies) {
    if (!strategy.masterAccountId) continue;
    counts[strategy.masterAccountId] = (counts[strategy.masterAccountId] ?? 0) + strategy._count.subscriptions;
  }
  return counts;
}

export async function setAccountEnabled(
  id: string,
  userId: string,
  enabled: boolean,
  meta: RequestMeta,
) {
  const account = await accountRepository.findOwnedWithSecrets(id, userId);
  if (!account) throw new AppError(ErrorCode.NOT_FOUND, "Trading account not found");
  if (account.isEnabled === enabled) return accountRepository.findOwned(id, userId);

  if (!enabled && account.copyStatus === "COPYING") {
    throw new AppError(ErrorCode.CONFLICT, "Stop copying before disabling this account");
  }

  // Disabling a master undeploys it, which stops every follower receiving
  // trades. Refused here rather than only greyed out in the UI, because the
  // endpoint can be called without going through the page.
  if (!enabled) {
    const followers = (await getFollowerCounts([id]))[id] ?? 0;
    if (followers > 0) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `This account publishes a strategy that ${followers} member(s) still follow. Remove or move them before disabling it.`,
        { details: { followers } },
      );
    }
  }

  if (account.providerAccountId) {
    const provider = getTradeProvider();
    try {
      if (enabled) {
        await provider.deployAccount(account.providerAccountId);
      } else {
        await provider.undeployAccount(account.providerAccountId);
      }
    } catch (error) {
      // Disabling must not be blocked by a provider outage — the member asked
      // for the account to stop, and leaving it enabled because a third party
      // is down is the wrong failure. The local state changes either way and
      // the provider is reconciled on the next enable.
      logErrorEvent({
        event: enabled ? "ACCOUNT_DEPLOY_FAILED" : "ACCOUNT_UNDEPLOY_FAILED",
        accountId: id,
        reason: error instanceof Error ? error.message : "unknown",
      });
      if (enabled) {
        // Enabling is different: if the provider never redeployed, the account
        // would look usable and fail on the first connect instead.
        throw new AppError(
          ErrorCode.PLATFORM_CONNECTION_ERROR,
          "Could not start this account at the trading provider. Try again shortly.",
        );
      }
    }
  }

  // Read back what the provider actually did rather than assuming the call
  // landed — this is the value the toggle is drawn from.
  const providerState = account.providerAccountId
    ? await readDeploymentState(account.providerAccountId)
    : null;

  const updated = await accountRepository.update(id, {
    isEnabled: enabled,
    providerState,
    providerStateAt: providerState ? new Date() : null,
    ...(enabled
      ? { lastError: null, lastErrorCode: null }
      : // Disabling undeploys the account, so any live session is gone.
        { connectionStatus: "DISCONNECTED", copyStatus: "IDLE", connectedAt: null, openTrades: 0 }),
  });

  await recordAudit({
    action: enabled ? AuditAction.ACCOUNT_ENABLED : AuditAction.ACCOUNT_DISABLED,
    userId,
    resourceType: "TradingAccount",
    resourceId: id,
    ...meta,
  });

  return updated;
}
