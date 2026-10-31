import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const modelSource = await readFile(new URL("../src/lib/attestation.ts", import.meta.url), "utf8");
const publicRoute = await readFile(new URL("../src/routes/attestations.ts", import.meta.url), "utf8");
const adminRoute = await readFile(new URL("../src/routes/admin-attestations.ts", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
// D5: клиент API разложен на модули — контрактные тесты читают всю поверхность.
const apiClient = await (async () => {
  const { readdir } = await import("node:fs/promises");
  const dir = new URL("../../../src/lib/api/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".ts"));
  const parts = [await readFile(new URL("../../../src/lib/api.ts", import.meta.url), "utf8")];
  for (const name of files) {
    parts.push(await readFile(new URL(`../../../src/lib/api/${name}`, import.meta.url), "utf8"));
  }
  return parts.join("\n");
})();

const subjectPage = await readFile(new URL("../../../src/app/subjects/[id]/page.tsx", import.meta.url), "utf8");
const runnerPage = await readFile(new URL("../../../src/app/subjects/[id]/attestations/[slug]/page.tsx", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../../../src/app/admin/attestations/page.tsx", import.meta.url), "utf8");

test("attestation model supports the five attestation types and three item kinds", () => {
  for (const type of ["colloquium", "exam", "credit", "test", "control"]) {
    assert.ok(modelSource.includes(`"${type}"`), `missing type ${type}`);
  }
  for (const kind of ["theory", "test", "task"]) {
    assert.ok(modelSource.includes(`"${kind}"`), `missing item kind ${kind}`);
  }
  assert.ok(modelSource.includes("export function normalizeAttestation"));
  assert.ok(modelSource.includes("export function summarizeAttestation"));
  assert.ok(modelSource.includes("export function attestationAvailable"));
  assert.ok(modelSource.includes("attestation:${subject}:${slug}"));
});

test("model validation rejects malformed documents and bounded fields", () => {
  assert.ok(modelSource.includes("if (!slug || !SLUG.test(slug))"));
  assert.ok(modelSource.includes("if (!title) return { error"));
  assert.ok(modelSource.includes("if (options.length < 2)"));
  assert.ok(modelSource.includes("!correct.length || correct.some"));
  assert.ok(modelSource.includes("Не более 300 материалов") || modelSource.includes("300"));
  assert.ok(modelSource.includes("passScoreRaw < 0 || passScoreRaw > 100"));
  assert.ok(modelSource.includes("course < 1 || course > 6"));
});

test("public attestation routes expose only published, available documents", () => {
  assert.ok(publicRoute.includes('requireAuth'));
  assert.ok(publicRoute.includes('like("key", "attestation:%")'));
  assert.ok(publicRoute.includes("value.is_published && attestationAvailable(value, now)"));
  assert.ok(publicRoute.includes("attestationAvailable(value)"));
  assert.ok(publicRoute.includes("createServiceClient(c.env) || c.get(\"supabase\")"));
  assert.ok(publicRoute.includes('fail("NOT_FOUND"'));
  assert.ok(publicRoute.includes('fail("NOT_AVAILABLE"'));
});

test("admin attestation routes are role-gated and write through site_content", () => {
  assert.ok(adminRoute.includes('const MANAGERS = ["admin", "moderator", "teacher"]'));
  assert.ok(adminRoute.includes('from("user_roles")'));
  assert.ok(adminRoute.includes('adminAttestations.put("/attestations/:subject/:slug"'));
  assert.ok(adminRoute.includes('adminAttestations.delete("/attestations/:subject/:slug"'));
  assert.ok(adminRoute.includes('upsert('));
  assert.ok(adminRoute.includes('onConflict: "key"'));
  assert.ok(adminRoute.includes("normalizeAttestation"));
  assert.ok(adminRoute.includes('FORBIDDEN'));
});

test("worker mounts attestation routes on /api/v1/attestations and /api/v1/admin", () => {
  assert.ok(indexSource.includes('import attestations from "./routes/attestations"'));
  assert.ok(indexSource.includes('import adminAttestations from "./routes/admin-attestations"'));
  assert.ok(indexSource.includes('v1.route("/attestations", attestations)'));
  assert.ok(indexSource.includes('v1.route("/admin", adminAttestations)'));
});

test("frontend exposes attestation API client and subject tab", () => {
  assert.ok(apiClient.includes("export async function listAttestations"));
  assert.ok(apiClient.includes("export async function getAttestation"));
  assert.ok(apiClient.includes("export async function adminSaveAttestation"));
  assert.ok(apiClient.includes("export async function adminDeleteAttestation"));
  assert.ok(subjectPage.includes('"attestations"'));
  assert.ok(subjectPage.includes("AttestationList"));
  assert.ok(runnerPage.includes("AttestationRunner"));
  assert.ok(adminPage.includes("adminSaveAttestation"));
  assert.ok(adminPage.includes("draft.stages.map"));
});
