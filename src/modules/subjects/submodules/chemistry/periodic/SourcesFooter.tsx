/**
 * Футер источников данных таблицы: ссылка на снимок, лицензии,
 * сверка с PubChem и возврат в химический справочник.
 */
import Link from "next/link";
import { elementsMeta, primarySourceLabel } from "@/lib/elements";

export function SourcesFooter() {
  return (
    <footer className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
      <p>
        Источник данных: {primarySourceLabel()} · лицензия: {elementsMeta.license}
      </p>
      <ul className="space-y-1">
        {elementsMeta.sources.map((source) => (
          <li key={source.id}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2 hover:text-[var(--primary)]"
            >
              {source.title}
            </a>{" "}
            — {source.license}
          </li>
        ))}
      </ul>
      <p>
        Сверка с PubChem: {elementsMeta.verification.symbolMatches}/{elementsMeta.elementCount} символов и номеров,
        массы в пределах {String(elementsMeta.verification.massTolerance).replace(".", ",")} а.е.м. —{" "}
        {elementsMeta.verification.massWithinTolerance}/{elementsMeta.elementCount} (расхождения у элементов без
        стабильных изотопов).
      </p>
      <p>
        <Link href="/chemistry" className="font-medium underline underline-offset-2 hover:text-[var(--primary)]">
          ← Вернуться в химический справочник
        </Link>
      </p>
    </footer>
  );
}
