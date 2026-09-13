import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#2B4C7E", dark: "#1E3A8A", light: "#3B6BA8" },
        success: "#10B981",
        danger: "#EF4444",
        warning: "#F59E0B",
        background: "#F3F4F6",
        card: "#FFFFFF",
      },
      borderRadius: { card: "12px" },
      fontFamily: { sans: ["Inter", "Roboto", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
