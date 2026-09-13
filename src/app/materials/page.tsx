import { FileText, File, Presentation, ChevronRight } from "lucide-react";
import { materials } from "@/lib/mock-data";

function FileIcon({ type }: { type: string }) {
  if (type === "PDF") return <FileText className="h-6 w-6 text-danger" />;
  if (type === "PPTX") return <Presentation className="h-6 w-6 text-warning" />;
  return <File className="h-6 w-6 text-primary" />;
}

export default function MaterialsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Материалы</h1>
          <p className="mt-1 text-gray-500">
            Учебные файлы и методички
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Поиск..."
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none">
            <option>Все предметы</option>
            <option>Биология</option>
            <option>Гистология</option>
            <option>Химия</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {materials.map((m) => (
          <article key={m.id} className="card p-5">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50">
              <FileIcon type={m.type} />
            </div>
            <h2 className="font-semibold text-gray-900 line-clamp-2">
              {m.title}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              <span>{m.subject}</span>
              <span>·</span>
              <span>{m.type}</span>
              {m.size && (
                <>
                  <span>·</span>
                  <span>{m.size}</span>
                </>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-400">{m.date}</div>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Открыть <ChevronRight className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>

      {materials.length === 0 && (
        <div className="card p-12 text-center text-gray-500">
          В этом разделе пока нет материалов.
        </div>
      )}
    </div>
  );
}
