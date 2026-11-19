/** Каталог предметов: типы, порядок категорий, иконки и бейдж экзаменационной сессии. */
import {
  Activity, Atom, BookOpen, Bot, Brain, Calculator, Cpu,
  Dumbbell, FlaskConical, HeartPulse, Layers, Microscope, Network, Search,
} from "lucide-react";

export type Item = {
  id: string;
  name: string;
  course_number?: number | null;
  semester?: number | null;
  control_type?: string | null;
  slug?: string;
  hours_note?: string;
  total_hours?: number | null;
  credits?: number | null;
  category?: string;
  icon?: string;
  blurb?: string;
  course?: number;
};

export type Tool = { id: string; name: string; href: string; icon?: string; blurb?: string };

export type ExamWindow = { start: string; end: string; title: string };

export const CATEGORY_ORDER = [
  "Естественно-научные",
  "Математика и IT",
  "Гуманитарные",
  "Клинические навыки",
  "Элективы",
  "Другое",
];

export const EXAM_HIGHLIGHT_DAYS = 90;

export function subjectIcon(key?: string) {
  switch (key) {
    case "activity": return Activity;
    case "microscope": return Microscope;
    case "flask": return FlaskConical;
    case "atom": return Atom;
    case "cpu": return Cpu;
    case "network": return Network;
    case "chart": return Activity;
    case "book": return BookOpen;
    case "brain": return Brain;
    case "heart": return HeartPulse;
    case "dumbbell": return Dumbbell;
    case "bot": return Bot;
    case "layers": return Layers;
    case "calculator": return Calculator;
    case "search": return Search;
    default: return BookOpen;
  }
}

export function controlLabel(v?: string | null) {
  if (!v) return null;
  const m: Record<string, string> = { exam: "Экзамен", credit: "Зачёт", diff_credit: "Дифф. зачёт" };
  return m[v] || v;
}

/** Ближняя аттестация: сегодня внутри окна «сессия − 90 дней … конец сессии» для курса/семестра предмета. */
export function examBadge(s: Item, windows: Record<string, ExamWindow[]>): { label: string; tone: "exam" | "credit" } | null {
  if (!s.control_type || !s.course_number || !s.semester) return null;
  const list = windows[`${s.course_number}/${s.semester}`] || [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // ближайшая будущая сессия курса/семестра (среди нескольких берём первую, чей конец ещё не прошёл)
  for (const w of list) {
    const start = new Date(`${w.start}T00:00:00`);
    const end = new Date(`${w.end}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (today > end) continue; // сессия уже прошла
    const from = new Date(start);
    from.setDate(from.getDate() - EXAM_HIGHLIGHT_DAYS);
    if (today < from) continue; // до сессии ещё далеко
    const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    // control_type в БД хранится русским текстом («Зачет»/«Экзамен») или ключом (credit/exam)
    const raw = String(s.control_type);
    const isCredit = /зач/i.test(raw) && !/диф/i.test(raw);
    const tone = isCredit ? "credit" : "exam";
    const kind = isCredit ? "Зачёт" : "ЭКЗАМЕН";
    return { label: `${kind} · сессия ${fmt(start)}–${fmt(end)}`, tone };
  }
  return null;
}
