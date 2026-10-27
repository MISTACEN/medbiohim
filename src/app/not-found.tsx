import Link from "next/link";
import { Compass, Search, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="card text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
        >
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold" style={{ color: "var(--text)" }}>
          Страница не найдена
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Возможно, ссылка устарела или материал перенесли в другой раздел. Попробуйте поиск по
          платформе.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-primary inline-flex items-center gap-2">
            <Home className="h-4 w-4" /> На главную
          </Link>
          <Link href="/search" className="btn-secondary inline-flex items-center gap-2">
            <Search className="h-4 w-4" /> Поиск
          </Link>
        </div>
      </div>
    </div>
  );
}
