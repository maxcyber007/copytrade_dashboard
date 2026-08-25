import "server-only";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import type { SessionUser } from "@/lib/auth/session";
import { accountRepository } from "@/repositories/account.repository";
import { copyTradeRepository } from "@/repositories/copy-trade.repository";
import { providerRepository } from "@/repositories/provider.repository";
import { userRepository } from "@/repositories/user.repository";
import { getAccount, getFollowerCounts, listAccounts, refreshProviderStates } from "@/services/account.service";
import { listSubscriptions } from "@/services/copy.service";
import { getAdminOverview, getMemberOverview, getMemberPerformance } from "@/services/dashboard.service";
import { getMetaApiUsage } from "@/services/metaapi-usage.service";
import { listNotifications, markAllRead } from "@/services/notification.service";
import { isResetTokenValid } from "@/services/password-reset.service";
import { getProfile } from "@/services/profile.service";
import { getOwnProviderProfile } from "@/services/provider.service";
import { listAllStrategies, listProviderStrategies, listPublicStrategies } from "@/services/strategy.service";
import { getCurrentSubscription, listPayments, listPlans } from "@/services/subscription.service";
import { getAccountTradeHistory } from "@/services/trade-history.service";

/**
 * Everything a page needs, in one request each.
 *
 * With the frontend deployed away from the database, a page that made three
 * service calls would become three network round trips to another continent.
 * So each view is assembled here, on the machine that holds the data, and
 * crosses the wire once.
 *
 * These loaders are the pages' former bodies, moved rather than rewritten: the
 * same services, the same arguments, the same ownership scoping. What is added
 * is `serialize`, because dates and decimals do not survive JSON on their own.
 */

export type Access = "public" | "member" | "admin";

type LoaderContext = {
  /** Null only for `public` views. */
  user: SessionUser | null;
  params: URLSearchParams;
};

/** The signed-in member, for views that cannot be reached without one. */
function member(ctx: LoaderContext): SessionUser {
  if (!ctx.user) throw new Error("page-data loader ran without a session");
  return ctx.user;
}

const RANGES = [7, 30, 90];

export const pageLoaders = {
  // --- public ---------------------------------------------------------------

  /**
   * Marketing page. Plans come from the database so the page never advertises
   * one that does not exist.
   */
  landing: {
    access: "public",
    load: async () => {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { priceMonthly: "asc" },
      });
      return serialize({
        plans: plans.map((plan) => ({
          tier: plan.tier,
          name: plan.name,
          priceMonthly: Number(plan.priceMonthly),
          currency: plan.currency,
          maxAccounts: plan.maxAccounts,
          maxStrategies: plan.maxStrategies,
          features: plan.features,
        })),
      });
    },
  },

  /**
   * Whether a reset link is still good.
   *
   * Returns only a boolean: telling an unauthenticated caller anything more
   * about a token would help them probe for live ones.
   */
  "reset-password": {
    access: "public",
    load: async (ctx: LoaderContext) => {
      const token = ctx.params.get("token") ?? "";
      const valid = Boolean(token.length >= 20 && (await isResetTokenValid(token)));
      return serialize({ valid });
    },
  },

  // --- member ---------------------------------------------------------------

  dashboard: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      const [overview, accounts, subscriptions] = await Promise.all([
        getMemberOverview(user.id),
        listAccounts(user.id),
        listSubscriptions(user.id),
      ]);
      return serialize({ overview, accounts, subscriptions });
    },
  },

  accounts: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);

      // Reconcile with the trading provider before reading, so the switches
      // show the provider's actual state rather than only what we last asked
      // for. It never throws — an unreachable provider leaves the last known
      // values in place.
      await refreshProviderStates(user.id);

      const accounts = await listAccounts(user.id);
      const followerCounts = await getFollowerCounts(accounts.map((account) => account.id));
      return serialize({ accounts, followerCounts });
    },
  },

  "account-history": {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      const id = ctx.params.get("id") ?? "";
      const requested = Number(ctx.params.get("days"));
      const days = RANGES.includes(requested) ? requested : 30;

      // getAccount scopes to the owner, so another member's id yields null here
      // and a 404 on the page — never someone else's trading history.
      const account = await getAccount(id, user.id);
      if (!account) return serialize({ account: null, history: null, days });

      const history = await getAccountTradeHistory(id, user.id, { days });
      return serialize({ account, history, days });
    },
  },

  billing: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      const [plans, subscription, payments] = await Promise.all([
        listPlans(user.id),
        getCurrentSubscription(user.id),
        listPayments(user.id),
      ]);
      return serialize({ plans, subscription, payments });
    },
  },

  history: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      return serialize({ trades: await copyTradeRepository.listForUser(user.id, { take: 100 }) });
    },
  },

  notifications: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      const notifications = await listNotifications(user.id);
      // Opening the page is what marks them read, exactly as before. The read
      // happens after the list so the page still shows which ones were unread.
      await markAllRead(user.id);
      return serialize({ notifications });
    },
  },

  performance: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      return serialize({ performance: await getMemberPerformance(user.id) });
    },
  },

  profile: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      return serialize({ profile: await getProfile(user.id) });
    },
  },

  "provider-apply": {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      return serialize({ profile: await getOwnProviderProfile(user.id) });
    },
  },

  "provider-strategies": {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      const profile = await getOwnProviderProfile(user.id);

      // Only an approved provider can publish, and until then there is nothing
      // to list — so the two further queries are not worth running.
      if (!profile || profile.status !== "APPROVED") {
        return serialize({ profile, strategies: [], accounts: [] });
      }

      const [strategies, accounts] = await Promise.all([
        listProviderStrategies(user.id),
        // The provider's own accounts, offered as publishing sources.
        listAccounts(user.id),
      ]);
      return serialize({ profile, strategies, accounts });
    },
  },

  strategies: {
    access: "member",
    load: async (ctx: LoaderContext) => {
      const user = member(ctx);
      const [strategies, accounts, subscriptions] = await Promise.all([
        listPublicStrategies(),
        listAccounts(user.id),
        listSubscriptions(user.id),
      ]);
      return serialize({ strategies, accounts, subscriptions });
    },
  },

  // --- admin ----------------------------------------------------------------

  "admin/dashboard": {
    access: "admin",
    load: async () => serialize({ overview: await getAdminOverview() }),
  },

  "admin/accounts": {
    access: "admin",
    load: async () => serialize({ accounts: await accountRepository.listForAdmin() }),
  },

  "admin/copy-trades": {
    access: "admin",
    load: async () => {
      const [trades, counts] = await Promise.all([
        copyTradeRepository.listForAdmin(),
        copyTradeRepository.countByStatus(),
      ]);
      return serialize({ trades, counts });
    },
  },

  "admin/errors": {
    access: "admin",
    load: async () =>
      serialize({
        errors: await prisma.systemError.findMany({ take: 100, orderBy: { createdAt: "desc" } }),
      }),
  },

  "admin/members": {
    access: "admin",
    load: async () => serialize({ members: await userRepository.list({ take: 200 }) }),
  },

  "admin/metaapi": {
    access: "admin",
    load: async () => serialize({ usage: await getMetaApiUsage() }),
  },

  "admin/providers": {
    access: "admin",
    load: async () => {
      const [providers, counts] = await Promise.all([
        providerRepository.listForAdmin({ take: 100 }),
        providerRepository.countByStatus(),
      ]);
      return serialize({ providers, counts });
    },
  },

  "admin/strategies": {
    access: "admin",
    load: async () => serialize({ strategies: await listAllStrategies() }),
  },
} satisfies Record<string, { access: Access; load: (ctx: LoaderContext) => Promise<unknown> }>;

export type PageView = keyof typeof pageLoaders;

/** The data each view returns, for pages to type their props against. */
export type PageData = {
  [K in PageView]: Awaited<ReturnType<(typeof pageLoaders)[K]["load"]>>;
};

export function isPageView(value: string): value is PageView {
  return Object.hasOwn(pageLoaders, value);
}
