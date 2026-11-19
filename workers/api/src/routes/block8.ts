import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import type { Block8Router } from "./block8/types";
import { registerInviteRoutes } from "./block8/01-invites";
import { registerInviteAcceptRoutes } from "./block8/02-invite-accept";
import { registerJoinRequestRoutes } from "./block8/03-join-requests";
import { registerSosRoutes } from "./block8/04-sos";

const block8: Block8Router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

registerInviteRoutes(block8);
registerInviteAcceptRoutes(block8);
registerJoinRequestRoutes(block8);
registerSosRoutes(block8);

export default block8;
