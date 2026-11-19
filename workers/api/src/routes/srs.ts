import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { SrsRouter } from "./srs/types";
import { registerSummaryRoutes } from "./srs/01-summary";
import { registerCardRoutes } from "./srs/02-cards";
import { registerReviewRoutes } from "./srs/03-review";
import { registerDeleteRoutes } from "./srs/04-delete";
import { registerDueRoutes } from "./srs/05-due";
import { registerRootRoutes } from "./srs/06-root";
export { nextReviewState } from "./srs/fsrs";
export type { FsrsCardState } from "./srs/fsrs";

const srs: SrsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerSummaryRoutes(srs);
registerCardRoutes(srs);
registerReviewRoutes(srs);
registerDeleteRoutes(srs);
registerDueRoutes(srs);
registerRootRoutes(srs);

export default srs;
