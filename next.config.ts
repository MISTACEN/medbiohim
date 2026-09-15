import type { NextConfig } from "next";

/** SpaceWeb backend (HTTP). Browser calls same-origin /api/v1 → rewrite avoids mixed content on Vercel HTTPS. */
const SPACEWEB_API =
  process.env.SPACEWEB_API_ORIGIN?.replace(/\/$/, "") ||
  "http://ryazansev3.temp.swtest.ru/public/api/v1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${SPACEWEB_API}/:path*`,
      },
    ];
  },
};

export default nextConfig;
