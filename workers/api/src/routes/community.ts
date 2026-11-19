import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { CommunityRouter } from "./community/types";
import { registerPostRoutes } from "./community/01-posts";
import { registerCommentRoutes } from "./community/02-comments";
import { registerModerationRoutes } from "./community/03-moderation";
import { registerAdminReportRoutes } from "./community/04-admin-reports";

const community: CommunityRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerPostRoutes(community);
registerCommentRoutes(community);
registerModerationRoutes(community);
registerAdminReportRoutes(community);

export default community;
