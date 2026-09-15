import type { NextConfig } from "next";

/**
 * Browser calls same-origin /api/v1/* (HTTPS).
 * Vercel rewrites proxy to SpaceWeb PHP API (avoids mixed content).
 */
const SPACEWEB =
  process.env.SPACEWEB_API_ORIGIN ||
  "http://ryazansev3.temp.swtest.ru/public/api/v1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
