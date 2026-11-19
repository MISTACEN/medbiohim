"use client";

/** ДЗ, файлы и диагностика: состояние и действия вкладок админ-инструментов. */
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { adminPresence, adminValidateContent, adminFileAudit, adminMediaCapabilities, health, hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

export type ToolsTab = "learning" | "storage" | "system";

export function useToolsPanel() {
  const { user } = useAuth();
  const [backendHealth, setBackendHealth] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<ToolsTab>("learning");
  const [fileAudit, setFileAudit] = useState<any>(null);
  const [fileAuditing, setFileAuditing] = useState(false);
  const [mediaCapabilities, setMediaCapabilities] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [presence, setPresence] = useState<any[]>([]);
  const [transport, setTransport] = useState<{ source: string; fallback: boolean; path: string; at: number } | null>(null);

  useEffect(() => {
    const onTransport = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; fallback?: boolean; path?: string; at?: number }>).detail;
      if (!detail || typeof detail.source !== "string") return;
      setTransport({
        source: detail.source,
        fallback: Boolean(detail.fallback),
        path: typeof detail.path === "string" ? detail.path : "",
        at: typeof detail.at === "number" ? detail.at : Date.now(),
      });
    };
    window.addEventListener("mbh:api-transport", onTransport);
    return () => window.removeEventListener("mbh:api-transport", onTransport);
  }, []);

  async function load() {
    setRefreshing(true);
    setError("");
    const [h, p] = await Promise.all([health(), adminPresence(180)]);
    if (h.ok) setBackendHealth(h.data);
    if (p.ok) setPresence(p.data.items || []);
    else setError(describeApiError(p.error));
    setRefreshing(false);
  }

  async function validateContent() {
    setValidating(true);
    const r = await adminValidateContent();
    setValidating(false);
    if (r.ok) setValidation(r.data);
    else setError(describeApiError(r.error));
  }

  async function validateFiles() {
    setFileAuditing(true);
    const [r, caps] = await Promise.all([adminFileAudit(300), adminMediaCapabilities()]);
    setFileAuditing(false);
    if (r.ok) setFileAudit(r.data);
    else setError(describeApiError(r.error));
    if (caps.ok) setMediaCapabilities(caps.data);
    else setError(describeApiError(caps.error));
  }

  useEffect(() => {
    if (hasToken()) void load();
  }, []);

  return {
    user, backendHealth, error, setError, refreshing,
    tab, setTab, fileAudit, fileAuditing,
    mediaCapabilities, validation, validating,
    presence, transport,
    load, validateContent, validateFiles,
  };
}
