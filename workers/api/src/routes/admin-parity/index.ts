import { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";
import { registerAudit } from "./audit";
import { registerCommunity } from "./community";
import { registerContent } from "./content";
import { registerHomeworks } from "./homeworks";
import { registerMaterials } from "./materials";
import { registerProblemCenter } from "./problem-center";

/**
 * Admin parity — CMS-операции, которые фронтенд вызывает через /admin.
 *
 * Домены разделены по файлам, порядок регистрации сохранён как в исходном
 * монолите: community → homeworks → materials → problem-center → content → audit.
 */
const parity = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
registerCommunity(parity);
registerHomeworks(parity);
registerMaterials(parity);
registerProblemCenter(parity);
registerContent(parity);
registerAudit(parity);

export default parity;
