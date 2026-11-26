/**
 * Диагностикум гистологии: тренировка распознавания препаратов.
 *
 * Четыре режима: «определи препарат», «найди структуры», «отличи похожие» и
 * «комплексный». Задание собирается на сервере из методических карточек
 * (`preparation_guides`) и карточек банка с изображениями (`trainer_feed_cards`),
 * ключ ответа хранится в строке попытки и клиенту не выдаётся.
 *
 * Здесь только обзор разделов и старт задания; ход попытки (подсказки, ответ,
 * статистика) — в `session.ts`, общие загрузки — в `shared.ts`, правила — в
 * `model.ts`.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import type { Env } from "../../env";
import {
  DIAGNOSTICUM_MODES,
  MAX_HINTS,
  buildElectronogramQuestion,
  buildQuestion,
  normalizeName,
  shuffle,
  type AnswerKey,
  type DiagnosticumMode,
  type Question,
} from "./model";
import { MODE_LABELS, isConstraintViolation, isMissingTable, loadBank } from "./shared";
import { FIRST_DIAGNOSTICUM, isSetSection, setGuides } from "./sets";
import session from "./session";

const diagnosticum = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function modeSummary() {
  return DIAGNOSTICUM_MODES.map((mode) => ({ mode, title: MODE_LABELS[mode] }));
}

function isMode(value: unknown): value is DiagnosticumMode {
  return typeof value === "string" && (DIAGNOSTICUM_MODES as string[]).includes(value);
}

/** Разделы диагностикума берутся из методических карточек, а не из хардкода. */
diagnosticum.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const loaded = await loadBank(c.get("supabase"), rid);
  if ("error" in loaded) {
    if (loaded.error === "NOT_MIGRATED") {
      return c.json(ok({ sections: [], modes: modeSummary(), migrated: false }, rid));
    }
    const { body, status } = fail("DB_UNAVAILABLE", "Диагностикум недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  const bySection = new Map<string, { section: string; total: number; systems: Set<string> }>();
  for (const guide of loaded.bank.guides) {
    const section = String(guide.section || "").trim();
    if (!section) continue;
    const entry = bySection.get(section) ?? { section, total: 0, systems: new Set<string>() };
    entry.total += 1;
    if (guide.system) entry.systems.add(String(guide.system));
    bySection.set(section, entry);
  }

  // Набор первой диагностики — первым разделом: он собран из тех же методичек,
  // но по списку концепции, и его неполнота видна сразу («18 из 19»).
  const first = setGuides(FIRST_DIAGNOSTICUM, loaded.bank.guides);
  const sections = [
    {
      section: FIRST_DIAGNOSTICUM.title,
      total: first.guides.length,
      systems: [],
      ...(first.missing.length ? { missing: first.missing.length } : {}),
    },
    ...Array.from(bySection.values())
      .filter((entry) => !isSetSection(FIRST_DIAGNOSTICUM, entry.section))
      .map((entry) => ({
        section: entry.section,
        total: entry.total,
        systems: Array.from(entry.systems),
      })),
  ];

  return c.json(
    ok(
      {
        sections,
        modes: modeSummary(),
        total_guides: loaded.bank.guides.length,
        total_cards: loaded.bank.cards.length,
        migrated: true,
      },
      rid,
    ),
  );
});

/** POST /diagnosticum/start — новое задание. */
diagnosticum.post("/start", requireAuth, async (c) => {
  const rid = requestId();
  const body = (await c.req.json().catch(() => null)) as
    | { mode?: unknown; section?: unknown }
    | null;

  if (!isMode(body?.mode)) {
    const { body: errorBody, status } = fail(
      "VALIDATION_ERROR",
      "Неизвестный режим диагностикума",
      422,
      rid,
    );
    return c.json(errorBody, status as 422);
  }

  const section = String(body?.section ?? "").trim();
  const loaded = await loadBank(c.get("supabase"), rid);
  if ("error" in loaded) {
    const notMigrated = loaded.error === "NOT_MIGRATED";
    const { body: errorBody, status } = fail(
      notMigrated ? "NOT_MIGRATED" : "DB_UNAVAILABLE",
      notMigrated
        ? "Диагностикум ещё не подключён: нужна миграция методических карточек"
        : "Диагностикум недоступен",
      503,
      rid,
    );
    return c.json(errorBody, status as 503);
  }

  const { bank } = loaded;
  const setRequested = isSetSection(FIRST_DIAGNOSTICUM, section);
  const pool = setRequested
    ? setGuides(FIRST_DIAGNOSTICUM, bank.guides).guides
    : section
      ? bank.guides.filter((guide) => normalizeName(guide.section) === normalizeName(section))
      : bank.guides;

  // Электронограммы — отдельный банк без методичек, поэтому раздел препаратов
  // к ним не применяется.
  if (body.mode === "electronogram") {
    const em = buildElectronogramQuestion(bank.cards);
    if (!em) {
      const { body: errorBody, status } = fail(
        "NOT_FOUND",
        "Для электронограмм не хватает карточек с изображениями",
        404,
        rid,
      );
      return c.json(errorBody, status as 404);
    }

    const user = c.get("user");
    const insert = await c
      .get("supabase")
      .from("diagnosticum_attempts")
      .insert({
        user_id: user.id,
        mode: body.mode,
        section: em.section,
        guide_key: em.guideKey,
        card_id: em.question.image_card_id,
        question: em.question,
        answers: em.answers,
      })
      .select("id,created_at")
      .single();

    if (insert.error) {
      if (isMissingTable(insert.error)) {
        const { body: errorBody, status } = fail(
          "NOT_MIGRATED",
          "Диагностикум ещё не подключён: нужна миграция попыток",
          503,
          rid,
        );
        return c.json(errorBody, status as 503);
      }
      // 23514 = ограничение режимов ещё не расширено миграцией.
      if (isConstraintViolation(insert.error)) {
        const { body: errorBody, status } = fail(
          "NOT_MIGRATED",
          "Новый режим ещё не включён: нужна миграция режимов диагностикума",
          503,
          rid,
        );
        return c.json(errorBody, status as 503);
      }
      console.error("[diagnosticum:start:em]", insert.error.message, rid);
      const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Не удалось начать задание", 503, rid);
      return c.json(errorBody, status as 503);
    }

    return c.json(
      ok(
        {
          attempt_id: insert.data?.id,
          mode: body.mode,
          section: em.section,
          question: em.question,
          hints_total: MAX_HINTS,
          hints_used: 0,
          created_at: insert.data?.created_at,
        },
        rid,
      ),
    );
  }

  if (!pool.length) {
    const { body: errorBody, status } = fail(
      "NOT_FOUND",
      "В этом разделе нет препаратов для диагностики",
      404,
      rid,
    );
    return c.json(errorBody, status as 404);
  }

  // Препарат без карточки с изображением пропускаем: диагностировать нечего.
  let built: { section: string; guideKey: string; question: Question; answers: AnswerKey } | null = null;
  for (const guide of shuffle(pool, Math.random)) {
    const result = buildQuestion({
      guide,
      guides: bank.guides,
      cards: bank.cards,
      mode: body.mode,
      structureTitles: bank.structureTitles,
    });
    if (result) {
      built = {
        // Попытка из набора сохраняет имя набора, иначе статистика разложит её
        // по системам органов и набор перестанет считаться отдельно.
        section: setRequested ? FIRST_DIAGNOSTICUM.title : String(guide.section || ""),
        guideKey: guide.key,
        question: result.question,
        answers: result.answers,
      };
      break;
    }
  }

  if (!built) {
    const { body: errorBody, status } = fail(
      "NOT_FOUND",
      "Для заданий этого режима не хватает изображений препаратов",
      404,
      rid,
    );
    return c.json(errorBody, status as 404);
  }

  const user = c.get("user");
  const insert = await c
    .get("supabase")
    .from("diagnosticum_attempts")
    .insert({
      user_id: user.id,
      mode: body.mode,
      section: built.section,
      guide_key: built.guideKey,
      card_id: built.question.image_card_id,
      question: built.question,
      answers: built.answers,
    })
    .select("id,created_at")
    .single();

  if (insert.error) {
    if (isMissingTable(insert.error)) {
      const { body: errorBody, status } = fail(
        "NOT_MIGRATED",
        "Диагностикум ещё не подключён: нужна миграция попыток",
        503,
        rid,
      );
      return c.json(errorBody, status as 503);
    }
    if (isConstraintViolation(insert.error)) {
      const { body: errorBody, status } = fail(
        "NOT_MIGRATED",
        "Новый режим ещё не включён: нужна миграция режимов диагностикума",
        503,
        rid,
      );
      return c.json(errorBody, status as 503);
    }
    console.error("[diagnosticum:start]", insert.error.message, rid);
    const { body: errorBody, status } = fail("DB_UNAVAILABLE", "Не удалось начать задание", 503, rid);
    return c.json(errorBody, status as 503);
  }

  return c.json(
    ok(
      {
        attempt_id: insert.data?.id,
        mode: body.mode,
        section: built.section,
        question: built.question,
        hints_total: MAX_HINTS,
        hints_used: 0,
        created_at: insert.data?.created_at,
      },
      rid,
    ),
  );
});

diagnosticum.route("/", session);

export default diagnosticum;
