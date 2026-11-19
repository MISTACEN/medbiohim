import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { LabsRouter } from "./labs/types";
import { registerTemplateRoutes } from "./labs/01-templates";
import { registerStartRoutes } from "./labs/02-start";
import { registerSessionRoutes } from "./labs/03-session";
import { registerCheckpointRoutes } from "./labs/04-checkpoints";
import { registerFinishRoutes } from "./labs/05-finish";
import { registerResultRoutes } from "./labs/06-results";

const labs: LabsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerTemplateRoutes(labs);
registerStartRoutes(labs);
registerSessionRoutes(labs);
registerCheckpointRoutes(labs);
registerFinishRoutes(labs);
registerResultRoutes(labs);

export default labs;
