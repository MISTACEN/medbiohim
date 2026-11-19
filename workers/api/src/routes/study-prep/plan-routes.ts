import { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";
import type { PlanRouter } from "./plan/types";
import { registerPlanRoutes } from "./plan/01-plan";
import { registerAgentRoutes } from "./plan/02-agent";
import { registerAchievementRoutes } from "./plan/03-achievements";

const studyPrep: PlanRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerPlanRoutes(studyPrep);
registerAgentRoutes(studyPrep);
registerAchievementRoutes(studyPrep);

export default studyPrep;
