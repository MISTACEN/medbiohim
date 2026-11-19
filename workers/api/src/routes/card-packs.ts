import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { CardPacksRouter } from "./card-packs/types";
import { registerListRoutes } from "./card-packs/01-list";
import { registerCrudRoutes } from "./card-packs/02-crud";
import { registerImportRoutes } from "./card-packs/03-import";
import { registerAiRoutes } from "./card-packs/04-ai";

const cardPacks: CardPacksRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerListRoutes(cardPacks);
registerCrudRoutes(cardPacks);
registerImportRoutes(cardPacks);
registerAiRoutes(cardPacks);

export default cardPacks;
