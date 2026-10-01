/** Minimal ESLint flat config — avoid broken nextVitals spread on Vercel. */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];
