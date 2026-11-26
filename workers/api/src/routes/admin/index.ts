import { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";
import dbAdmin from "../admin-database";
import adminParity from "../admin-parity";
import trainerAtlas from "../trainer-atlas";
import { registerOverview } from "./overview";
import { registerQuestions } from "./questions";
import { registerTests } from "./tests";
import { registerLectures } from "./lectures";
import { registerUsers } from "./users";
import { registerTelegram } from "./telegram";
import { registerContent } from "./content";
import { registerFiles } from "./files";
import { registerSchedule } from "./schedule";
import { registerAnnouncements } from "./announcements";
import { registerPresence } from "./presence";
import { registerPreparationGuides } from "./preparation-guides";
import { registerTrainerCards } from "./trainer-cards";

/**
 * Админ-консоль платформы.
 *
 * Домены разделены по файлам, порядок регистрации сохранён как в исходном
 * монолите: сводка → вопросы → тесты → лекции → пользователи → telegram →
 * импорт контента → файлы → расписание → объявления → присутствие, затем
 * вложенные приложения /database, admin-parity и /atlas.
 */
const admin = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
registerOverview(admin);
registerQuestions(admin);
registerTests(admin);
registerLectures(admin);
registerUsers(admin);
registerTelegram(admin);
registerContent(admin);
registerFiles(admin);
registerSchedule(admin);
registerAnnouncements(admin);
registerPresence(admin);
registerPreparationGuides(admin);
registerTrainerCards(admin);

admin.route("/database", dbAdmin);
admin.route("/", adminParity);
admin.route("/atlas", trainerAtlas);

export default admin;
