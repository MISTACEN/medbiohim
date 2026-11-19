import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { LecturesRouter } from "./lectures/types";
import { registerClozeRoutes } from "./lectures/01-cloze";
import { registerCatalogRoutes } from "./lectures/02-catalog";
import { registerMediaRoutes } from "./lectures/03-media";
import { registerSlideRoutes } from "./lectures/04-slides";
import { registerDetailRoutes } from "./lectures/05-detail";

const lectures: LecturesRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerClozeRoutes(lectures);
registerCatalogRoutes(lectures);
registerMediaRoutes(lectures);
registerSlideRoutes(lectures);
registerDetailRoutes(lectures);

export default lectures;
