import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

/**
 * Sets a member's password directly, for when nobody can sign in.
 *
 * The ordinary route is the reset link, and this is not a replacement for it —
 * it is the way back in when that route is unavailable: SMTP not configured
 * yet, the only administrator locked out, a fresh deployment with no working
 * mail. It has to be run on the machine holding the database, which is the
 * limit on who can use it.
 *
 *   SET_PASSWORD_EMAIL=you@example.com SET_PASSWORD_VALUE='...' \
 *     npx tsx scripts/set-password.ts
 *
 * Values come from the environment rather than argv so the password does not
 * land in shell history or in the process list, where any other user on the
 * host could read it.
 *
 * It reuses `hashPassword`, so the digest matches what sign-in verifies — the
 * argon2 parameters are not restated here and cannot drift from the app's.
 */

const MIN_LENGTH = 12;

async function main() {
  const email = process.env.SET_PASSWORD_EMAIL?.trim().toLowerCase();
  const password = process.env.SET_PASSWORD_VALUE;

  if (!email || !password) {
    throw new Error(
      "SET_PASSWORD_EMAIL and SET_PASSWORD_VALUE are both required.\n" +
        "  SET_PASSWORD_EMAIL=you@example.com SET_PASSWORD_VALUE='...' npx tsx scripts/set-password.ts",
    );
  }

  // A password set out-of-band skips the sign-up form's own validation, so the
  // floor is enforced here instead of trusting whoever runs the script.
  if (password.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters.`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, status: true },
  });

  if (!user) throw new Error(`No user with the email ${email}.`);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      // Sign-in refuses a locked account, so a reset that left the lock in
      // place would look like the new password had not worked.
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  // Every existing session was issued against the old password. Someone who
  // still holds one would keep their access after a reset meant to take it
  // away, which is the case this exists for.
  const { count } = await prisma.session.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log(`Password set for ${user.email} (${user.role}, ${user.status}).`);
  console.log(`Revoked ${count} active session${count === 1 ? "" : "s"}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
