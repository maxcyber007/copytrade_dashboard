"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { AvatarImage } from "./avatar-image";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { apiFetch } from "@/lib/api-client/browser";

/**
 * Account menu in the dashboard header.
 *
 * The avatar replaces the sign-out button; signing out moves inside the menu
 * so a destructive action is never one stray click away.
 */
export function UserMenu({
  name,
  email,
  role,
  avatarUpdatedAt,
  labels,
  signOutLabel,
}: {
  name: string | null;
  email: string;
  role: string;
  avatarUpdatedAt: string | null;
  labels: Dictionary["profile"];
  signOutLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={labels.openMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full transition hover:opacity-85"
      >
        <AvatarImage
          name={name}
          email={email}
          avatarUpdatedAt={avatarUpdatedAt}
          className="h-9 w-9"
          textClassName="text-sm"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="panel absolute right-0 top-12 z-50 min-w-56 overflow-hidden rounded-xl shadow-xl"
        >
          <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--panel-border)" }}>
            <AvatarImage
              name={name}
              email={email}
              avatarUpdatedAt={avatarUpdatedAt}
              className="h-9 w-9"
              textClassName="text-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name ?? email}</p>
              <p className="truncate text-xs text-muted">{role}</p>
            </div>
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition hover:bg-black/5 hover:text-gold dark:hover:bg-white/5"
          >
            <User className="h-4 w-4 opacity-70" />
            {labels.menuProfile}
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 border-t px-4 py-2.5 text-left text-sm transition hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
            style={{ borderColor: "var(--panel-border)", color: "var(--loss, #dc2626)" }}
          >
            <LogOut className="h-4 w-4 opacity-70" />
            {signOutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
