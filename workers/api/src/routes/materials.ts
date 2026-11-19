import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { MaterialsRouter } from "./materials/types";
import { registerListRoutes } from "./materials/01-list";
import { registerFileRoutes } from "./materials/02-file";
import { registerDetailRoutes } from "./materials/03-detail";
import { registerOpenRoutes } from "./materials/04-open";

const materials: MaterialsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerListRoutes(materials);
registerFileRoutes(materials);
registerDetailRoutes(materials);
registerOpenRoutes(materials);

export default materials;
