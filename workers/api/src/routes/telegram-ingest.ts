import { Hono } from "hono";
import type { Env } from "../env";
import type { TelegramIngestRouter } from "./telegram-ingest/types";
import { registerHealthRoutes } from "./telegram-ingest/01-health";
import { registerIngestRoutes } from "./telegram-ingest/02-ingest";

const telegramIngest: TelegramIngestRouter = new Hono<{ Bindings: Env }>();

registerHealthRoutes(telegramIngest);
registerIngestRoutes(telegramIngest);

export default telegramIngest;
