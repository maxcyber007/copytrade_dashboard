import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client/browser";

/**
 * Avatar with an initial-letter fallback.
 *
 * The image URL carries the avatar's updated-at timestamp so a new upload is
 * fetched immediately rather than served from the browser cache.
 */
export function AvatarImage({
  name,
  email,
  avatarUpdatedAt,
  className,
  textClassName,
}: {
  name: string | null;
  email: string;
  avatarUpdatedAt: Date | string | null;
  className?: string;
  textClassName?: string;
}) {
  const initial = (name?.trim() || email).charAt(0).toUpperCase();
  const version =
    avatarUpdatedAt instanceof Date
      ? avatarUpdatedAt.getTime()
      : avatarUpdatedAt
        ? new Date(avatarUpdatedAt).getTime()
        : null;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={{
        background: version ? "var(--bg)" : "linear-gradient(135deg, var(--gold-soft), var(--gold))",
        border: "1px solid var(--gold-line)",
      }}
    >
      {version ? (
        // A plain <img>: next/image would need a loader configured for an
        // authenticated same-origin API route that returns raw bytes.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={apiUrl(`/api/profile/avatar?v=${version}`)}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className={cn("font-semibold text-black", textClassName)}>{initial}</span>
      )}
    </span>
  );
}
