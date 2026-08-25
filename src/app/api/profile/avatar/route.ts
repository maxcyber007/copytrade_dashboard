import { clientIp, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { AppError, ErrorCode } from "@/lib/errors";
import { AVATAR_MAX_BYTES } from "@/lib/validation/profile";
import { readAvatar, removeAvatar, setAvatar } from "@/services/profile.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the signed-in member's own avatar.
 *
 * Scoped to the caller rather than taking a user id: nothing in the product
 * shows anyone else's avatar, so there is no reason to expose one.
 */
export const GET = handler(async () => {
  const user = await requireUser();
  const avatar = await readAvatar(user.id);

  if (!avatar) throw new AppError(ErrorCode.NOT_FOUND, "No avatar set");

  return new Response(new Uint8Array(avatar.data), {
    headers: {
      // The stored type was determined from the file's own bytes on upload,
      // never from what the client claimed.
      "Content-Type": avatar.contentType,
      "Content-Length": String(avatar.data.byteLength),
      // Belt and braces for user-supplied bytes served from our origin: never
      // let the browser re-interpret them as something executable, and never
      // let them render as a top-level document.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline; filename=\"avatar\"",
      // No CSP or Cache-Control set here on purpose: next.config.ts applies a
      // site-wide CSP and `no-store` to every /api/* response, and those win
      // over anything a route handler sets. Repeating them here would only
      // look like they were doing something.
    },
  });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();

  const form = await req.formData();
  const file = form.get("avatar");

  if (!(file instanceof File)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "No image was uploaded");
  }
  // Checked before reading the body into memory as well as after decoding, so
  // an oversized upload is refused without being buffered in full.
  if (file.size > AVATAR_MAX_BYTES) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `The image must be ${Math.floor(AVATAR_MAX_BYTES / 1024)} KB or smaller`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const saved = await setAvatar(user.id, bytes, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return ok({ contentType: saved.contentType, avatarUpdatedAt: saved.updatedAt });
});

export const DELETE = handler(async (req: Request) => {
  const user = await requireUser();
  await removeAvatar(user.id, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return ok({ removed: true });
});
