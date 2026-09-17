import type { NextConfig } from "next";

/**
 * TEMPORARY VERCEL-ONLY API MODE.
 *
 * For this diagnostic deployment the PHP backend runs on Vercel using the
 * custom PHP runtime in api/index.php. SpaceWeb is intentionally bypassed.
 * The PHP bridge restores the original /api/v1/* path before bootstrapping
 * the existing MEDBIOHIM backend, so the backend routes remain unchanged.
 */
const BUILD_FINGERPRINT = "vercel-php-backend-test-2026-09-18";

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
            value: "vercel-php-backend-test",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "/api/index.php?__path=:path*",
      },
    ];
  },
};

export default nextConfig;
