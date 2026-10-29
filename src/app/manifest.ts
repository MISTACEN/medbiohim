import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MEDBIOHIM — подготовка к занятиям и экзаменам",
    short_name: "MEDBIOHIM",
    description: "Учебная платформа студентов: материалы, тесты, расписание и подготовка к экзаменам.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    lang: "ru",
    categories: ["education", "medical"],
    // Chrome/Tide не декодирует SVG-иконки надёжно: растровые PNG обязательны,
    // SVG остаётся подстраховкой для любого size (PWA-установки старых билдов).
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ]
  };
}
