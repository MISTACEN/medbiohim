import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: path.dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The existing application uses gradual typing; TypeScript's strict
      // compiler remains the enforced type-safety gate.
      "@typescript-eslint/no-explicit-any": "off",
      // underscore-префикс = намеренно неиспользуемое (распаковка полей, резервные параметры)
      "@typescript-eslint/no-unused-vars": ["warn", { "varsIgnorePattern": "^_", "argsIgnorePattern": "^_" }],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "**/node_modules/**",
      // Scratch владельца: черновики и утилиты вне сборки.
      "tmp/**",
      "backend/**",
      "integrations/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
      // Wrangler build output is generated, not source (workers/api/.wrangler).
      "**/.wrangler/**",
      // Extension build config is CommonJS and has its own toolchain.
      "browser-extension/**",
      // Historical source snippets kept as reference material for retired CI workflows.
      "scripts/p0/**",
      // Local scratch directories: downloads, dumps and screenshots, not source.
      ".tmp/**",
      ".tmp-arch/**",
      ".tmp-figs/**",
      ".tmp-fixtures/**",
    ],
  },
];

export default eslintConfig;
