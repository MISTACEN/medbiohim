"use client";

import { Suspense } from "react";
import clsx from "clsx";
import { RefreshCw } from "lucide-react";

import { AccountOverview } from "@/components/settings/AccountOverview";
import { ActiveDevices } from "@/components/settings/ActiveDevices";
import { AiExplainCard } from "@/components/settings/AiExplainCard";
import { AiModelSettings } from "@/components/settings/AiModelSettings";
import { DataAccountCard } from "@/components/settings/DataAccountCard";
import { DensityCard } from "@/components/settings/DensityCard";
import { LoginMethodsCard } from "@/components/settings/LoginMethodsCard";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { PasswordCard } from "@/components/settings/PasswordCard";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { TelegramCard } from "@/components/settings/TelegramCard";
import { TestLayoutCard } from "@/components/settings/TestLayoutCard";
import { ThemesSection } from "@/components/settings/ThemesSection";
import { useSettingsData } from "@/components/settings/useSettingsData";

function SettingsPageInner() {
  const settings = useSettingsData();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-subtitle">Один аккаунт · почта / Google / Telegram · темы и уведомления</p>
        </div>
        <button type="button" onClick={() => void settings.load()} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <RefreshCw className={clsx("h-4 w-4", settings.loading && "animate-spin")} /> Обновить
        </button>
      </div>

      {settings.recoveryMode && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"><b>Восстановление пароля.</b> Сессия подтверждена. Задайте новый пароль ниже.</div>}

      {(settings.msg || settings.err) && (
        <div className={clsx("rounded-xl border px-4 py-3 text-sm", settings.err ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]" : "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]")}>
          {settings.err || settings.msg}
        </div>
      )}

      <AccountOverview
        account={settings.account}
        emailIdentity={settings.emailIdentity}
        linkedProviders={settings.linkedProviders}
        telegramStatus={settings.telegramStatus}
        fallbackEmail={settings.fallbackEmail}
      />

      <ProfileCard
        account={settings.account}
        avatarPreview={settings.avatarPreview}
        avatarUploadEnabled={settings.avatarUploadEnabled}
        avatarBusy={settings.avatarBusy}
        fullName={settings.fullName}
        email={settings.email}
        emailPending={settings.emailPending}
        busy={settings.busy}
        fallbackName={settings.fallbackName}
        fallbackEmail={settings.fallbackEmail}
        onFullName={settings.setFullName}
        onEmail={settings.setEmail}
        onAvatarPick={settings.onAvatarPick}
        onAvatarRemove={() => void settings.onAvatarRemove()}
        onSaveProfile={(event) => void settings.onSaveProfile(event)}
        onResendEmailChange={() => void settings.onResendEmailChange()}
      />

      <DensityCard />

      <AiModelSettings />

      <PasswordCard
        currentPassword={settings.currentPassword}
        password={settings.password}
        password2={settings.password2}
        busy={settings.busy}
        onCurrentPassword={settings.setCurrentPassword}
        onPassword={settings.setPassword}
        onPassword2={settings.setPassword2}
        onSubmit={(event) => void settings.onChangePassword(event)}
      />

      <ActiveDevices
        sessions={settings.sessions}
        error={settings.sessionsError}
        busy={settings.sessionsBusy}
        onRetry={settings.loadSessions}
        onRevoke={settings.onRevokeSession}
        onRevokeOthers={settings.onRevokeOtherSessions}
      />

      <LoginMethodsCard
        identities={settings.identities}
        emailIdentity={settings.emailIdentity}
        account={settings.account}
        fallbackEmail={settings.fallbackEmail}
        linkedProviders={settings.linkedProviders}
        googleProvider={settings.googleProvider}
        busy={settings.busy}
        onUnlink={(identity) => void settings.onUnlink(identity)}
        onLink={(provider) => void settings.onLink(provider)}
      />

      <TelegramCard
        loading={settings.loading}
        busy={settings.busy}
        telegramStatus={settings.telegramStatus}
        telegramStatusError={settings.telegramStatusError}
        telegramWait={settings.telegramWait}
        clock={settings.clock}
        onStart={() => void settings.onStartTelegramLink()}
        onUnlink={() => void settings.onUnlinkTelegram()}
        onCancelWait={() => settings.onCancelTelegramWait()}
        onCheckStatus={() => void settings.checkTelegramStatus()}
      />

      <NotificationsCard />

      <DataAccountCard />

      <TestLayoutCard trainerLayout={settings.trainerLayout} onSelect={(layout) => void settings.saveTrainerLayout(layout)} />

      {settings.referenceThemes.length > 0 && (
        <ThemesSection
          themes={settings.referenceThemes}
          activeTheme={settings.theme}
          onSelect={settings.selectTheme}
          title="Темы из макетов"
          description="Стекло, градиенты, медицинский индиго"
          hero
        />
      )}

      <AiExplainCard value={settings.aiExplainProvider} onSelect={(id) => void settings.saveAiExplainProvider(id)} />

      <ThemesSection
        themes={settings.otherThemes.length ? settings.otherThemes : settings.themes}
        activeTheme={settings.theme}
        onSelect={settings.selectTheme}
        title="Классические темы"
      />
      {settings.dialog}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка…</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
