import type { Metadata } from "next";
import { resolveSubjectSlug, subjectDisplayName } from "@/lib/subjectSlug";

export const SITE_NAME = "Медбиохим";
/** Canonical public origin; override in Vercel if the alias changes. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://medbiohim.vercel.app").replace(/\/$/, "");
export const DEFAULT_DESCRIPTION =
  "Образовательная платформа от студентов для студентов: расписание, задания, тесты, материалы";

/** Display name for a subject route param (`/subjects/[id]`), empty when unknown. */
export function subjectName(param: string): string {
  const slug = resolveSubjectSlug(param);
  return slug ? subjectDisplayName(slug) : "";
}

export function pageMetadata(args: {
  title: string;
  description?: string;
  path: string;
  type?: "website" | "article";
}): Metadata {
  const description = args.description || DEFAULT_DESCRIPTION;
  const title = `${args.title} — ${SITE_NAME}`;
  return {
    title: args.title,
    description,
    alternates: { canonical: args.path },
    openGraph: {
      title,
      description,
      url: args.path,
      siteName: SITE_NAME,
      locale: "ru_RU",
      type: args.type || "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
