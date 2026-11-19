import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { TrainerRouter } from "./telegram-trainer/types";
import { registerCardRoutes } from "./telegram-trainer/01-cards";
import { registerReviewRoutes } from "./telegram-trainer/02-review";
import { registerChallengeRoutes } from "./telegram-trainer/03-challenge";
import { registerPrefsRoutes } from "./telegram-trainer/04-prefs";
import { registerFormulaRoutes } from "./telegram-trainer/05-formula";
import { registerMorningRoutes } from "./telegram-trainer/06-morning";

const telegramTrainer: TrainerRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerCardRoutes(telegramTrainer);
registerReviewRoutes(telegramTrainer);
registerChallengeRoutes(telegramTrainer);
registerPrefsRoutes(telegramTrainer);
registerFormulaRoutes(telegramTrainer);
registerMorningRoutes(telegramTrainer);

export default telegramTrainer;
