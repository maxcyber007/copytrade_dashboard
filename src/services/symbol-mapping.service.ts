import { prisma } from "@/lib/prisma";

/**
 * Resolves the master's symbol to the symbol on a member's broker.
 *
 * Scope precedence: account > strategy > global. The most specific enabled
 * mapping wins, so an operator can set a platform-wide default and a member can
 * still override it for their own broker's suffix.
 */
export async function resolveMemberSymbol(params: {
  masterSymbol: string;
  strategyId: string;
  accountId: string;
}): Promise<string> {
  const masterSymbol = params.masterSymbol.toUpperCase();

  const mappings = await prisma.symbolMapping.findMany({
    where: {
      masterSymbol,
      enabled: true,
      OR: [
        { accountId: params.accountId },
        { strategyId: params.strategyId, accountId: null },
        { strategyId: null, accountId: null },
      ],
    },
  });

  const accountScoped = mappings.find((mapping) => mapping.accountId === params.accountId);
  if (accountScoped) return accountScoped.memberSymbol.toUpperCase();

  const strategyScoped = mappings.find((mapping) => mapping.strategyId === params.strategyId && !mapping.accountId);
  if (strategyScoped) return strategyScoped.memberSymbol.toUpperCase();

  const global = mappings.find((mapping) => !mapping.strategyId && !mapping.accountId);
  if (global) return global.memberSymbol.toUpperCase();

  // No mapping means the broker uses the same name; the provider still verifies
  // the symbol exists before an order is sent.
  return masterSymbol;
}
