import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { TrainersRouter } from "./trainers/types";
import { registerFeedRoutes } from "./trainers/01-feed";
import { registerAnswerRoutes } from "./trainers/02-answer";
import { registerImageRoutes } from "./trainers/03-image";
import { registerMineRoutes } from "./trainers/04-mine";

const trainers: TrainersRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerFeedRoutes(trainers);
registerAnswerRoutes(trainers);
registerImageRoutes(trainers);
registerMineRoutes(trainers);

export default trainers;
