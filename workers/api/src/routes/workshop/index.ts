import { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";
import { registerCatalog } from "./catalog";
import { registerItems } from "./items";
import { registerModeration } from "./moderation";

/**
 * Workshop — общий пул студенческих материалов.
 *
 * Домены разделены по файлам, порядок регистрации сохранён как в исходном
 * монолите: каталог → операции с материалом → модерация.
 */
const workshop = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
registerCatalog(workshop);
registerItems(workshop);
registerModeration(workshop);

export default workshop;
