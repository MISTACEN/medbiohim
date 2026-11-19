"use client";

import { Bell, Globe2 } from "lucide-react";

/** Уведомления: честное состояние вместо переключателей без движка доставки. */
export function NotificationsCard() {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Bell className="h-5 w-5" /> Уведомления</h2>
      {/* SA5: раньше здесь были чекбоксы, которые только писались в настройки и
          ничего не включали — движка доставки нет. Пустышка хуже отсутствия:
          показываем честное состояние вместо переключателей-обманок. */}
      <p className="text-sm text-[var(--muted)]">
        Пока уведомления не отправляются: движок доставки (письма и Telegram-дайджест) ещё не подключён.
        Поэтому переключателей нет — они бы ни на что не влияли.
      </p>
      <ul className="space-y-1 text-sm text-[var(--muted)]">
        <li>• Расписание, оценки и задания всегда видны в интерфейсе — без уведомлений.</li>
        <li>• Telegram-бот присылает только подтверждение привязки аккаунта.</li>
        <li>• Когда доставка появится, настройки частоты и тихих часов придут сюда же.</li>
      </ul>
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Globe2 className="h-3.5 w-3.5" /> Язык интерфейса: русский</div>
    </section>
  );
}
