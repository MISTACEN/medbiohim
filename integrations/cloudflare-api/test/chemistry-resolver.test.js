import test from "node:test";
import assert from "node:assert/strict";
import { resolveChemicalCompound } from "../src/chemistry-resolver.js";

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { "content-type": "application/json" },
});

test("chemistry resolver rejects empty and overlong queries before network access", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; throw new Error("unexpected network call"); };
  assert.equal((await resolveChemicalCompound("   ", fetcher)).status, 400);
  assert.equal((await resolveChemicalCompound("x".repeat(501), fetcher)).status, 400);
  assert.equal(calls, 0);
});

test("chemistry resolver returns PubChem metadata and verified 2D/3D source descriptors", async () => {
  let requested = "";
  const result = await resolveChemicalCompound("glucose", async (url, init) => {
    requested = String(url);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.match(init.headers.accept, /application\/json/);
    return jsonResponse({ PropertyTable: { Properties: [{
      CID: 5793, Title: "D-Glucose", MolecularFormula: "C6H12O6", MolecularWeight: "180.16",
      CanonicalSMILES: "C(C1C(C(C(C(O1)O)O)O)O)O", IsomericSMILES: "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O",
      InChI: "InChI=1S/C6H12O6", InChIKey: "WQZGKKKJIJFFOK",
    }] } });
  }, () => new Date("2026-10-14T00:00:00.000Z"));
  assert.equal(result.status, 200);
  assert.match(requested, /^https:\/\/pubchem\.ncbi\.nlm\.nih\.gov\/rest\/pug\/compound\/name\/glucose\//);
  assert.equal(result.body.molecule.name, "D-Glucose");
  assert.equal(result.body.molecule.formula, "C6H12O6");
  assert.equal(result.body.molecule.cid, 5793);
  assert.equal(result.body.molecule.molecularWeight, 180.16);
  assert.equal(result.body.molecule.image2dUrl, "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/5793/PNG?image_size=500x500");
  assert.match(result.body.molecule.image3dUrl, /record\/SDF\?record_type=3d$/);
  assert.equal(result.body.molecule.images.length, 2);
  assert.equal(result.body.molecule.provenance.label, "PubChem, CID 5793");
  assert.equal(result.body.molecule.provenance.retrievedAt, "2026-10-14T00:00:00.000Z");
});

test("chemistry resolver supports SMILES and InChIKey identifiers", async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(String(url));
    return jsonResponse({ PropertyTable: { Properties: [{ CID: 241, Title: "Benzene", MolecularFormula: "C6H6", IsomericSMILES: "c1ccccc1" }] } });
  };
  assert.equal((await resolveChemicalCompound("SMILES:c1ccccc1", fetcher)).status, 200);
  assert.match(urls[0], /compound\/smiles\/c1ccccc1\//);
  assert.equal((await resolveChemicalCompound("InChIKey=UHOVQNZJYSORNB-UHFFFAOYSA-N", fetcher)).status, 200);
  assert.match(urls[1], /compound\/inchikey\/UHOVQNZJYSORNB-UHFFFAOYSA-N\//);
});

test("chemistry resolver maps missing compounds and upstream errors to stable contracts", async () => {
  const missing = await resolveChemicalCompound("no such molecule", async () => jsonResponse({ Fault: {} }, 404));
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "compound not found");
  const upstream = await resolveChemicalCompound("glucose", async () => jsonResponse({}, 503));
  assert.equal(upstream.status, 502);
  assert.equal(upstream.body.error, "chemical source unavailable");
  const network = await resolveChemicalCompound("glucose", async () => { throw new Error("private upstream details"); });
  assert.equal(network.status, 502);
  assert.equal(network.body.error, "chemical source unavailable");
});

test("chemistry resolver rejects malformed molecule records", async () => {
  const result = await resolveChemicalCompound("glucose", async () => jsonResponse({
    PropertyTable: { Properties: [{ CID: 123, Title: "Bad record", MolecularWeight: "-1" }] },
  }));
  assert.equal(result.status, 502);
  assert.equal(result.body.molecule, null);
  assert.equal(result.body.error, "invalid chemical record");
});
