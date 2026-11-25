"use client";

import { Suspense } from "react";

import { PracticeView } from "@/components/practice/PracticeView";

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Загрузка…</div>}>
      <PracticeView />
    </Suspense>
  );
}
