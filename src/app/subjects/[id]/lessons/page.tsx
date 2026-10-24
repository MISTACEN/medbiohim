import { redirect } from "next/navigation";

/** The practice hub is embedded in the subject page; keep old links working. */
export default async function SubjectLessonsRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/subjects/${encodeURIComponent(decodeURIComponent(id))}?tab=lessons`);
}
