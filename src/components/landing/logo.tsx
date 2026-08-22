export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--gold-soft)" />
          <stop offset="100%" stopColor="var(--gold)" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="none" stroke="url(#logo-gold)" strokeWidth="1.5" />
      <path
        d="M7 21.5 L13 14 L18 18.5 L25 9.5"
        fill="none"
        stroke="url(#logo-gold)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="14" r="1.9" fill="url(#logo-gold)" />
      <circle cx="18" cy="18.5" r="1.9" fill="url(#logo-gold)" />
    </svg>
  );
}
