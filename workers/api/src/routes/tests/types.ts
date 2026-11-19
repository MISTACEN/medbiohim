import type { Hono } from "hono";
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";

export type TestsRouter = Hono<{ Bindings: Env; Variables: AuthVariables }>;
