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
  "backend/tests/SupabaseAuthRoleTest.php",
  ".env.example"
]) {
  if (existsSync(join(root, required))) pass("required: " + required);
  else fail("missing required path: " + required);
}

if (!existsSync(join(root, "package-lock.json"))) {
  warn("package-lock.json is not tracked/present; npm/Vercel resolve dependency ranges instead of a locked tree");
}

const eslintConfigPath = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs"
].map((name) => join(root, name)).find((path) => existsSync(path));

if (!eslintConfigPath) {
  warn("no ESLint flat-config file found; npm run lint may not be usable with ESLint 9");
} else {
  const eslintConfig = await readFile(eslintConfigPath, "utf8");
  const hasRulesOrPresets =
    /\brules\s*:/m.test(eslintConfig) ||
    /eslint-config-next|next\/core-web-vitals|@typescript-eslint|recommended/i.test(eslintConfig);
  if (hasRulesOrPresets) {
    pass("ESLint config declares rules or a recognized preset");
  } else {
    warn("ESLint config contains no recognizable rules/preset; npm run lint may pass without meaningful code analysis");
  }
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

const subjectAccessPath = join(root, "backend/src/Services/SpecialtyAccess.php");
const academicContextPath = join(root, "backend/src/Services/AcademicContextResolver.php");
const domainRoutesPath = join(root, "backend/config/routes/domain.php");
const subjectRepositoryPath = join(root, "backend/src/Repositories/SubjectRepository.php");
const supabaseRestPath = join(root, "backend/src/Services/SupabaseRest.php");
if ([subjectAccessPath, academicContextPath, domainRoutesPath, subjectRepositoryPath, supabaseRestPath].every(existsSync)) {
  const subjectAccess = await readFile(subjectAccessPath, "utf8");
  const academicContext = await readFile(academicContextPath, "utf8");
  const domainRoutes = await readFile(domainRoutesPath, "utf8");
  const subjectRepository = await readFile(subjectRepositoryPath, "utf8");
  const supabaseRest = await readFile(supabaseRestPath, "utf8");
  if (subjectAccess.includes("subjectSlug === 'histology'") &&
      subjectAccess.includes("is_active = true") &&
      (academicContext.match(/COALESCE\(subjects\.slug, ''\) <> 'histology'/g) || []).length >= 2 &&
      domainRoutes.includes("$filterSubjects") &&
      domainRoutes.includes("canAccessSubject($req->user->id, $subjectId)") &&
      subjectRepository.includes("WHERE is_active = true") &&
      supabaseRest.includes("select=id,slug,name,specialty_slug,course_number")) {
    pass("histology subject, gradebook and academic-context access is MBH-scoped");
  } else {
    fail("subject list/fallback, gradebook or academic-context MBH guard is incomplete");
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

if (existsSync(proxyPathForHeaders)) {
  const text = await readFile(proxyPathForHeaders, "utf8");
  const fallbackIndex = text.indexOf('if (upstream?.status === 404 && sub.startsWith("trainers/feed"))');
  const primaryProxyIndex = Math.max(
    text.indexOf('const spacewebTargets = UPSTREAM ? ['),
    text.indexOf('const targets = [')
  );
  if (fallbackIndex >= 0 && primaryProxyIndex >= 0 && fallbackIndex > primaryProxyIndex &&
      !text.includes('if (sub.startsWith("trainers/feed")) {')) {
    pass("trainer compatibility fallback runs only after the PHP upstream returns 404");
  } else {
    fail("trainer compatibility fallback may bypass the PHP upstream");
  }
  if (text.includes('out.headers.set("cache-control", "private, no-store")')) {
    pass("authenticated trainer image proxy disables browser caching");
  } else {
    fail("authenticated trainer image proxy may cache private media");
  }
  if (text.includes('message: "Backend is temporarily unavailable"') &&
      !text.includes('message: msg')) {
    pass("proxy 502 response does not expose raw upstream exception messages");
  } else {
    fail("proxy 502 response may expose internal upstream exception details");
  }

  if (text.includes('process.env.CLOUDFLARE_API_ORIGIN') &&
      text.includes('process.env.MEDBIOHIM_CF_FIRST === "true"') &&
      text.includes('shouldFallbackFromCloudflare') &&
      text.includes('isHttpsOrigin(UPSTREAM)')) {
    pass("Cloudflare-first mode is opt-in and only uses HTTPS SpaceWeb fallback");
  } else {
    fail("Cloudflare-first fallback lacks an explicit opt-in or HTTPS guard");
  }

  if (text.includes('async function isCanonicalAdminRequest') &&
      text.includes('select", "roles(code)"') &&
      text.includes('x-mbh-transport-diagnostics') &&
      text.includes('x-mbh-transport-source')) {
    pass("transport diagnostics require a canonical database admin-role check");
  } else {
    fail("transport diagnostics may be exposed without canonical admin verification");
  }

  if (text.includes('path === "/api/v1/files/upload" && code === "STORAGE_NOT_CONFIGURED"') &&
      text.includes('shouldFallbackFromCloudflare') &&
      text.includes('Never retry generic mutation failures')) {
    pass("file upload can fall back only for an explicit pre-write storage configuration gate");
  } else {
    fail("file upload fallback is not restricted to a known pre-write failure");
  }
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

const cloudflareWorkerRoot = join(root, "integrations/cloudflare-api");
const cloudflareWorkerEntry = join(cloudflareWorkerRoot, "src/index.js");
if (existsSync(cloudflareWorkerEntry)) {
  const workerSource = await readFile(cloudflareWorkerEntry, "utf8");
  const importPattern = /^import\s+.+?\s+from\s+["'](\.[^"']+)["'];?\s*$/gm;
  const missingWorkerImports = [];
  for (const match of workerSource.matchAll(importPattern)) {
    const specifier = match[1];
    const candidates = [specifier, specifier + ".js", join(specifier, "index.js")];
    if (!candidates.some((candidate) => existsSync(join(cloudflareWorkerRoot, "src", candidate)))) {
      missingWorkerImports.push(specifier);
    }
  }
  if (missingWorkerImports.length) {
    fail("Cloudflare Worker imports missing from source bundle: " + missingWorkerImports.join(", "));
  } else {
    pass("Cloudflare Worker entry imports resolve to checked-in source modules");
  }
  const workerPackage = join(cloudflareWorkerRoot, "package.json");
  const workerTests = join(cloudflareWorkerRoot, "test/index.test.js");
  if (existsSync(workerPackage) && existsSync(workerTests)) {
    const packageText = await readFile(workerPackage, "utf8");
    if (packageText.includes('"test"') && packageText.includes('node --test')) {
      pass("Cloudflare Worker has a Node test command and router tests");
    } else {
      fail("Cloudflare Worker package is missing its node test command");
    }
  } else {
    fail("Cloudflare Worker package or router test entry is missing");
  }
} else {
  fail("Cloudflare Worker entry module is missing");
}

const routeFiles = (await walk(join(root, "backend/config/routes"))).filter((p) => extname(p) === ".php");
const routeRegistry = new Map();
let duplicateRouteFound = false;
const routePattern = /\$[A-Za-z_]\w*->(get|post|put|patch|delete)\(\s*(['"])([^'"]+)\2/g;
for (const file of routeFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(routePattern)) {
    const key = match[1].toUpperCase() + " " + match[3];
    const previous = routeRegistry.get(key);
    if (previous) {
      fail("duplicate route " + key + " in " + relative(root, previous) + " and " + relative(root, file));
      duplicateRouteFound = true;
    } else {
      routeRegistry.set(key, file);
    }
  }
}
if (!duplicateRouteFound) pass("no duplicate PHP HTTP route registrations (" + routeRegistry.size + " routes)");


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

const authPath = join(root, "backend/src/Services/SupabaseAuth.php");
const requireRolePath = join(root, "backend/src/Middleware/RequireRole.php");
const requestPath = join(root, "backend/src/Http/Request.php");
const bootstrapPath = join(root, "backend/src/Bootstrap.php");
if ([authPath, requireRolePath, requestPath, bootstrapPath].every(existsSync)) {
  const auth = await readFile(authPath, "utf8");
  const requireRole = await readFile(requireRolePath, "utf8");
  const request = await readFile(requestPath, "utf8");
  const bootstrap = await readFile(bootstrapPath, "utf8");
  if (auth.includes("trustedRoleFromUserPayload") &&
      !auth.includes("$j['user_metadata']['role']") &&
      !auth.includes("$meta['role'] ?? null")) {
    pass("Supabase user-editable metadata cannot grant backend roles");
  } else {
    fail("auth role extraction trusts user-editable metadata");
  }
  if (requireRole.includes("roleCodesForUser") &&
      !requireRole.includes("$jwtRole !== null && in_array")) {
    pass("privileged role checks use canonical database roles");
  } else {
    fail("privileged role checks may trust stale token claims");
  }
  if (!request.includes("$this->query['access_token']")) {
    pass("bearer access tokens are not accepted from query strings");
  } else {
    fail("bearer access tokens are accepted from query strings");
  }
  if (bootstrap.includes("$msg = 'Внутренняя ошибка сервера'") &&
      !bootstrap.includes("$e::class . ': ' . $e->getMessage()")) {
    pass("uncaught exceptions are logged server-side and hidden from clients");
  } else {
    fail("uncaught exceptions may expose internal details to clients");
  }
}

const contentRoutesPath = join(root, "backend/config/routes/content_integration.php");
const materialViewerPath = join(root, "backend/config/routes/material_viewer.php");
if ([contentRoutesPath, materialViewerPath].every(existsSync)) {
  const contentRoutes = await readFile(contentRoutesPath, "utf8");
  const materialViewer = await readFile(materialViewerPath, "utf8");
  if (!contentRoutes.includes("Response::error('CONTENT_ERROR', $e->getMessage()") &&
      !materialViewer.includes("Response::error('CONTENT_ERROR', $e->getMessage()")) {
    pass("content/material failures do not leak raw database errors");
  } else {
    fail("content/material failures expose raw exception messages");
  }
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
  if (existsSync(join(root, "backend/tests/SupabaseAuthRoleTest.php"))) {
    run("php", ["backend/tests/SupabaseAuthRoleTest.php"], "Supabase trusted-role regression tests");
  } else {
    fail("missing Supabase trusted-role regression test");
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
