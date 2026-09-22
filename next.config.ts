import type { NextConfig } from "next";

/**
 * Browser always calls same-origin /api/v1/* over HTTPS.
 * App Router /api/v1/[...path] proxies server-side to SpaceWeb over HTTP.
 */
const SPACEWEB_API_ORIGIN = process.env.SPACEWEB_API_ORIGIN;
if (!SPACEWEB_API_ORIGIN) {
  throw new Error("SPACEWEB_API_ORIGIN must be configured; HTTP/temporary backend fallback is disabled.");
}
const SPACEWEB = SPACEWEB_API_ORIGIN.replace(/\\/$/, "");

const BUILD_FINGERPRINT = "subject-ia-2026-09-22";

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
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/v1/:path*",
          destination: `${SPACEWEB.replace(/\/$/, "")}/:path*`,
        },
      ],
    };
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
