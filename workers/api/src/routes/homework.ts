import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { HomeworkRouter } from "./homework/types";
import { registerCreateRoutes } from "./homework/01-create";
import { registerSubmitRoutes } from "./homework/02-submit";
import { registerSubmissionRoutes } from "./homework/03-submissions";
import { registerEditRoutes } from "./homework/04-edit";

const homework: HomeworkRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerCreateRoutes(homework);
registerSubmitRoutes(homework);
registerSubmissionRoutes(homework);
registerEditRoutes(homework);

export default homework;
