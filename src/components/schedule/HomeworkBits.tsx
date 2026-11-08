/**
 * ДЗ-блоки карточки расписания (ЗАДАЧА A4): оценка/отзыв преподавателя и
 * сворачиваемый длинный текст. Вынесено из монолита app/schedule/page.tsx.
 */
"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { homeworkPrepStatus } from "@/lib/learning/statuses";

export function HomeworkGrade({ homework }: { homework: any }) {
  const grade = homework?.grade;
  const comment = homework?.teacher_comment;
  const gradedAt = homework?.graded_at ? String(homework.graded_at).slice(0, 10).split("-").reverse().join(".") : "";
  if ((grade == null || grade === "") && !comment) return null;
  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--primary-soft)] px-3 py-2 text-xs" role="status">
      <div className="font-semibold" style={{ color: "var(--text)" }}>
        Оценка преподавателя{grade != null && grade !== "" ? `: ${grade}` : ""}
        {gradedAt ? <span className="ml-2 opacity-70">· {gradedAt}</span> : null}
      </div>
      {comment ? <p className="mt-1 whitespace-pre-wrap opacity-80">{String(comment)}</p> : null}
    </div>
  );
}

/** Длинное ДЗ показываем коротким превью: полный текст раскрывается по клику. */
export function HomeworkText({ text }: { text: string }) {
  const clean = String(text || "").trim();
  if (!clean) return null;
  if (clean.length <= 170) {
    return <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{clean}</p>;
  }
  const preview = clean.slice(0, 150).replace(/\s+\S*$/, "") + "…";
  return (
    <details className="mt-2">
      <summary className="cursor-pointer list-none">
        <span className="whitespace-pre-wrap text-sm opacity-80">{preview}</span>
        <span className="ml-1 whitespace-nowrap text-xs font-semibold text-indigo-600">показать полностью</span>
      </summary>
      <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{clean}</p>
    </details>
  );
}
