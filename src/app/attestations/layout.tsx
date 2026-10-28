import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Аттестации и коллоквиумы",
  description: "Открытые коллоквиумы, экзамены, зачёты и контрольные: программа по этапам и личный прогресс.",
  path: "/attestations",
});

export default function AttestationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
