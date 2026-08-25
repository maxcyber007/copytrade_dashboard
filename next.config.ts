import type { NextConfig } from "next";

/**
 * `standalone` produces the self-contained server the Docker image runs.
 *
 * Vercel builds its own output format and warns about this setting, so it is
 * applied only where it is used — the backend and single-host images.
 */
const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "standalone" as const }),
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["argon2", "bullmq", "ioredis", "pino"],
  /**
   * Fronting the API from the frontend's own origin.
   *
   * When `API_PROXY_TARGET` is set, `/api/*` is forwarded to the backend rather
   * than handled here. The browser then only ever addresses the frontend, which
   * makes the session a first-party cookie — the arrangement that works in
   * every browser, including the ones that refuse third-party cookies outright.
   *
   * `beforeFiles` so the forward wins over this deployment's own API routes,
   * which exist in the codebase but must not answer on a frontend host.
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");
    if (!target) return [];

    // Only a frontend deployment forwards. Without this check a backend built
    // from the same environment would rewrite `/api/*` to its own address and
    // proxy to itself, which does not fail cleanly — the request loops until
    // the socket is reset, and the log says only "socket hang up".
    if (process.env.APP_ROLE !== "frontend") return [];

    return {
      beforeFiles: [{ source: "/api/:path*", destination: `${target}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";

    /**
     * Once the API lives on its own domain the browser must be allowed to reach
     * it, or `connect-src 'self'` silently blocks every fetch and the live
     * updates stream. Only the configured API origin is added — not a wildcard.
     */
    const apiOrigin = (() => {
      const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
      if (!raw) return null;
      try {
        return new URL(raw).origin;
      } catch {
        return null;
      }
    })();

    const connectSrc = ["'self'", ...(apiOrigin ? [apiOrigin] : [])].join(" ");

    // Next injects inline bootstrap scripts and styles, so those two sources
    // are unavoidable without nonce plumbing; everything else is locked to the
    // origin. No third-party script, frame or connection is permitted.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${apiOrigin ? ` ${apiOrigin}` : ""}`,
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isProduction
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
      {
        // Never let a proxy or browser cache an API response containing
        // account data.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
