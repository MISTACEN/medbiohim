"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Checkpoint, LabSession, LabTemplate } from "@/types/labs";

interface LabsProps {
  sessionId?: string; // If provided, open existing session
  subject?: string; // Subject slug used to filter lab templates
}

type LoadedSession = {
  session: LabSession;
  checkpoints: Checkpoint[];
};

function errorMessage(error: { code: string; message: string }) {
  if (error.code === "ROUTE_NOT_MIGRATED" || error.code === "ROUTE_NOT_IMPLEMENTED") {
    return "Раздел лабораторных пока недоступен: серверная часть ещё не развёрнута.";
  }
  return error.message;
}

export default function Labs({ sessionId, subject }: LabsProps) {
  const [templates, setTemplates] = useState<LabTemplate[]>([]);
  const [active, setActive] = useState<LoadedSession | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
    const result = await api<{ items: LabTemplate[] }>(`/labs/templates${query}`);
    setLoading(false);
    if (result.ok) setTemplates(result.data.items || []);
    else setError(errorMessage(result.error));
  }, [subject]);

  const loadSession = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const result = await api<LoadedSession>(`/labs/${encodeURIComponent(id)}`);
    setLoading(false);
    if (result.ok) {
      setActive({
        session: result.data.session,
        checkpoints: result.data.checkpoints || [],
      });
    } else {
      setError(errorMessage(result.error));
    }
  }, []);

  useEffect(() => {
    if (sessionId) void loadSession(sessionId);
    else void loadTemplates();
  }, [sessionId, loadSession, loadTemplates]);

  async function handleStartLab(templateId: string) {
    setSubmitting(true);
    setError(null);
    const result = await api<{ session: LabSession }>("/labs/start", {
      method: "POST",
      body: JSON.stringify({ template_id: templateId }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(errorMessage(result.error));
      return;
    }
    await loadSession(result.data.session.id);
  }

  async function handleSubmitAnswer(checkpointId: string, answerText: string) {
    if (!answerText.trim()) return;
    setSubmitting(true);
    setError(null);
    const result = await api("/labs/checkpoints/submit", {
      method: "POST",
      body: JSON.stringify({
        checkpoint_id: checkpointId,
        answers: [{ text: answerText.trim() }],
      }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(errorMessage(result.error));
      return;
    }
    setCurrentAnswer("");
    if (active) await loadSession(active.session.id);
  }

  async function handleFinishSession() {
    if (!active) return;
    if (!confirm("Завершить эту лабораторную работу?")) return;
    setSubmitting(true);
    setError(null);
    const result = await api(`/labs/${encodeURIComponent(active.session.id)}/finish`, {
      method: "POST",
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(errorMessage(result.error));
      return;
    }
    setActive(null);
    setCurrentAnswer("");
    await loadTemplates();
  }

  if (error) {
    return (
      <div className="labs-container">
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">
          <p>{error}</p>
          <Link href="/login" className="mt-2 inline-flex font-semibold text-[var(--status-critical-fg)] underline">
            Войти
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="labs-container">
        <p className="text-sm text-slate-500">Загрузка лабораторных…</p>
      </div>
    );
  }

  if (active) {
    return (
      <div className="labs-container">
        <header className="labs-header">
          <h1>{active.session.lab_name}</h1>
          <div className="progress-indicator">
            Прогресс: <strong>{active.session.progress_pct}%</strong> ({active.session.status})
          </div>
        </header>

        <main className="labs-content">
          <div className="checkpoint-list">
            {active.checkpoints.map((checkpoint) => (
              <CheckpointCard
                key={checkpoint.id}
                checkpoint={checkpoint}
                currentAnswer={checkpoint.has_result ? "" : currentAnswer}
                onAnswerChange={setCurrentAnswer}
                onSubmit={() => void handleSubmitAnswer(checkpoint.id, currentAnswer)}
                disabled={Boolean(checkpoint.has_result) || submitting}
              />
            ))}
          </div>

          <footer className="labs-footer">
            <button
              onClick={() => void handleFinishSession()}
              className="btn btn-primary"
              disabled={submitting || active.session.progress_pct < 100}
            >
              Завершить лабораторную
            </button>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="labs-container">
      <header className="labs-header">
        <h1>Интерактивные лабораторные работы</h1>
      </header>

      <main className="labs-content">
        <div className="lab-cards">
          {templates.length === 0 ? (
            <p>Доступных лабораторных работ пока нет.</p>
          ) : (
            templates.map((template) => (
              <LabCard
                key={template.id}
                template={template}
                busy={submitting}
                onStart={() => void handleStartLab(template.id)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function LabCard({
  template,
  busy,
  onStart,
}: {
  template: LabTemplate;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className="lab-card">
      <h3>{template.title}</h3>
      <div className="lab-meta">
        <span>{template.subject_area}</span>
        <span>{template.difficulty_level}</span>
        {template.estimated_duration_min ? <span>{template.estimated_duration_min} мин</span> : null}
      </div>
      <div className="lab-actions">
        <button onClick={onStart} className="btn btn-primary" disabled={busy}>
          Начать
        </button>
      </div>
    </div>
  );
}

function CheckpointCard({
  checkpoint,
  currentAnswer,
  onAnswerChange,
  onSubmit,
  disabled,
}: {
  checkpoint: Checkpoint;
  currentAnswer: string;
  onAnswerChange: (text: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className={`checkpoint-card ${checkpoint.has_result ? "answered" : ""}`}>
      <div className="checkpoint-header">
        <h4>
          {checkpoint.checkpoint_order}. {checkpoint.title}
        </h4>
        <span className={`status-badge ${checkpoint.grading_status || ""}`}>
          {checkpoint.grading_status || "Новый"}
        </span>
      </div>

      {checkpoint.description && <p className="checkpoint-description">{checkpoint.description}</p>}

      {!checkpoint.has_result && !disabled && (
        <div className="answer-form">
          <textarea
            value={currentAnswer}
            onChange={(event) => onAnswerChange(event.target.value)}
            placeholder="Введите ваш ответ здесь..."
            rows={4}
            className="answer-textarea"
          />
          <button onClick={onSubmit} disabled={!currentAnswer.trim()} className="btn btn-primary">
            Отправить ответ
          </button>
        </div>
      )}

      {checkpoint.has_result && (
        <div className="checkpoint-result">
          {checkpoint.feedback && (
            <div className="feedback">
              <strong>Обратная связь:</strong>
              <p>{checkpoint.feedback}</p>
            </div>
          )}
          <div className="score">
            Баллы:{" "}
            <strong>
              {checkpoint.score ?? "—"} / {checkpoint.max_points}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}
