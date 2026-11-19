"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listHomeworks, listHomeworkSubmissions, setHomeworkDone, submitHomework, hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useAuth } from "@/components/auth/AuthProvider";

import { type Filter, type Homework, type Submission, isDone, isOverdue } from "./model";

/**
 * Данные и действия раздела «Задания»: список ДЗ группы, фильтры, открытие
 * карточки с загрузкой сданных попыток, отправка ответа и отметка выполнения.
 */
export function useHomeworkData() {
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [items, setItems] = useState<Homework[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listHomeworks();
    if (result.ok) {
      setItems(Array.isArray(result.data?.items) ? (result.data.items as Homework[]) : []);
    } else {
      setError({ message: describeApiError(result.error), requestId: (result.error as { requestId?: string })?.requestId });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || !hasToken()) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, load]);

  const openCard = async (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    setActionError("");
    setAnswer("");
    if (next && !submissions[id]) {
      setSubmissionsLoading(true);
      const result = await listHomeworkSubmissions(id);
      if (result.ok) {
        setSubmissions((prev) => ({ ...prev, [id]: Array.isArray(result.data?.items) ? result.data.items : [] }));
      } else {
        setActionError(describeApiError(result.error));
      }
      setSubmissionsLoading(false);
    }
  };

  const toggleDone = async (h: Homework) => {
    setBusyId(h.id);
    setActionError("");
    const result = await setHomeworkDone(h.id, !isDone(h));
    if (result.ok) {
      setItems((prev) => prev.map((row) => (row.id === h.id ? { ...row, my_status: !isDone(h) ? "done" : "assigned" } : row)));
    } else {
      setActionError(describeApiError(result.error));
    }
    setBusyId(null);
  };

  const submit = async (h: Homework) => {
    if (!answer.trim()) {
      setActionError("Напишите ответ перед отправкой.");
      return;
    }
    setBusyId(h.id);
    setActionError("");
    const result = await submitHomework(h.id, answer.trim());
    if (result.ok) {
      setAnswer("");
      const refreshed = await listHomeworkSubmissions(h.id);
      if (refreshed.ok) {
        setSubmissions((prev) => ({ ...prev, [h.id]: Array.isArray(refreshed.data?.items) ? refreshed.data.items : [] }));
      }
    } else {
      setActionError(describeApiError(result.error));
    }
    setBusyId(null);
  };

  const filtered = useMemo(() => {
    return items.filter((h) => {
      const done = isDone(h);
      if (filter === "done") return done;
      if (filter === "active") return !done && !isOverdue(h);
      if (filter === "overdue") return !done && isOverdue(h);
      return true;
    });
  }, [items, filter]);

  const counts = useMemo(() => ({
    all: items.length,
    done: items.filter(isDone).length,
    overdue: items.filter((h) => !isDone(h) && isOverdue(h)).length,
    active: items.filter((h) => !isDone(h) && !isOverdue(h)).length,
  }), [items]);

  return {
    authLoading, loading, error, items,
    filter, setFilter, openId, answer, setAnswer,
    busyId, submissions, submissionsLoading, actionError,
    load, openCard, toggleDone, submit, filtered, counts,
  };
}

export type HomeworkDataView = ReturnType<typeof useHomeworkData>;
