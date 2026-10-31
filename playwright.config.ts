import { defineConfig, devices } from "@playwright/test";

// G3: браузерный smoke против локальной сборки.
//  - SMOKE_BASE_URL задан → тестируем уже поднятый сервер, webServer не нужен;
//  - иначе webServer поднимает `next start` на отдельном порту 3100 (не 3000,
//    чтобы не конфликтовать с `npm run dev`, который разработчик мог оставить);
//  - в CI: reuseExistingServer выключен, сборка выполняется отдельным шагом
//    workflow (`npm run build`) до `npx playwright test`.
const PORT = Number(process.env.SMOKE_PORT || 3100);
const BASE_URL = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  retries: 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
