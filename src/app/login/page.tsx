"use client";

import { Suspense } from "react";
import { Shield } from "lucide-react";

import { useLoginForm } from "@/components/auth/useLoginForm";
import { LoginMethodsPanel } from "@/components/auth/LoginMethodsPanel";

function LoginPageInner() {
  const form = useLoginForm();

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{ background: "linear-gradient(180deg, #f0f7f4 0%, #f8fafc 55%, #eef2ff 100%)" }}
    >
      <div className="relative w-full max-w-lg space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-white shadow-md">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Медбиохим</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в учебную платформу</p>
        </div>

        <LoginMethodsPanel form={form} />

        <p className="text-center text-xs leading-relaxed text-slate-500">
          Доступны только три способа входа: почта, Google и Telegram. Другие сервисы не используются.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginPageInner />
    </Suspense>
  );
}
