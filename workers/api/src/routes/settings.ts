import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { SettingsRouter } from "./settings/types";
import { registerProfileRoutes } from "./settings/01-profile";
import { registerIdentityRoutes } from "./settings/02-identities";
import { registerTelegramRoutes } from "./settings/03-telegram";
import { registerSessionRoutes } from "./settings/04-sessions";

const settings: SettingsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerProfileRoutes(settings);
registerIdentityRoutes(settings);
registerTelegramRoutes(settings);
registerSessionRoutes(settings);

export default settings;
