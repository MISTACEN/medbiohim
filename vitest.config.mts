import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Два проекта:
// - unit — чистые утилиты (errors/guards/now-parts/navigation) в окружении node;
// - dom  — клиентский API-клиент (кэш использует window/sessionStorage) и хуки
//          в jsdom с setup-файлом jest-dom.
//
// include намеренно ограничен каталогом src: mjs-файлы из каталога test
// принадлежат node --test и не должны попадать в vitest.
export default defineConfig({
  resolve: { alias: { "@": srcDir } },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/lib/__tests__/**/*.test.ts"],
          exclude: ["src/lib/__tests__/api.test.ts", "src/lib/__tests__/session.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "dom",
          environment: "jsdom",
          include: [
            "src/lib/__tests__/api.test.ts",
            "src/lib/__tests__/session.test.ts",
            "src/hooks/__tests__/**/*.test.tsx",
          ],
        },
      },
    ],
  },
});
