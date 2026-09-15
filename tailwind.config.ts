import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#6366F1",
          dark: "#4F46E5",
          light: "#818CF8",
          soft: "#EEF2FF",
        },
        violet: {
          accent: "#8B5CF6",
        },
        success: "#10B981",
        danger: "#F43F5E",
        warning: "#F59E0B",
        background: "#F8FAFC",
        card: "#FFFFFF",
        surface: {
          dark: "#0F172A",
          card: "#1E293B",
        },
      },
      borderRadius: {
        card: "16px",
        soft: "12px",
        pill: "9999px",
      },
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        body: ["15px", { lineHeight: "1.6" }],
      },
      boxShadow: {
        soft: "0 20px 40px -15px rgba(15, 23, 42, 0.08)",
        card: "0 10px 30px -12px rgba(99, 102, 241, 0.12)",
        lift: "0 24px 48px -16px rgba(15, 23, 42, 0.12)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
        "hero-gradient":
          "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 45%, #F0F9FF 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
