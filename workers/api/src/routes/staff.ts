import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { StaffRouter } from "./staff/types";
import { registerGroupRoutes } from "./staff/01-groups";
import { registerRequestRoutes } from "./staff/02-requests";
import { registerFixRoutes } from "./staff/03-fixes";
import { registerTopicRoutes } from "./staff/04-topics";
import { registerNotificationRoutes } from "./staff/05-notifications";

const staff: StaffRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerGroupRoutes(staff);
registerRequestRoutes(staff);
registerFixRoutes(staff);
registerTopicRoutes(staff);
registerNotificationRoutes(staff);

export default staff;
