"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getProgress } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { KR_DATE_DEFAULT, progressOf, HISTOLOGY_PROGRAM } from "@/lib/study/program";
import { useStudentAgenda } from "@/lib/study/agenda";
import type { AgendaItem } from "@/lib/study/agenda";

import { DONE_KEY, KR_KEY, daysBetween, isoTodayLocal, readJson, type ProgressPayload } from "./study-hub-model";

/**
 * Данные хаба «Учёба»: прогресс с API, отметки плана подготовки и дата КР
 * из localStorage, лента «Ближайшее» (buildAgenda) и цели панелей подготовки.
 */
export function useStudyHub() {
  const { loading: authLoading, user } = useAuth();
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [krDate, setKrDate] = useState(KR_DATE_DEFAULT);
  const [today, setToday] = useState("");
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState("");
  // Сессия живёт в HttpOnly-куке, поэтому hasToken() (legacy localStorage)
  // всегда false и уже вошедшему студенту показывалось «Войти».
  const loggedIn = Boolean(user);
  const [prepTarget, setPrepTarget] = useState<AgendaItem | null>(null);
  const [planTarget, setPlanTarget] = useState<AgendaItem | null>(null);

  const { agenda, academic, assignments, loading: agendaLoading } = useStudentAgenda();

  useEffect(() => {
    setDone(readJson<Record<string, boolean>>(DONE_KEY, {}));
    const saved = readJson<string>(KR_KEY, KR_DATE_DEFAULT);
    setKrDate(/^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : KR_DATE_DEFAULT);
    setToday(isoTodayLocal());
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setProgressLoading(true);
    setProgressError("");
    void getProgress().then((result) => {
      if (cancelled) return;
      if (result.ok) setProgress(result.data as ProgressPayload);
      else setProgressError(describeApiError(result.error));
      setProgressLoading(false);
    });
    return () => { cancelled = true; };
  }, [authLoading]);

  const studyProgress = useMemo(() => progressOf(HISTOLOGY_PROGRAM, done), [done]);
  const academicDebts = academic?.debts?.length ?? 0;
  const totalDebts = assignments.filter((item) => item.status !== "passed").length + academicDebts;
  const overall = progress?.overall_pct ?? null;
  const homework = progress?.homework;
  const tests = progress?.tests;
  const homeworkPct = homework && homework.total > 0 ? Math.round((homework.done / homework.total) * 100) : 0;
  const testsPct = tests && tests.attempts > 0 ? Math.round(((tests.finished ?? 0) / tests.attempts) * 100) : 0;
  const daysLeft = krDate && today ? daysBetween(krDate, today) : 0;
  const loading = agendaLoading || progressLoading;

  return {
    authLoading, loggedIn, loading,
    progress, progressLoading, progressError,
    krDate, daysLeft, today,
    agenda, agendaLoading, academic, assignments,
    prepTarget, setPrepTarget, planTarget, setPlanTarget,
    studyProgress, academicDebts, totalDebts,
    overall, homework, tests, homeworkPct, testsPct,
  };
}

export type StudyHubView = ReturnType<typeof useStudyHub>;
