import type { Hono } from "hono";
import type { Env } from "../../env";

export type TelegramIngestRouter = Hono<{ Bindings: Env }>;
