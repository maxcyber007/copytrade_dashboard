import { PrismaClient } from "@prisma/client";
import { isFrontendRole } from "@/lib/runtime-config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let instance: PrismaClient | null = null;

function client(): PrismaClient {
  if (instance) return instance;

  // A frontend deployment has no database and must not behave as though it
  // does. Failing here names the actual mistake — server data reached a page's
  // import path — rather than surfacing later as a connection error on a host
  // that was never meant to hold a DATABASE_URL.
  if (isFrontendRole()) {
    throw new Error(
      "@/lib/prisma was used on a frontend deployment (APP_ROLE=frontend). " +
        "Pages must read data through @/lib/api-client, not the database.",
    );
  }

  instance =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = instance;
  return instance;
}

/**
 * The database client, constructed on first use rather than on import.
 *
 * `next build` loads every route module to collect its configuration, so an
 * eagerly constructed client would demand a `DATABASE_URL` at build time — on
 * every deployment, including the frontend one that has no database and is
 * never going to run these routes. Deferring construction to the first query
 * keeps the build honest about what it actually needs.
 *
 * Methods are bound to the real client because Prisma's own methods rely on
 * their `this`; handing them back unbound would break `$transaction` and every
 * model delegate.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const active = client();
    const value = Reflect.get(active, property) as unknown;
    return typeof value === "function" ? value.bind(active) : value;
  },
  has(_target, property) {
    return Reflect.has(client(), property);
  },
});
