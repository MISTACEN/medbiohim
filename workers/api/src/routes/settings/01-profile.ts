import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { readPreferences, savePreferences, readAccount, linkedIdentitiesOf } from "./shared";
import { updateProfile, changePassword, resendEmailChange } from "./profile";

import type { SettingsRouter } from "./types";

export function registerProfileRoutes(settings: SettingsRouter) {
settings.get("/", requireAuth, readPreferences);

settings.get("/preferences", requireAuth, readPreferences);

settings.patch("/", requireAuth, savePreferences); // Backward-compatible settings endpoint.

settings.get("/account", requireAuth, readAccount);

settings.get("/identities", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const items = linkedIdentitiesOf(c.get("user"));
    return c.json(ok({ items, count: items.length }, rid));
  } catch (error) {
    console.error("[settings:identities]", { error: String(error), requestId: rid });
    const { body, status } = fail("SETTINGS_ERROR", "Способы входа временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

settings.patch("/profile", requireAuth, updateProfile);

settings.post("/email/resend", requireAuth, resendEmailChange);

settings.post("/password", requireAuth, changePassword);

settings.put("/preferences", requireAuth, savePreferences);
}
