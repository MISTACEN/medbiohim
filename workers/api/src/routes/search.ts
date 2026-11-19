import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { SearchRouter } from "./search/types";
import { registerSearchRoute } from "./search/01-search";
import { registerSuggestRoute } from "./search/02-suggest";

const search: SearchRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerSearchRoute(search);
registerSuggestRoute(search);

export default search;
