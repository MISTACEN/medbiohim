"use client";

import Link from "next/link";
import { CircleHelp, Loader2 } from "lucide-react";
import { getTrainerImageUrl, hasToken } from "@/lib/api";
import { isElectronogramCard } from "@/lib/histologyOrder";
import { TrainerCardPicker } from "@/components/trainers/TrainerCardPicker";
import { TrainerCardRunner } from "@/components/trainers/TrainerCardRunner";
import { useTrainerFeedPage } from "@/components/trainers/useTrainerFeedPage";
import { useApiRequest } from "@/hooks/useApiRequest";

export default function TrainerFeedPage({ params }: { params: Promise<{ subject: string }> }) {
  const page = useTrainerFeedPage(params);
  const { queue, card, result, allCards, loading, subject, note } = page;

  const { data: imageUrl, loading: imageLoading } = useApiRequest<string | null>(
    async () => {
      if (!card) return null;
      // Электронограмма до ответа — «чистый» вариант без подписей: подписанная
      // версия раскрывает правильный ответ. После ответа — полная с подписями.
      const variant = isElectronogramCard(card) && result === null ? "clean" : undefined;
      return getTrainerImageUrl(card.id, variant);
    },
    // Зависимость от result намеренная: после ответа нужна другая версия картинки.
    [card?.id, result === null]
  );

  if (!hasToken()) return <div className="card mx-auto mt-10 max-w-md p-8 text-center"><p className="text-slate-600">Войдите, чтобы проходить тренажёр.</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;
  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загружаем тренажёр…</div>;
  if (!allCards.length) return <div className="card mx-auto mt-10 max-w-2xl p-8 text-center"><CircleHelp className="mx-auto h-8 w-8 text-indigo-500" /><h1 className="mt-3 text-xl font-bold">Тренажёр пока пуст</h1><p className="mt-2 text-sm text-slate-500">Для предмета «{subject}» опубликованные карточки ещё не импортированы.</p>{note && <p className="mt-2 text-sm text-[var(--status-critical-fg)]">{note}</p>}<Link href="/subjects" className="btn-primary mt-5 inline-flex">К предметам</Link></div>;

  // --- Экран выбора карточек ---
  if (!queue) return <TrainerCardPicker page={page} />;

  if (!card) return null;

  return <TrainerCardRunner page={page} imageUrl={imageUrl} imageLoading={imageLoading} />;
}
