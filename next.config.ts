import type { NextConfig } from "next";

/**
 * Browser calls same-origin /api/v1/* over HTTPS.
 * SpaceWeb production document root is backend/public, so the PHP API root
 * is /api/v1 (not /public/api/v1).
 *
 * In Vercel, set SPACEWEB_API_ORIGIN to the real HTTPS SpaceWeb API origin.
 * The fallback is kept only for the current SpaceWeb test host.
 */
const SPACEWEB =
  process.env.SPACEWEB_API_ORIGIN ||
  "https://ryazansev3.temp.swtest.ru/api/v1";

// This value is deliberately visible in the HTTP response. It lets us prove
// which source actually serves medbiohim.vercel.app and detect stale Vercel
// production aliases/deployments without relying on browser cache behavior.
const BUILD_FINGERPRINT = "f14698a6774e939faa6d9f305b16e4b6768e1595";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Browser requests must stay same-origin so HTTPS Vercel pages never
    // attempt a direct HTTP call to SpaceWeb (Mixed Content).
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
            value: "same-origin",
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
