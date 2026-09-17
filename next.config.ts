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
