"use client";

import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { hasToken } from "@/lib/api";
import { BankHeader } from "@/components/tests-hub/bank/BankHeader";
import { BankModes } from "@/components/tests-hub/bank/BankModes";
import { BankQuestions } from "@/components/tests-hub/bank/BankQuestions";
import { useTestBank } from "@/components/tests-hub/bank/useTestBank";

function TestBankPageInner({ params }: { params: Promise<{ id: string }> }) {
  const bank = useTestBank(params);
  const {
    loading, error, test, questions, progress, context,
    completedCorrect, answered, total, percent,
  } = bank;

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600">Войдите, чтобы открыть банк вопросов</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка банка…</div>;

  if (error || !test) {
    return <div className="card p-8 text-sm text-[var(--status-critical-fg)]">{error || "Банк не найден"}</div>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <Link href="/tests" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> К тестам
      </Link>

      <BankHeader test={test} questionCount={questions.length} context={context} />

      <BankModes
        modeLinks={bank.modeLinks}
        questionCount={questions.length}
        progress={progress}
        answered={answered}
        total={total}
        percent={percent}
        completedCorrect={completedCorrect}
      />

      <BankQuestions page={bank} />
    </main>
  );
}

export default function TestBankPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка…</div>}>
      <TestBankPageInner params={params} />
    </Suspense>
  );
}
