import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import providers from "./ai/providers";
import conversations from "./ai/conversations";
import chat from "./ai/chat";
import notes from "./ai/notes";

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
// Группы роутов держат свои обработчики и подключаются сюда; пути в них
// абсолютные, поэтому монтируются в корень.
ai.route("/", providers);
ai.route("/", conversations);
ai.route("/", chat);
ai.route("/", notes);

export { buildLectureContext, normalizeChatMode } from "./ai/helpers";
export type { ChatMode, LectureCitation } from "./ai/helpers";
export { buildStudyContext } from "./ai/study-context";

export default ai;
