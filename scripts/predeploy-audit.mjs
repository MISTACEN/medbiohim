import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
let failures = 0;
let warnings = 0;

const pass = (m) => console.log("[PASS] " + m);
const warn = (m) => { warnings++; console.log("[WARN] " + m); };
const fail = (m) => { failures++; console.error("[FAIL] " + m); };

function run(command, args, label) {
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (r.status === 0) pass(label);
  else fail(label + " (exit " + (r.status ?? "unknown") + ")");
  return r.status === 0;
}

async function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "dist", "out"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}

console.log("MEDBIOHIM PRE-DEPLOY AUDIT");
console.log("==========================");

for (const required of [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "src/app/api/v1/[...path]/route.ts",
  "backend",
  "backend/tests/TrainingPayloadSanitizerTest.php",
  ".env.example"
]) {
  if (existsSync(join(root, required))) pass("required: " + required);
  else fail("missing required path: " + required);
}

if (!existsSync(join(root, "package-lock.json"))) {
  warn("package-lock.json is not tracked/present; npm/Vercel resolve dependency ranges instead of a locked tree");
}

if (!existsSync(join(root, "eslint.config.js")) &&
    !existsSync(join(root, "eslint.config.mjs")) &&
    !existsSync(join(root, "eslint.config.cjs"))) {
  warn("no ESLint flat-config file found; npm run lint may not be usable with ESLint 9");
}

const sourceFiles = await walk(join(root, "src"));
const backendFiles = await walk(join(root, "backend"));
const codeFiles = [...sourceFiles, ...backendFiles].filter((x) =>
  [".ts", ".tsx", ".js", ".jsx", ".php"].includes(extname(x))
);

const escaped = [];
for (const file of codeFiles) {
  const text = await readFile(file, "utf8");
  if (/\\n\\s*(async|const|let|var|return|export|import|function|if|for|while|class|type|interface|<)/.test(text)) {
    escaped.push(relative(root, file));
  }
}
if (escaped.length) fail("literal escaped-newline source artifacts: " + escaped.join(", "));
else pass("no literal escaped-newline source artifacts");

const proxyPath = join(root, "src/app/api/v1/[...path]/route.ts");
if (existsSync(proxyPath)) {
  const proxy = await readFile(proxyPath, "utf8");
  if (proxy.includes("SPACEWEB_API_ORIGIN")) pass("Vercel -> SpaceWeb proxy contract present");
  else fail("SPACEWEB_API_ORIGIN is not referenced by the Vercel API proxy");
}

const apiClientPath = join(root, "src/lib/api.ts");
if (existsSync(apiClientPath)) {
  const apiClient = await readFile(apiClientPath, "utf8");
  if (apiClient.includes("const userScope = cacheUserScope();") &&
      apiClient.includes("if (userScope === null) return api<T>(path, options);") &&
      apiClient.includes("Never share a cache bucket between opaque/malformed tokens")) {
    pass("API cache bypasses malformed/opaque token scopes");
  } else {
    fail("API cache may share a cache scope for malformed/opaque tokens");
  }
}

const privateMediaCacheContract = apiClientPath;
if (existsSync(privateMediaCacheContract)) {
  const apiClient = await readFile(privateMediaCacheContract, "utf8");
  if (apiClient.includes('meta.mode!=="presigned"') &&
      apiClient.includes("function clearUserScopedCaches()") &&
      apiClient.includes("trainerImageCache.clear()") &&
      apiClient.includes("materialFileCache.clear()") &&
      apiClient.includes("trainerCardCache.clear()") &&
      apiClient.includes("cache: \"no-store\"")) {
    pass("private trainer/material caches are user-scoped and signed URLs are not cached");
  } else {
    fail("private media cache isolation or presigned URL expiry guard is missing");
  }
}

const contentIntegrationPath = join(root, "backend/config/routes/content_integration.php");
if (existsSync(contentIntegrationPath)) {
  const contentRoutes = await readFile(contentIntegrationPath, "utf8");
  if (contentRoutes.includes("subjectSlug === 'histology'") &&
      contentRoutes.includes("is_histology_source") &&
      contentRoutes.includes("$filterMaterialsForUser") &&
      contentRoutes.split("use ($filterMaterialsForUser)").length - 1 === 2) {
    pass("materials lists/details and content source downloads enforce MBH scope");
  } else {
    fail("materials/content-source MBH access checks are incomplete");
  }
}

const fileRoutesPath = join(root, "backend/config/routes/files.php");
const fileRepositoryPath = join(root, "backend/src/Repositories/FileRepository.php");
if (existsSync(fileRoutesPath) && existsSync(fileRepositoryPath)) {
  const fileRoutes = await readFile(fileRoutesPath, "utf8");
  const fileRepository = await readFile(fileRepositoryPath, "utf8");
  if (fileRoutes.includes("$requiredSpecialtyForFile") && fileRepository.includes("is_histology_material")) {
    pass("file download metadata carries histology access scope");
  } else {
    fail("file downloads may miss histology access scope when specialty_slug is empty");
  }
}

const appFiles = await walk(join(root, "src/app"));
const compatHits = [];
for (const file of appFiles.filter((x) => [".ts", ".tsx", ".js", ".jsx"].includes(extname(x)))) {
  const text = await readFile(file, "utf8");
  if (text.includes("/api-compat/")) compatHits.push(relative(root, file));
}
if (compatHits.length) fail("retired /api-compat calls remain in frontend: " + compatHits.join(", "));
else pass("no retired /api-compat calls in frontend");

const viewerPath = join(root, "src/components/media/ImageLightbox.tsx");
if (existsSync(viewerPath)) {
  const text = await readFile(viewerPath, "utf8");
  if (text.includes("createPortal") && text.includes("document.body")) {
    pass("media viewer is portaled to document.body");
  } else {
    fail("media viewer is not using a body portal; mobile/embedded stacking contexts may constrain the viewport");
  }
}

const materialViewerPath = join(root, "backend/config/routes/material_viewer.php");
if (existsSync(materialViewerPath)) {
  const text = await readFile(materialViewerPath, "utf8");
  if (text.includes("public.files") && text.includes("presignedDownloadUrl")) {
    pass("materials viewer supports canonical uploaded files/B2");
  } else {
    fail("materials viewer does not support canonical uploaded files/B2");
  }
  if (text.includes("subjectSlug === 'histology'") && text.includes("$requiredSpecialty")) {
    pass("histology materials are gated by MBH membership even if specialty_slug is empty");
  } else {
    fail("histology material routes may not enforce MBH membership consistently");
  }
}

const proxyPathForHeaders = join(root, "src/app/api/v1/[...path]/route.ts");
if (existsSync(proxyPathForHeaders)) {
  const text = await readFile(proxyPathForHeaders, "utf8");
  if (text.includes('"location"')) pass("Vercel API proxy preserves backend redirects");
  else fail("Vercel API proxy does not preserve backend Location redirects");
}

const malformedImports = [];
for (const file of backendFiles.filter((x) => extname(x) === ".php")) {
  const text = await readFile(file, "utf8");
  if (/use Medbiohim(?:Http|Database|Services|Middleware|Repositories|Support|Auth)(?!\\)/.test(text)) malformedImports.push(relative(root, file));
}
if (malformedImports.length) fail("malformed Medbiohim namespace imports: " + malformedImports.join(", "));
else pass("backend namespace imports look valid");

// Namespaced PHP files must qualify built-in exception classes. An unqualified
// RuntimeException/InvalidArgumentException/Throwable resolves to the current
// namespace and can fail only when that branch is executed, so syntax checks
// alone do not catch it.
const namespaceExceptionHits = [];
for (const file of backendFiles.filter((x) => extname(x) === ".php")) {
  const text = await readFile(file, "utf8");
  if (!/namespace\s+[^;]+;/.test(text)) continue;
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const stripped = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (/\b(?:new\s+|catch\s*\(\s*|extends\s+)\b/.test(stripped) &&
        /\b(RuntimeException|InvalidArgumentException|Throwable|PDOException|LogicException|ErrorException)\b/.test(stripped) &&
        !/\\(?:RuntimeException|InvalidArgumentException|Throwable|PDOException|LogicException|ErrorException)\b/.test(stripped)) {
      namespaceExceptionHits.push(relative(root, file) + ":" + (index + 1));
    }
  });
}
if (namespaceExceptionHits.length) fail("unqualified PHP exception classes in namespaced files: " + namespaceExceptionHits.join(", "));
else pass("namespaced PHP exception classes are qualified");

const exposedDebugRoutes = [];
const platformPath = join(root, "backend/config/routes/platform.php");
if (existsSync(platformPath)) {
  const text = await readFile(platformPath, "utf8");
  if (text.includes("/api/v1/debug/ping") || text.includes("/api/v1/debug/dashboard-probe")) exposedDebugRoutes.push("backend/config/routes/platform.php");
}
if (exposedDebugRoutes.length) fail("production debug endpoints remain: " + exposedDebugRoutes.join(", "));
else pass("no unauthenticated production debug routes");

const homeworkPage = join(root, "src/app/homework/page.tsx");
if (existsSync(homeworkPage)) {
  const text = await readFile(homeworkPage, "utf8");
  if (text.includes("@/lib/mock-data")) fail("production homework page still imports mock-data");
  else pass("homework page uses API-only data");
}

const retiredPaths = [
  "frontend",
  "spaceweb_upload",
  "src/lib/mock-data.ts",
  "src/components/ui/Sparkline.tsx",
  "src/lib/chemistry/fixtures.ts",
  "backend/src/Services/QuestionBank.php",
];
for (const retired of retiredPaths) {
  if (existsSync(join(root, retired))) fail("retired artifact remains: " + retired);
}
if (!retiredPaths.some((p) => existsSync(join(root, p)))) pass("retired mock/shadow artifacts removed");

if (existsSync(join(root, "api/index.php"))) {
  fail("legacy root api/index.php exists; architecture expects Next proxy -> SpaceWeb");
} else {
  pass("no legacy root api/index.php");
}

console.log("\nProduction compilation:");
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "typecheck"], "TypeScript");
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], "Next.js production build");

const php = spawnSync("php", ["-v"], {
  cwd: root,
  stdio: "ignore",
  shell: process.platform === "win32"
});

if (php.status === 0) {
  let phpOk = true;
  const phpFiles = backendFiles.filter((x) => extname(x) === ".php");
  for (const file of phpFiles) {
    const r = spawnSync("php", ["-l", file], {
      cwd: root,
      stdio: "pipe",
      shell: process.platform === "win32",
      encoding: "utf8"
    });
    if (r.status !== 0) {
      phpOk = false;
      fail("PHP syntax: " + relative(root, file) + "\n" + (r.stdout || "") + (r.stderr || ""));
    }
  }
  if (phpOk) pass("PHP syntax (" + phpFiles.length + " files)");
  if (existsSync(join(root, "backend/tests/TrainingPayloadSanitizerTest.php"))) {
    run("php", ["backend/tests/TrainingPayloadSanitizerTest.php"], "TrainingPayloadSanitizer regression tests");
  } else {
    fail("missing TrainingPayloadSanitizer regression test");
  }
} else {
  warn("PHP CLI is not installed locally; backend syntax check must run in CI/SpaceWeb");
}

console.log("\n==========================");
console.log("FAIL: " + failures + "  WARN: " + warnings);

if (failures) {
  console.error("DEPLOY STATUS: BLOCKED");
  process.exit(1);
}

console.log(warnings ? "DEPLOY STATUS: PASS WITH WARNINGS" : "DEPLOY STATUS: PASS");
