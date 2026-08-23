import { NextResponse } from "next/server";
import { clientIp, fail, handler } from "@/lib/api";
import { AppError, ErrorCode } from "@/lib/errors";
import { enforceRateLimit, RateLimits } from "@/lib/rate-limit";
import { masterEventSchema } from "@/lib/validation/master-event";
import { authenticateMasterRequest, ingestMasterEvent } from "@/services/master-event.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Master EA -> platform. Signed with the strategy's own API key.
 *
 * The raw body is read once and verified before it is parsed: a signature over
 * re-serialised JSON would not prove anything about what was actually sent.
 */
export const POST = handler(async (req: Request) => {
  const apiKey = req.headers.get("x-api-key");
  const signature = req.headers.get("x-signature");
  const timestamp = req.headers.get("x-timestamp");

  if (!apiKey || !signature || !timestamp) {
    throw new AppError(ErrorCode.UNAUTHORIZED, "Missing X-Api-Key, X-Signature or X-Timestamp");
  }

  await enforceRateLimit("master-events", apiKey, RateLimits.masterEvents);

  const rawBody = await req.text();
  const ipAddress = clientIp(req);

  const { strategy } = await authenticateMasterRequest({ apiKey, signature, timestamp, rawBody, ipAddress });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Body is not valid JSON");
  }

  const input = masterEventSchema.parse(payload);
  const result = await ingestMasterEvent(strategy, input, { ipAddress });

  // A duplicate is a success from the EA's point of view: the event is safely
  // recorded exactly once, and retrying is the correct behaviour on its side.
  return NextResponse.json({ ok: true, data: result }, { status: result.status === "QUEUED" ? 202 : 200 });
});

export function GET() {
  return fail(new AppError(ErrorCode.NOT_FOUND, "Use POST to publish trade events"));
}
