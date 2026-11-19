/**
 * Публичный по замыслу маршрут (каталонный справочник): авторизации нет,
 * защита — rate limit по IP на прокси-вызов PubChem (внешний трафик).
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { clientIp } from "./auth/shared";
import { rateLimit } from "../lib/redis";
import { cached } from "../lib/cache";
import { getRedis } from "../lib/redis";

const chemistry = new Hono<{ Bindings: Env }>();

/** Public-ish resolve via PubChem (no auth required for catalog lookup) */
chemistry.get("/resolve", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `chem:resolve:${ip}`, 30, 60);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMITED", "Слишком много запросов, попробуйте позже", 429, rid);
    return c.json(body, status as 429);
  }
  const query = (c.req.query("query") || "").trim();
  if (!query) {
    const { body, status } = fail("VALIDATION", "Нужен query", 400, rid);
    return c.json(body, status as 400);
  }

  // Одинаковый query -> одинаковый ответ (ADR-0002): экономим внешний вызов
  // PubChem. null кэшируется как «не найдено». Нет Redis - идём напрямую.
  const waitUntil = (() => {
    try { return (task: Promise<unknown>) => c.executionCtx.waitUntil(task); } catch { return undefined; }
  })();
  try {
    const molecule = await cached("chem:resolve", { query: query.toLowerCase() }, async () => {
      const searchUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/property/MolecularFormula,MolecularWeight,ConnectivitySMILES,IsomericSMILES,IUPACName,Title/JSON`;
      const res = await fetch(searchUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        PropertyTable?: { Properties?: Record<string, unknown>[] };
      };
      const prop = json.PropertyTable?.Properties?.[0];
      if (!prop) return null;
      const cid = prop.CID;
      return {
        cid,
        name: prop.Title || prop.IUPACName || query,
        formula: prop.MolecularFormula,
        molecularWeight: prop.MolecularWeight == null ? undefined : Number(prop.MolecularWeight),
        canonicalSmiles: prop.ConnectivitySMILES || prop.CanonicalSMILES,
        isomericSmiles: prop.IsomericSMILES || prop.CanonicalSMILES,
        image2dUrl: cid ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG` : undefined,
        image3dUrl: cid ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d` : undefined,
        provenance: {
          source: "pubchem",
          sourceId: cid == null ? undefined : String(cid),
          sourceUrl: cid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}` : undefined,
          retrievedAt: new Date().toISOString(),
          representation: "2d",
          label: "PubChem",
        },
      };
    }, { store: getRedis(c.env), waitUntil });
    if (!molecule) {
      const { body, status } = fail("NOT_FOUND", "Вещество не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ molecule }, rid));
  } catch {
    const { body, status } = fail("UPSTREAM", "PubChem недоступен", 502, rid);
    return c.json(body, status as 502);
  }
});

export default chemistry;
