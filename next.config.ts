import type { NextConfig } from "next";

/**
 * Browser always calls same-origin /api/v1/* over HTTPS.
 * App Router route src/app/api/v1/[...path] proxies server-side to SpaceWeb over HTTP
 * (SpaceWeb HTTPS redirects to HTTP and would cause Mixed Content if followed in browser).
 *
 * Fallback rewrites also point at SpaceWeb if the route handler is not matched.
 */
const SPACEWEB =
  process.env.SPACEWEB_API_ORIGIN ||
  "http://ryazansev3.temp.swtest.ru/api/v1";

const BUILD_FINGERPRINT = "spaceweb-proxy-2026-09-20";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Force relative API so NEXT_PUBLIC_* from Vercel panel cannot inject http:// into the browser
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
    // afterFiles: App Router /api/v1/[...path] takes priority when present
    return {
      afterFiles: [
        {
          source: "/api/v1/:path*",
          destination: `${SPACEWEB.replace(/\/$/, "")}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
