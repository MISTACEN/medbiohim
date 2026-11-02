/**
 * Защита каталога лекций от заглушек и дублей.
 *
 * Раньше в публичный каталог попадали короткие конспекты «на 1–3 заголовка» и
 * повторные записи той же темы. Теперь публикация проходит проверку: слишком
 * короткий текст и дубль по названию/теме отклоняются с понятным сообщением.
 * Тексты никогда не переписываются — только запрет на публикацию.
 */

/** Минимальный объём текста (без разметки), ниже которого это заглушка. */
export const MIN_PUBLISH_CHARS = 2500;

export type LectureIssue = {
  code: string;
  message: string;
  conflictId?: string;
  conflictTitle?: string;
};

/** Чистый текст лекции: без HTML-комментариев, фенсов и разметочных символов. */
export function plainLectureText(lecture: any): string {
  return String(lecture?.body_md || lecture?.body_markdown || lecture?.body || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lectureBodyLength(lecture: any): number {
  return plainLectureText(lecture).length;
}

/** Сравнимое название: без «Неделя 3 · Лекция 3», регистра, «ё» и пунктуации. */
export function normalizeLectureTitle(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^(?:неделя|недели)\s*[\d\s.,–\-—/]*/i, "")
    .replace(/(?:лекция|лекции|практика|семинар)\s*[\d\s.,–\-—/·]*/gi, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

/**
 * Проверка перед публикацией. `published` — уже опубликованные лекции
 * (кандидат из списка исключается по id).
 */
export function checkLectureForPublish(
  candidate: any,
  published: any[],
  options: { minChars?: number } = {}
): LectureIssue | null {
  const minChars = options.minChars ?? MIN_PUBLISH_CHARS;
  const length = lectureBodyLength(candidate);
  if (length < minChars) {
    return {
      code: "LECTURE_TOO_SHORT",
      message:
        "Лекция слишком короткая для публикации: " +
        length +
        " символов текста, минимум " +
        minChars +
        ". Похоже на заглушку — допишите материал или оставьте её черновиком.",
    };
  }

  if (/MBH:MERGED:INTO/i.test(String(candidate?.body_md || candidate?.body_markdown || ""))) {
    return {
      code: "LECTURE_MERGED_DUPLICATE",
      message: "Эта запись помечена как перенесённая в другую лекцию. Публиковать дубль не нужно.",
    };
  }

  const id = String(candidate?.id || "");
  const others = published.filter((item) => String(item?.id || "") !== id);

  const title = normalizeLectureTitle(candidate?.title);
  if (title) {
    const sameTitle = others.find((item) => normalizeLectureTitle(item?.title) === title);
    if (sameTitle) {
      return {
        code: "DUPLICATE_LECTURE",
        message:
          "Лекция с таким названием уже опубликована: «" +
          String(sameTitle.title || sameTitle.id) +
          "». Дополните её — дубль публиковать не нужно.",
        conflictId: String(sameTitle.id || ""),
        conflictTitle: String(sameTitle.title || ""),
      };
    }
  }

  const topic = normalizeLectureTitle(candidate?.topic);
  if (topic) {
    const sameTopic = others.find((item) => {
      if (normalizeLectureTitle(item?.topic) !== topic) return false;
      // Короткий конспект по теме, где уже есть полная лекция, — это заглушка.
      return lectureBodyLength(item) >= length * 1.5;
    });
    if (sameTopic) {
      return {
        code: "DUPLICATE_TOPIC",
        message:
          "По этой теме уже есть более полная лекция: «" +
          String(sameTopic.title || sameTopic.id) +
          "». Дополните её вместо новой короткой записи.",
        conflictId: String(sameTopic.id || ""),
        conflictTitle: String(sameTopic.title || ""),
      };
    }
  }

  return null;
}

/**
 * Перенос опубликованной лекции в каталог студентов (histology_lectures).
 *
 * Исторически редактор писал только в site_content:lectures, а страницы читают
 * histology_lectures — поэтому «опубликовано» не означало «видно студенту».
 * Теперь публикация синхронизирует запись, а снятие с публикации её скрывает.
 * Возвращает true, если каталог обновился; ошибка не отменяет публикацию.
 */
export async function syncPublishedLecture(db: any, lecture: any, published: boolean): Promise<boolean> {
  const id = String(lecture?.id || "").trim();
  if (!id) return false;
  const row = {
    id,
    subject_slug: String(lecture?.subject_slug || lecture?.subject || "histology").slice(0, 100),
    title: String(lecture?.title || "").slice(0, 500),
    body_markdown: String(lecture?.body_md || lecture?.body_markdown || ""),
    kind: "written_lecture",
    is_published: published,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error: dbError } = await db.from("histology_lectures").upsert(row, { onConflict: "id" });
    if (dbError) {
      console.error("[lecture-quality:sync]", dbError.message);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error("[lecture-quality:sync]", error?.message);
    return false;
  }
}
