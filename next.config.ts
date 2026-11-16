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
  // Keep build worker fan-out bounded on free/low-memory CI runners.
  experimental: { cpus: 1 },
  env: {
    NEXT_PUBLIC_API_URL: "/api/v1",
  },
  // pptxgenjs (экспорт слайдов в PPTX, динамический импорт) тянет node:builtin —
  // в браузере они нужны только для удалённых картинок, которых мы не вставляем:
  // стабим их пустыми модулями в обеих формах (fs и node:fs).
  webpack: (config, options) => {
    // Схема "node:*" не покрывается resolve.fallback напрямую: сначала
    // переписываем префикс (NormalModuleReplacementPlugin), затем fallback:false
    // стабирует builtin пустым модулем (pptxgenjs в браузере ими не пользуется).
    const webpackInstance = (options as any).webpack;
    if (webpackInstance) {
      config.plugins.push(
        new webpackInstance.NormalModuleReplacementPlugin(/^node:/, (resource: any) => {
          resource.request = String(resource.request || "").replace(/^node:/, "");
        }),
      );
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      http: false,
      https: false,
      os: false,
      path: false,
      stream: false,
    };
    return config;
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
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
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
      { source: "/me", destination: "/settings", permanent: false },
      // Help и changelog объединены: «Что нового» — вкладка страницы помощи.
      { source: "/changelog", destination: "/help?tab=news", permanent: false },
    ];
  },
};

export default nextConfig;
