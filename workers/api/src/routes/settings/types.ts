import type { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";

export type SettingsRouter = Hono<{ Bindings: Env; Variables: AuthVariables }>;
