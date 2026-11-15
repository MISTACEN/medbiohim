"use client";

/**
 * «Своя ИИ-модель» (BYOM): пользователь подключает собственный провайдер
 * (OpenAI-compatible endpoint или Claude) — и его модель отвечает первой,
 * если она настроена с «приоритетом моей модели». Ключ шифруется на сервере
 * (AES-GCM) и не показывается после сохранения.
 */
import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import {
  deleteAiConfig, getAiConfig, saveAiConfig, testAiConfig,
  type UserAiConfig,
} from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";

const PROVIDER_LABEL: Record<string, string> = {
  openai_compatible: "OpenAI-compatible (OpenAI, Groq, OpenRouter, vLLM…)",
  anthropic: "Claude (Anthropic API)",
};

const BASE_HINT: Record<string, string> = {
  openai_compatible: "напр. https://api.openai.com/v1 или https://api.groq.com/openai/v1",
  anthropic: "напр. https://api.anthropic.com",
};

export function AiModelSettings() {
  const [config, setConfig] = useState<UserAiConfig | null>(null);
  const [encryptionReady, setEncryptionReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<"openai_compatible" | "anthropic">("openai_compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [preferOwn, setPreferOwn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await getAiConfig();
    setLoading(false);
    if (!response.ok) {
      setError(describeApiError((response as any).error));
      return;
    }
    setConfig(response.data.config);
    setEncryptionReady(response.data.encryption_ready !== false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  function startEditing() {
    setEditing(true);
    setTestResult(null);
    setError(null);
    setNote(null);
    if (config) {
      setProvider(config.provider);
      setBaseUrl(config.base_url);
      setModel(config.model);
      setPreferOwn(config.prefer_own);
      setApiKey("");
    }
  }

  function validate(): string | null {
    if (!baseUrl.trim()) return "Укажите base_url провайдера";
    if (!/^https:\/\//i.test(baseUrl.trim())) return "base_url должен начинаться с https://";
    if (!model.trim()) return "Укажите имя модели";
    if (config && !apiKey.trim()) return "Введите новый api_key (старый не хранится в открытом виде)";
    if (!config && apiKey.trim().length < 8) return "api_key слишком короткий";
    return null;
  }

  async function runTest() {
    const problem = validate();
    if (problem) { setTestResult({ ok: false, text: problem }); return; }
    setTestResult(null);
    setBusy(true);
    const response = await testAiConfig({
      provider, base_url: baseUrl.trim(), model: model.trim(), api_key: apiKey.trim(),
    });
    setBusy(false);
    if (!response.ok) {
      setTestResult({ ok: false, text: response.ok ? "" : describeApiError(response.error as any) });
      return;
    }
    const data = response.data;
    setTestResult({
      ok: data.ok,
      text: data.ok ? `Ключ работает — ответ провайдера за ${data.ms} мс` : `Провайдер ответил ошибкой ${data.status} (${data.error}) за ${data.ms} мс`,
    });
  }

  async function save() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    const response = await saveAiConfig({
      provider, base_url: baseUrl.trim(), model: model.trim(), api_key: apiKey.trim(), prefer_own: preferOwn,
    });
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError((response as any).error));
      return;
    }
    setNote("Модель сохранена. Ключ зашифрован — повторно он не показывается.");
    setEditing(false);
    setApiKey("");
    await reload();
  }

  async function remove() {
    setBusy(true);
    const response = await deleteAiConfig();
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError((response as any).error));
      return;
    }
    setConfig(null);
    setNote("Своя модель отключена — отвечают платформенные провайдеры.");
    await reload();
  }

  async function togglePreferOwn() {
    if (!config) return;
    const next = !config.prefer_own;
    setBusy(true);
    // Смена приоритета без переввода ключа: PUT без api_key сохраняет
    // прежний шифротекст (см. worker /ai/config).
    const response = await saveAiConfig({
      provider: config.provider, base_url: config.base_url, model: config.model,
      api_key: apiKey.trim(), prefer_own: next,
    });
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError((response as any).error));
      return;
    }
    await reload();
  }

  if (loading) {
    return <section className="card space-y-3 p-5"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</section>;
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5" /> Своя ИИ-модель</h2>
      <p className="text-sm text-[var(--muted)]">
        Подключите собственный провайдер — его модель отвечает вместо платформенных. Ключ шифруется
        на сервере и после сохранения не показывается.
      </p>
      {!encryptionReady ? (
        <p className="rounded-xl bg-[var(--status-warn-bg)] px-3 py-2 text-sm text-[var(--status-warn-fg)]">
          Шифрование ключей на сервере пока не настроено — обратитесь к администратору.
        </p>
      ) : null}
      {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {note ? <div className="rounded-xl bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">{note}</div> : null}

      {!editing ? (
        config ? (
          <>
            <div className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm">
              <b>{PROVIDER_LABEL[config.provider] || config.provider}</b>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{config.base_url} · модель: <b>{config.model}</b> · ключ ····{config.key_hint}</div>
              <div className="mt-1 text-xs">
                {config.prefer_own
                  ? "Приоритет: ваша модель отвечает первой, при отказе — платформенные."
                  : "Ваша модель доступна в тьюторе по явному выбору «Своя модель»."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={startEditing} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Изменить</button>
              <button type="button" onClick={() => void togglePreferOwn()} disabled={busy} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">
                {config.prefer_own ? "Отдать приоритет платформенным" : "Сделать моей моделью первый приоритет"}
              </button>
              <button type="button" onClick={() => void remove()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--status-critical-fg)]">
                <Trash2 className="h-4 w-4" /> Отключить
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={startEditing} className="btn-primary inline-flex items-center gap-2">
            <Bot className="h-4 w-4" /> Подключить свою модель
          </button>
        )
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              Провайдер
              <select value={provider} onChange={(e) => setProvider(e.target.value as "openai_compatible" | "anthropic")} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                <option value="openai_compatible">{PROVIDER_LABEL.openai_compatible}</option>
                <option value="anthropic">{PROVIDER_LABEL.anthropic}</option>
              </select>
            </label>
            <label className="text-sm">
              Модель
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4.1-mini"} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              base_url провайдера
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={BASE_HINT[provider]} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              api_key {config ? <span className="text-xs text-[var(--muted)]">(текущий скрыт — введите, только если меняете)</span> : null}
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config ? "••••" + config.key_hint : "sk-…"} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={preferOwn} onChange={(e) => setPreferOwn(e.target.checked)} />
            Ваша модель отвечает первой (при отказе — платформенные провайдеры)
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void runTest()} disabled={busy} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Проверить ключ</button>
            <button type="button" onClick={() => void save()} disabled={busy || !model.trim() || !baseUrl.trim()} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Сохранить
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(null); setTestResult(null); }} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">Отмена</button>
          </div>
          {testResult ? (
            <div className={"inline-flex items-center gap-1.5 text-sm " + (testResult.ok ? "text-[var(--status-ok-fg)]" : "text-[var(--status-critical-fg)]")}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {testResult.text}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

