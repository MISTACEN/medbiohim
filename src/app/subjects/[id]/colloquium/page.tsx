import { redirect } from "next/navigation";

/** The colloquium now lives inside the subject page; keep old links working. */
export default async function ColloquiumRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/subjects/${encodeURIComponent(decodeURIComponent(id))}?tab=colloquium`);
}
