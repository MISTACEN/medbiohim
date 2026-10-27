import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { readChemistryResolve } from "../src/lib/chemistry/resolve.ts";

const molecule = {
  name: "Глюкоза",
  formula: "C6H12O6",
  cid: 5793,
  canonicalSmiles: "C(C1C(C(C(C(O1)O)O)O)O)O",
  provenance: { source: "pubchem", label: "PubChem" },
};

test("the Worker envelope {ok,data:{molecule}} is unwrapped", () => {
  const result = readChemistryResolve(true, { ok: true, data: { molecule }, requestId: "abc" });
  assert.equal(result.ok, true);
  assert.equal(result.molecule.name, "Глюкоза");
  assert.equal(result.molecule.cid, 5793);
});

test("a legacy flat {molecule} payload is still accepted", () => {
  const result = readChemistryResolve(true, { molecule });
  assert.equal(result.ok, true);
  assert.equal(result.molecule.formula, "C6H12O6");
});

test("an enveloped error reports its Russian message instead of [object Object]", () => {
  const result = readChemistryResolve(false, {
    ok: false,
    error: { code: "NOT_FOUND", message: "Вещество не найдено" },
    requestId: "abc",
  });
  assert.equal(result.ok, false);
  assert.equal(result.message, "Вещество не найдено");
  assert.doesNotMatch(result.message, /\[object Object\]/);
});

test("an error without a message falls back to its code", () => {
  const result = readChemistryResolve(false, { ok: false, error: { code: "UPSTREAM" } });
  assert.equal(result.ok, false);
  assert.equal(result.message, "UPSTREAM");
});

test("a 200 answer without a molecule is an error, not an empty success", () => {
  const result = readChemistryResolve(true, { ok: true, data: { molecule: null } });
  assert.equal(result.ok, false);
  assert.equal(result.message, "Вещество не найдено");
});

test("a non-JSON body does not leak undefined or object wording into the UI", () => {
  for (const payload of [null, undefined, "<html>502</html>", { ok: false, error: null }]) {
    const result = readChemistryResolve(false, payload);
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0);
    assert.doesNotMatch(result.message, /undefined|\[object/);
  }
});

test("ChemicalFigure reads the envelope through the shared parser", async () => {
  const figure = await fs.readFile(
    new URL("../src/components/chemistry/ChemicalFigure.tsx", import.meta.url),
    "utf8"
  );
  assert.match(figure, /readChemistryResolve\(res\.ok, payload\)/);
  assert.doesNotMatch(figure, /data\.molecule/);
});
