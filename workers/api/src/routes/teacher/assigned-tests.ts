import { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";
import type { TeacherEnv } from "./assigned-tests/types";
import { registerCreateRoutes } from "./assigned-tests/01-create";
import { registerListRoutes } from "./assigned-tests/02-list";
import { registerDeleteRoutes } from "./assigned-tests/03-delete";
import { registerAnalyticsRoutes } from "./assigned-tests/04-analytics";
import { registerExportRoutes } from "./assigned-tests/05-export";

const teacher: TeacherEnv = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerCreateRoutes(teacher);
registerListRoutes(teacher);
registerDeleteRoutes(teacher);
registerAnalyticsRoutes(teacher);
registerExportRoutes(teacher);

export default teacher;
