import type { NextConfig } from "next";

/**
 * Production Next.js configuration.
 *
 * - `output: "standalone"` produces a minimal server bundle for Docker deployment.
 *   It is skipped on Vercel and Netlify (they build their own output).
 * - Security headers below cover the "Helmet"-style requirements (clickjacking,
 *   MIME sniffing, referrer leakage). They are intentionally conservative;
 *   loosen `Content-Security-Policy` only if you add a genuinely trusted
 *   external asset host.
 * - Heavy media processing (FFmpeg/Whisper) never runs inside Next.js itself —
 *   see `src/lib/queue/worker-entry.ts`, which is meant to run as a separate
 *   long-lived process/container, never as a serverless function.
 */
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // `standalone` is only for self-hosted Docker. `VERCEL` / `NETLIFY` are set
  // automatically during builds on those platforms, which do their own packaging.
  ...(process.env.VERCEL || process.env.NETLIFY ? {} : { output: "standalone" as const }),
  reactStrictMode: true,
  // Node-native packages must not be bundled into route handlers.
  serverExternalPackages: ["bullmq", "ioredis", "sharp", "archiver"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.tiktokcdn.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.r2.dev" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
