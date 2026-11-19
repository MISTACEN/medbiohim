import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { AuthRouter } from "./auth/types";
import { registerSessionRoutes } from "./auth/01-session";
import { registerTelegramRoutes } from "./auth/02-telegram";
import { registerMeRoute } from "./auth/03-me";

const auth: AuthRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerSessionRoutes(auth);
registerTelegramRoutes(auth);
registerMeRoute(auth);

export default auth;
