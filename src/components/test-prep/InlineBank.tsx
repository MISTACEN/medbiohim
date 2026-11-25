"use client";

/**
 * Банк вопросов прямо на экране подготовки.
 *
 * Раньше «Состав банка» был ссылкой на отдельную страницу `/tests/bank/:id`, и
 * чтобы посмотреть вопросы с эталонами, приходилось уходить с экрана запуска.
 * Здесь тот же контроллер и та же разметка банка монтируются по требованию —
 * внутри раскрытого блока, поэтому список не грузится, пока его не открыли.
 */
import { useMemo } from "react";

import { BankQuestions } from "@/components/tests-hub/bank/BankQuestions";
import { useTestBank } from "@/components/tests-hub/bank/useTestBank";

export function InlineBank({ id }: { id: string }) {
  const params = useMemo(() => Promise.resolve({ id }), [id]);
  const bank = useTestBank(params);

  if (bank.loading) {
    return <p className="text-sm text-[var(--muted)]">Загрузка вопросов банка…</p>;
  }
  if (bank.error) {
    return <p className="text-sm text-[var(--status-critical-fg)]">{bank.error}</p>;
  }
  if (bank.questions.length === 0) {
    return <p className="text-sm text-[var(--muted)]">В банке пока нет вопросов.</p>;
  }

  return <BankQuestions page={bank} />;
}
