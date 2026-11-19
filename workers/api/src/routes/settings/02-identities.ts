import { requireAuth } from "../../middleware/auth";
import { startIdentityLink, unlinkIdentity } from "./identities";

import type { SettingsRouter } from "./types";

export function registerIdentityRoutes(settings: SettingsRouter) {
settings.post("/identities/link", requireAuth, startIdentityLink);

settings.post("/identities/unlink", requireAuth, unlinkIdentity);
}
