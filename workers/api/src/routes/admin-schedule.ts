import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { AdminScheduleRouter } from "./admin-schedule/types";
import { registerResolveRoutes } from "./admin-schedule/01-resolve";
import { registerVersionRoutes } from "./admin-schedule/02-versions";
import { registerSaveRoutes } from "./admin-schedule/03-save";
import { registerRollbackRoutes } from "./admin-schedule/04-rollback";
import { registerEntryUpdateRoutes } from "./admin-schedule/05-entry-update";
import { registerEntryDeleteRoutes } from "./admin-schedule/06-entry-delete";
import { registerAnalyticsRoutes } from "./admin-schedule/07-analytics";

const adminSchedule: AdminScheduleRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerResolveRoutes(adminSchedule);
registerVersionRoutes(adminSchedule);
registerSaveRoutes(adminSchedule);
registerRollbackRoutes(adminSchedule);
registerEntryUpdateRoutes(adminSchedule);
registerEntryDeleteRoutes(adminSchedule);
registerAnalyticsRoutes(adminSchedule);

export default adminSchedule;
