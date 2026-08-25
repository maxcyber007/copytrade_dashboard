"use client";

import { useId } from "react";
import type { Locale } from "@/lib/i18n/config";

/**
 * Flags drawn as inline SVG rather than emoji.
 *
 * Windows ships no glyphs for the regional-indicator flag emoji, so 🇹🇭 renders
 * as a "TH" letter box there — on the platform most of these users are on.
 *
 * Both flags use a 90×60 viewBox (3:2) so they occupy an identical box in the
 * menu. The Union Jack is natively 2:1 and is redrawn to 3:2 here, which is
 * what icon sets normally do rather than letterboxing it.
 */

function FlagTh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 60" className={className} aria-hidden="true" focusable="false">
      <rect width="90" height="60" fill="#F4F5F8" />
      <rect width="90" height="10" y="0" fill="#A51931" />
      <rect width="90" height="20" y="20" fill="#2D2A4A" />
      <rect width="90" height="10" y="50" fill="#A51931" />
    </svg>
  );
}

function FlagGb({ className }: { className?: string }) {
  // The counterchanged diagonals need a clip path, and this component renders
  // more than once per page, so the id has to be unique per instance.
  const clipId = `ct-uk-${useId().replace(/:/g, "")}`;

  return (
    <svg viewBox="0 0 90 60" className={className} aria-hidden="true" focusable="false">
      <clipPath id={clipId}>
        <path d="M45,30 h45 v30 z v30 h-45 z h-45 v-30 z v-30 h45 z" />
      </clipPath>
      <rect width="90" height="60" fill="#012169" />
      <path d="M0,0 L90,60 M90,0 L0,60" stroke="#FFFFFF" strokeWidth="12" />
      <path
        d="M0,0 L90,60 M90,0 L0,60"
        clipPath={`url(#${clipId})`}
        stroke="#C8102E"
        strokeWidth="8"
      />
      <path d="M45,0 v60 M0,30 h90" stroke="#FFFFFF" strokeWidth="20" />
      <path d="M45,0 v60 M0,30 h90" stroke="#C8102E" strokeWidth="12" />
    </svg>
  );
}

export function LocaleFlag({ locale, className }: { locale: Locale; className?: string }) {
  return locale === "th" ? <FlagTh className={className} /> : <FlagGb className={className} />;
}
