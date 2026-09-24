import type { NextConfig } from "next";

/**
 * Browser always calls same-origin /api/v1/* on the Vercel deployment.
 *
 * The App Router catch-all route at src/app/api/v1/[...path]/route.ts is the
 * single Vercel-side API entrypoint. It proxies requests server-side to the
 * PHP backend on SpaceWeb using SPACEWEB_API_ORIGIN.
 *
 * Do not add a second rewrite for /api/v1 here: keeping one proxy path avoids
 * route ambiguity and makes the Vercel -> SpaceWeb architecture explicit.
 */
const BUILD_FINGERPRINT = "2026-09-24-490b040";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: "/api/v1",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-Medbiohim-Build",
            value: BUILD_FINGERPRINT,
          },
          {
            key: "X-Medbiohim-Api-Mode",
            value: "same-origin-backend-proxy",
          },
        ],
      },
    ];
  },
  /** Старые пункты меню → Предметы. */
  async redirects() {
    return [
      { source: "/curriculum", destination: "/subjects", permanent: false },
      { source: "/tests", destination: "/subjects", permanent: false },
      { source: "/trainers", destination: "/subjects", permanent: false },
    ];
  },
};

export default nextConfig;
