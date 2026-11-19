import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { ExportRouter } from "./export/types";
import { registerExportRoutes } from "./export/01-export";
import { registerDeletionRoutes } from "./export/02-deletion";
export { exportFileName, mapProfile, normalizeDeletion, deletionNotConfigured } from "./export/shared";

const account: ExportRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerExportRoutes(account);
registerDeletionRoutes(account);

export default account;
