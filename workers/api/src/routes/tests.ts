import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { TestsRouter } from "./tests/types";
import { registerCatalogRoutes } from "./tests/01-catalog";
import { registerHistoryRoutes } from "./tests/02-history";
import { registerBankRoutes } from "./tests/03-banks";
import { registerAttemptRoutes } from "./tests/04-attempts";

const tests: TestsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerCatalogRoutes(tests);
registerHistoryRoutes(tests);
registerBankRoutes(tests);
registerAttemptRoutes(tests);

export default tests;
