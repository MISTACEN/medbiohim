import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";

const chemistry = new Hono<{ Bindings: Env }>();

/** Public-ish resolve via PubChem (no auth required for catalog lookup) */
chemistry.get("/resolve", async (c) => {
  const rid = requestId();
  const query = (c.req.query("query") || "").trim();
  if (!query) {
    const { body, status } = fail("VALIDATION", "Нужен query", 400, rid);
    return c.json(body, status as 400);
  }

  try {
    const searchUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IUPACName,Title/JSON`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const { body, status } = fail("NOT_FOUND", "Вещество не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    const json = (await res.json()) as {
      PropertyTable?: { Properties?: Record<string, unknown>[] };
    };
    const prop = json.PropertyTable?.Properties?.[0];
    if (!prop) {
      const { body, status } = fail("NOT_FOUND", "Вещество не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    const cid = prop.CID;
    return c.json(
      ok(
        {
          molecule: {
            cid,
            name: prop.Title || prop.IUPACName || query,
            formula: prop.MolecularFormula,
            weight: prop.MolecularWeight,
            smiles: prop.CanonicalSMILES,
            iupac: prop.IUPACName,
            image: cid
              ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG`
              : null,
          },
        },
        rid
      )
    );
  } catch {
    const { body, status } = fail("UPSTREAM", "PubChem недоступен", 502, rid);
    return c.json(body, status as 502);
  }
});

export default chemistry;
