import type { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";

export type SrsRouter = Hono<{ Bindings: Env; Variables: AuthVariables }>;
