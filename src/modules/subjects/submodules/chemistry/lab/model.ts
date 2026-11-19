/**
 * Модель лабораторной скамьи: перечень вкладок, форматирование чисел
 * с русской запятой и скачивание CSV с единым префиксом файлов.
 */
import { Activity, Beaker, BookOpen, FlaskConical, Zap } from "lucide-react";

import { csvFilename, downloadCsv, toCsv } from "@/lib/chemistry/export";

export type Tab = "titration" | "electrochemistry" | "spectroscopy" | "conductometry" | "organic";

export const TABS: Array<{ id: Tab; label: string; Icon: typeof Beaker }> = [
  { id: "titration", label: "Титрование", Icon: Beaker },
  { id: "electrochemistry", label: "Электрохимия", Icon: Zap },
  { id: "spectroscopy", label: "Спектроскопия", Icon: FlaskConical },
  { id: "conductometry", label: "Кондуктометрия", Icon: Activity },
];

export function fmt(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toString().replace(".", ",");
}

export function download(prefix: string, rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>) {
  downloadCsv(csvFilename("medbiohim", prefix), toCsv(rows, columns));
}
