"use client";

/** Тело просмотра материала: картинка, PDF-читалка, HTML, iframe или файл. */
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getMaterialFileUrl, type ApiMaterial } from "@/lib/api";
import { ImageLightbox } from "@/components/media/ImageLightbox";
import { FilePreview } from "@/shared/file-engine/viewers";
import { useApiRequest } from "@/hooks/useApiRequest";

export function MaterialBody({ material }: { material: ApiMaterial }) {
  const directUrl = material.source?.download_url ? String(material.source.download_url) : "";
  const mime = String(material.source?.mime_type || "").toLowerCase();
  const { data: physicalUrl, loading: fileLoading } = useApiRequest<string | null>(async () => {
    const hasPhysicalSource = Boolean(
      directUrl ||
      material.source?.file_id ||
      material.source?.source_path ||
      material.file_id
    );
    if (directUrl || !hasPhysicalSource || material.external_url) return null;
    return getMaterialFileUrl(String(material.id));
  }, [material.id, material.content_html, material.external_url, material.subject_slug, directUrl]);

  const url = directUrl || physicalUrl || "";

  if (url && mime.startsWith("image/")) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-2xl bg-slate-50 p-4">
        <ImageLightbox
          src={url}
          alt={material.title}
          title={material.title}
          caption={String(material.subject_name || "Материалы")}
          className="w-full"
          imageClassName="mx-auto max-h-[70vh] w-full rounded-xl object-contain"
        />
      </div>
    );
  }

  if (url && mime.includes("pdf")) {
    return (
      <div className="space-y-2">
        <Link
          href={`/reader?material=${encodeURIComponent(String(material.id))}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--primary)] hover:border-[var(--primary)]"
        >
          <BookOpen className="h-4 w-4" /> Открыть в читалке — поиск по тексту, закладки, заметки, ночной режим
        </Link>
        <Link
          href={`/mentor/lecture/${encodeURIComponent(String(material.id))}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          PdfMentor: методичка и вход в среду
        </Link>
        <FilePreview
          source={{ url, name: material.source?.name || `${material.title}.pdf`, mime: "application/pdf", downloadUrl: directUrl || url }}
        />
      </div>
    );
  }

  if (material.content_html) {
    return <article className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: material.content_html }} />;
  }

  if (material.external_url) {
    return <iframe src={material.external_url} title={material.title} className="h-full min-h-[60vh] w-full rounded-xl border" />;
  }

  const rawSize = Number((material.source as Record<string, unknown> | undefined)?.size);
  const size = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : null;

  if (url) {
    return (
      <FilePreview
        source={{
          url,
          name: material.source?.name || material.title,
          mime: mime || material.source?.mime_type || null,
          size,
          downloadUrl: directUrl || url,
        }}
      />
    );
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-600">
      <div className="font-semibold text-slate-800">Файл доступен как оригинал</div>
      <p className="mt-1">Ссылка на оригинал пока не получена.</p>
      <div className="mt-2 text-slate-500">{fileLoading ? "Загружаем файл…" : "Ссылка на файл пока недоступна."}</div>
    </div>
  );
}
