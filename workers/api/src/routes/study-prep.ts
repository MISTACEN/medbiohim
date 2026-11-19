/**
 * Фаза 1 дорожной карты (docs/AI-STUDY-ROADMAP.md §2.1): «готовность к событию»
 * и план подготовки по дням.
 *
 * Связь «событие → темы» строится детерминированно, без LLM:
 *   schedule_entries(date, event_kind, subject_id)
 *     → curriculum_items.topic_id (темы, пройденные к дате события)
 *     → user_topic_progress.percent (освоенность темы)
 *   нет тем в плане → темы предмета из topics/modules (сначала непройденные).
 *
 * Готовность = среднее percent по темам события. План раскладывает темы по дням
 * (по возрастанию освоенности) и ставит финальный прогон накануне события.
 * «Почему» у шага — правило по освоенности, а не текст модели: так план не
 * зависит от доступности ИИ, не тратит квоты и воспроизводим в тестах.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import planRoutes from "./study-prep/plan-routes";
import questRoutes from "./study-prep/quest-routes";

const studyPrep = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
studyPrep.route("/", planRoutes);
studyPrep.route("/", questRoutes);

export { PREP_KINDS, prepReadinessForEvents } from "./study-prep/planning";

export default studyPrep;
