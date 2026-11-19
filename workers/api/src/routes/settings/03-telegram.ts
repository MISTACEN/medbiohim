import { requireAuth } from "../../middleware/auth";
import { readTelegramStatus, startTelegramLink, unlinkTelegramAccount } from "./telegram";

import type { SettingsRouter } from "./types";

export function registerTelegramRoutes(settings: SettingsRouter) {
settings.get("/telegram/status", requireAuth, readTelegramStatus);

settings.post("/telegram/link-start", requireAuth, startTelegramLink);

settings.post("/telegram/unlink", requireAuth, unlinkTelegramAccount);
}
