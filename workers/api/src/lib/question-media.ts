/**
 * Рисунки к вопросам.
 *
 * Вопросы банка и прохождения приходят из RPC-функций Supabase, которые
 * отдают фиксированный набор полей без `media`. Вместо правки SQL-функций
 * (риск для RLS и уже проверенной логики) подмешиваем медиа на уровне
 * Worker'а: один запрос по id, только если рисунки действительно нужны.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function attachQuestionMedia(db: any, questions: unknown): Promise<void> {
  const list = Array.isArray(questions) ? (questions as Array<Record<string, unknown>>) : [];
  if (!list.length || !db) return;
  const ids = Array.from(
    new Set(list.map((q) => String(q?.id ?? "")).filter((id) => UUID.test(id))),
  );
  if (!ids.length) return;
  try {
    const { data, error } = await db.from("questions").select("id,media").in("id", ids);
    if (error || !Array.isArray(data)) return;
    const byId = new Map<string, unknown[]>(
      data.map((row: any) => [String(row.id), Array.isArray(row.media) ? row.media : []]),
    );
    for (const question of list) {
      const media = byId.get(String(question?.id ?? ""));
      // Пустой массив не подставляем: клиент проверяет наличие поля.
      if (media && media.length) question.media = media;
    }
  } catch (error) {
    // Рисунок — не причина падать тесту: текст и варианты важнее.
    console.error("[question-media]", String(error));
  }
}
