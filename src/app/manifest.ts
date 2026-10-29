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
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ]
  };
}
