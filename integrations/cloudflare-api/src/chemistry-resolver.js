const PUBCHEM_ORIGIN = "https://pubchem.ncbi.nlm.nih.gov";
const MAX_QUERY_LENGTH = 500;
const UPSTREAM_TIMEOUT_MS = 8_000;

function invalid(query) {
  return { status: 400, body: { query, molecule: null, error: "query must contain 1–500 characters" } };
}

function inputPath(query) {
  const value = query.trim();
  if (/^InChI=/i.test(value)) return `inchi/${encodeURIComponent(value)}`;
  if (/^InChIKey=/i.test(value)) return `inchikey/${encodeURIComponent(value.replace(/^InChIKey=/i, ""))}`;
  if (/^SMILES:/i.test(value)) return `smiles/${encodeURIComponent(value.replace(/^SMILES:/i, ""))}`;
  if (/^cid:[0-9]+$/i.test(value)) return `cid/${encodeURIComponent(value.slice(4))}`;
  return `name/${encodeURIComponent(value)}`;
}

function attachImages(molecule, timestamp) {
  if (!molecule.cid) return molecule;
  const provenance = {
    source: "pubchem",
    sourceId: String(molecule.cid),
    sourceUrl: `${PUBCHEM_ORIGIN}/compound/${molecule.cid}`,
    retrievedAt: timestamp,
    representation: "2d",
    label: `PubChem, CID ${molecule.cid}`,
  };
  const image2d = `${PUBCHEM_ORIGIN}/rest/pug/compound/cid/${molecule.cid}/PNG?image_size=500x500`;
  const image3d = `${PUBCHEM_ORIGIN}/rest/pug/compound/cid/${molecule.cid}/record/SDF?record_type=3d`;
  return {
    ...molecule,
    image2dUrl: molecule.image2dUrl || image2d,
    image3dUrl: molecule.image3dUrl || image3d,
    images: [
      ...(molecule.images || []),
      { kind: "verified", format: "png", url: image2d, representation: "2d", generator: "pubchem", provenance, width: 500, height: 500 },
      { kind: "verified", format: "sdf", url: image3d, representation: "3d", generator: "pubchem", provenance: { ...provenance, representation: "3d", label: `PubChem 3D, CID ${molecule.cid}` } },
    ],
  };
}

export async function resolveChemicalCompound(query, fetcher = fetch, clock = () => new Date()) {
  const value = String(query ?? "").trim();
  if (!value || value.length > MAX_QUERY_LENGTH) return invalid(value);
  const url = `${PUBCHEM_ORIGIN}/rest/pug/compound/${inputPath(value)}/property/Title,MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,InChI,InChIKey/JSON`;
  let response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return { status: 502, body: { query: value, molecule: null, error: "chemical source unavailable" } };
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 404) {
      return { status: 404, body: { query: value, molecule: null, error: "compound not found" } };
    }
    return { status: 502, body: { query: value, molecule: null, error: "chemical source unavailable" } };
  }

  let payload;
  try { payload = await response.json(); }
  catch { return { status: 502, body: { query: value, molecule: null, error: "chemical source unavailable" } }; }
  const record = payload?.PropertyTable?.Properties?.[0];
  const cid = Number(record?.CID);
  if (!Number.isSafeInteger(cid) || cid <= 0) {
    return { status: 404, body: { query: value, molecule: null, error: "compound not found" } };
  }
  const weight = record?.MolecularWeight === undefined || record?.MolecularWeight === null || record?.MolecularWeight === ""
    ? undefined
    : Number(record.MolecularWeight);
  if (weight !== undefined && (!Number.isFinite(weight) || weight <= 0)) {
    return { status: 502, body: { query: value, molecule: null, error: "invalid chemical record" } };
  }

  const timestamp = clock().toISOString();
  const molecule = attachImages({
    name: String(record.Title || value).trim(),
    formula: record.MolecularFormula ? String(record.MolecularFormula) : undefined,
    molecularWeight: weight,
    cid,
    canonicalSmiles: record.CanonicalSMILES ? String(record.CanonicalSMILES) : undefined,
    isomericSmiles: record.IsomericSMILES ? String(record.IsomericSMILES) : undefined,
    inchi: record.InChI ? String(record.InChI) : undefined,
    inchikey: record.InChIKey ? String(record.InChIKey) : undefined,
    provenance: {
      source: "pubchem",
      sourceId: String(cid),
      sourceUrl: `${PUBCHEM_ORIGIN}/compound/${cid}`,
      retrievedAt: timestamp,
      representation: "2d",
      label: `PubChem, CID ${cid}`,
    },
  }, timestamp);
  if (!molecule.name || (!molecule.cid && !molecule.inchikey && !molecule.isomericSmiles)) {
    return { status: 502, body: { query: value, molecule: null, error: "invalid chemical record" } };
  }
  return { status: 200, body: { query: value, molecule } };
}
