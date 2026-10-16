import type { NextConfig } from "next";

/**
 * Browser always calls same-origin /api/v1/* on the Vercel deployment.
 *
 * src/app/api/v1/[...path]/route.ts proxies exclusively to Cloudflare Workers
 * (CLOUDFLARE_API_ORIGIN). SpaceWeb / legacy PHP is not used.
 */
const BUILD_FINGERPRINT = process.env.VERCEL_GIT_COMMIT_SHA || process.env.MEDBIOHIM_BUILD || "local";

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
            value: "cloudflare-only",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/trainers", destination: "/subjects", permanent: false },
    ];
  },
};

export default nextConfig;
