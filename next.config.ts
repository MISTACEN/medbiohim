import type { NextConfig } from "next";

/**
 * Browser always calls same-origin /api/v1/* over HTTPS.
 * App Router route src/app/api/v1/[...path] proxies server-side to SpaceWeb over HTTP.
 */
const SPACEWEB =
  process.env.SPACEWEB_API_ORIGIN ||
  "http://ryazansev3.temp.swtest.ru/api/v1";

const BUILD_FINGERPRINT = "beta-subject-ia-2026-09-22";

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
            value: "same-origin-spaceweb-proxy",
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
  /** Старые пункты меню → Предметы (концепция subject+course+semester). */
  async redirects() {
    return [
      { source: "/curriculum", destination: "/subjects", permanent: false },
      { source: "/tests", destination: "/subjects", permanent: false },
      { source: "/trainers", destination: "/subjects", permanent: false },
    ];
  },
};

export default nextConfig;
