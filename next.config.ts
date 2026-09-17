import type { NextConfig } from "next";

/**
 * Browser always calls same-origin /api/v1/* over HTTPS.
 * Vercel/Next rewrites proxy server-side to SpaceWeb.
 *
 * CRITICAL: SpaceWeb HTTPS responds 302 → Location: http://...
 * If the rewrite target is HTTPS, that 302 is forwarded to the browser
 * and Mixed Content blocks login/API calls.
 *
 * Rewrite destination MUST be plain HTTP (server-side proxy only).
 * Document root serves /api/v1 (no /public prefix needed).
 *
 * Do NOT set SPACEWEB_API_ORIGIN to https:// for this host.
 * Do NOT set NEXT_PUBLIC_API_URL to an absolute http:// URL in Vercel.
 */
const SPACEWEB =
  process.env.SPACEWEB_API_ORIGIN ||
  "http://ryazansev3.temp.swtest.ru/api/v1";

const BUILD_FINGERPRINT = "main-http-proxy-2026-09-17";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Force relative API so panel env cannot inject http:// into the browser bundle
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
            value: "same-origin-http-proxy",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${SPACEWEB.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
