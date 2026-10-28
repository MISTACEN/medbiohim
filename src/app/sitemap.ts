import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Public sections only: no admin, auth, settings or personal progress pages. */
const ROUTES: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/subjects", priority: 0.9, changeFrequency: "weekly" },
  { path: "/lectures", priority: 0.9, changeFrequency: "weekly" },
  { path: "/tests", priority: 0.9, changeFrequency: "weekly" },
  { path: "/attestations", priority: 0.8, changeFrequency: "weekly" },
  { path: "/tickets", priority: 0.8, changeFrequency: "weekly" },
  { path: "/materials", priority: 0.7, changeFrequency: "weekly" },
  { path: "/calculators", priority: 0.6, changeFrequency: "monthly" },
  { path: "/chemistry", priority: 0.6, changeFrequency: "monthly" },
  { path: "/university", priority: 0.6, changeFrequency: "monthly" },
  { path: "/help", priority: 0.4, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
