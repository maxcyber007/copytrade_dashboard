import { PrismaClient, PlanTier } from "@prisma/client";
import { argon2id, hash } from "argon2";

const prisma = new PrismaClient();

const PLANS = [
  { tier: PlanTier.FREE, name: "Free", priceMonthly: 0, maxAccounts: 1, maxStrategies: 1, features: ["1 trading account (MT4 or MT5)", "1 strategy"] },
  { tier: PlanTier.BASIC, name: "Basic", priceMonthly: 19, maxAccounts: 2, maxStrategies: 2, features: ["2 trading accounts", "Email alerts"] },
  { tier: PlanTier.PRO, name: "Pro", priceMonthly: 49, maxAccounts: 5, maxStrategies: 5, features: ["5 trading accounts", "Priority copying"] },
  { tier: PlanTier.PREMIUM, name: "Premium", priceMonthly: 99, maxAccounts: 20, maxStrategies: 20, features: ["20 trading accounts", "Dedicated support"] },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: { name: plan.name, priceMonthly: plan.priceMonthly, maxAccounts: plan.maxAccounts, maxStrategies: plan.maxStrategies, features: plan.features },
      create: plan,
    });
  }

  // Development-only admin. Credentials come from the environment so no secret
  // is ever committed; skipped entirely when they are absent.
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: { role: "ADMIN" },
      create: {
        email: email.toLowerCase(),
        name: "Administrator",
        role: "ADMIN",
        passwordHash: await hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      },
    });
    console.log(`Seeded admin user: ${email}`);
  } else {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user");
  }

  console.log(`Seeded ${PLANS.length} subscription plans`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
