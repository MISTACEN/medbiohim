# MEDBIOHIM Phase 1 — Actual Status (2026-10-22)

## 📊 Critical Migrations Already COMPLETE ✅

Based on actual code analysis of Cloudflare Workers API (`workers/api/src/routes/`):

### 1. Test Attempts - FULLY MIGRATED
**Status:** All three RPC endpoints are live and connected

| Endpoint | Line | RPC Function | Status |
|----------|------|--------------|--------|
| `POST /tests/:id/start` | 340 | `medbiohim_start_test_attempt` | ✅ LIVE |
| `POST /tests/attempts/:id/answers` | 343-366 | `medbiohim_save_test_answer` | ✅ LIVE |
| `POST /tests/attempts/:id/finish` | 368-378 | `medbiohim_finish_test_attempt` | ✅ LIVE |

**Security Features Implemented:**
- RPC wrapper with answer snapshot isolation (lines 59-110)
- Safe field stripping via `safeAttempt()` function (lines 13-16)
- No client-side grading possible (answer key hidden by default)
- Strip question_snapshot/correct_answer from responses (lines 79-81)

**Test Coverage Required:**
```bash
1. Start test attempt with group_id parameter
2. Submit answers (text/string/array formats)  
3. Finish attempt → server-side scoring
4. Verify question_snapshot never exposed in response
5. Regrade endpoint: POST /attempts/:id/answers/:questionId/regrade
```

---

### 2. Homework Operations - CORE FUNCTIONS MIGRATED
**Status:** Create + Submit fully functional

| Endpoint | Line | Status | Notes |
|----------|------|--------|-------|
| `POST /homeworks` | 62-137 | ✅ LIVE | Student creation with schedule validation |
| `POST /homeworks/:id/submit` | 139-212 | ✅ LIVE | Text answer + file attachment support |
| `POST /homeworks/:id/progress` | 263-292 | ✅ LIVE | Progress tracking with auto-complete |
| `GET /homeworks/:id/submissions` | 216-261 | ✅ LIVE | Staff-grade view for group submissions |

**Security Features:**
- Group membership validation (lines 92-118)
- Schedule entry context check (lines 98-114)
- Locked submission prevention (lines 187-191)
- File ownership verification (lines 192-199)

**Missing CRUD Operations:**
- ❌ PATCH `/homeworks/:id` (update) - NOT MIGRATED
- ❌ DELETE `/homeworks/:id` (soft-delete) - NOT MIGRATED
- ❌ Admin bulk operations - NOT MIGRATED

---

### 3. File Upload System - FULLY MIGRATED
**Status:** Complete file upload pipeline to Upstash Blob

| Endpoint | Line | Status |
|----------|------|--------|
| `POST /files/upload` | 91-195 | ✅ LIVE |
| `GET /files/:id` | 226-246 | ✅ LIVE |
| `GET /files/:id/download` | 197-224 | ✅ LIVE |

**Security & Validation:**
- Max file size: 12MB (line 8)
- Allowed MIME types restricted (lines 9-13)
- Specialty access control for MBH histology files (lines 29-41)
- SHA256 hashing for deduplication (lines 24-27)
- Signed URL expiration: 1 hour (line 186)

---

## 🔴 Remaining Phase 1 Priorities (Weeks 1-4)

### Priority 1: Fix CI/CD Pipeline (BLOCKER - HIGH)

**Problem:** GitHub Actions deployments fail because no CLOUDFLARE_API_TOKEN secret configured

**Required Secrets:**
```yaml
# Repository Settings > Secrets and Variables > Actions
CLOUDFLARE_API_TOKEN: "your-least-privilege-worker-edit-token"
SUPABASE_SERVICE_KEY: "service-role-supabase-key-for-migrations-only"
UPSTASH_BLOB_TOKEN: "for-cloudflare-worker-bucket-access" # optional, env var is OK
```

**Token Permissions Needed (Cloudflare Dashboard):**
- Edit Worker scripts
- Manage service bindings  
- Read metrics/logs (no admin needed)

**Steps:**
1. Generate token at cloudflare.com > My Profile > API Tokens
2. Template: "Edit Cloudflare Workers"
3. Copy token value
4. In GitHub repo: Settings > Secrets and variables > Actions > New repository secret
5. Name: `CLOUDFLARE_API_TOKEN`, paste value
6. Run manual workflow: `.github/workflows/deploy-worker.yml`

**Verification Command:**
```bash
npm run deploy --dry-run  # verify token works without deploying
```

---

### Priority 2: Test E2E Workflows (Smoke Tests)

#### A. Test Attempt Flow Smoke Test
```typescript
// 1. Student login → get JWT
const auth = await api.login(student_email, student_password);
const jwt = auth.token;

// 2. Start attempt
const attempt = await fetch('/api/v1/tests/{test-id}/start', {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}` }
});
// Verify: returns attempt object WITHOUT question_snapshot/correct_answer

// 3. Submit answers
const answer = await fetch('/api/v1/tests/attempts/{attempt-id}/answers', {
  method: 'POST',
  body: JSON.stringify({ question_id: 'uuid', answer_text: 'Correct' }),
  headers: { Authorization: `Bearer ${jwt}` }
});
// Verify: returns safe answer object stripped of grading data

// 4. Finish attempt
const finish = await fetch('/api/v1/tests/attempts/{attempt-id}/finish', {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}` }
});
// Verify: score computed server-side, result includes grade but not answer key
```

**Manual Test Data:**
- Use existing test ID from database: `SELECT id FROM tests WHERE is_published=true LIMIT 1`
- Use real student account credentials
- Expected response times: < 500ms per operation

---

#### B. Homework Create/Submit Smoke Test
```typescript
// 1. Create homework as student
const create = await fetch('/api/v1/homeworks', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Test Assignment',
    description: 'Created for smoke test',
    due_date: '2026-11-01',
    subject_id: '{valid-subject-uuid}'
  }),
  headers: { Authorization: `Bearer ${student_jwt}` }
});

// 2. Submit assignment
const submit = await fetch('/api/v1/homeworks/{create.id}/submit', {
  method: 'POST',
  body: JSON.stringify({
    text_answer: 'Student response text here',
    file_id: null // or valid uploaded file UUID
  })
});

// 3. Verify locked status
const reattempt = await fetch('/api/v1/homeworks/{create.id}/submit', { ... });
// Expect 409 Conflict (SUBMISSION_LOCKED error)
```

---

#### C. File Upload Smoke Test
```typescript
const form = new FormData();
const fileBlob = new Blob(['test content'], { type: 'text/plain' });
form.append('file', fileBlob, 'test.txt');
form.append('group_id', '{valid-group-uuid}');
form.append('visibility', 'public');

const upload = await fetch('/api/v1/files/upload', {
  method: 'POST',
  body: form,
  headers: { Authorization: `Bearer ${student_jwt}` }
});

// Expected: 201 Created with signed download URL
// Verify: file object stored in Supabase, Upstash Blob has matching key
```

---

### Priority 3: Implement Missing Homework CRUD

**Status:** Only create/submit working, update/delete not migrated

#### Implementation Plan:

```typescript
// homework.ts lines ~137 (after CREATE handler):

/** UPDATE homework */
homework.patch("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const user = c.get("user"), roles = await callerRoles(db, user.id);
  const isAdminOrTeacher = roles.some(r => ["teacher", "admin"].includes(r));
  
  const id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID задания");
  
  let payload: any;
  try { payload = await c.req.json(); } catch {
    return c.json(fail("VALIDATION_ERROR", "Invalid JSON", 400, rid), 400);
  }
  
  // Validate editable fields only (title, description, due_at)
  const title = String(payload.title || "").trim().slice(0, 240);
  const description = payload.description == null ? null : String(payload.description).slice(0, 10000);
  const dueAt = payload.due_at ? String(payload.due_at) : null;
  
  try {
    const { data, error } = await db.from("homeworks")
      .patch({ title, description, due_at: dueAt, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").maybeSingle();
      
    if (error) throw error;
    if (!data) return c.json(fail("NOT_FOUND", "Задание не найдено", 404, rid), 404);
    
    // If homework was created by non-staff, only creator can edit
    if (!isAdminOrTeacher && String(data.created_by || "") !== user.id) {
      return c.json(fail("FORBIDDEN", "Только создатель может редактировать задание", 403, rid), 403);
    }
    
    return c.json(ok({ item: data }, rid));
  } catch (e) {
    return c.json(fail("UPDATE_FAILED", "Не удалось обновить", 503, rid), 503);
  }
});

/** SOFT-DELETE homework */
homework.delete("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const user = c.get("user");
  const id = (c.req.param("id") ?? "");
  
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID задания");
  
  try {
    const { data, error } = await db.from("homeworks")
      .update({ 
        archived_at: new Date().toISOString(), 
        archived_by: user.id,
        status: "archived"
      })
      .eq("id", id).select("*").maybeSingle();
      
    if (error) throw error;
    if (!data) return c.json(fail("NOT_FOUND", "Задание не найдено", 404, rid), 404);
    
    return c.json(ok({ message: "Задание удалено", item: data }, rid));
  } catch (e) {
    return c.json(fail("DELETE_FAILED", "Не удалось удалить", 503, rid), 503);
  }
});
```

**Add to `workers/api/src/index.ts`** route registration if missing

---

### Priority 4: Admin Write Operations (Schedule, Content Management)

**Current Status:** Source-only routes return 501 or limited functionality

#### High-Priority Admin Routes to Implement:

1. **Schedule Versioning & Save**
   ```typescript
   PUT /api/v1/admin/schedule -> medbiohim_version_and_save_schedule() RPC
   POST /api/v1/schedule/entries -> Insert new lesson entries
   PATCH /api/v1/schedule/entries/:id -> Update existing
   DELETE /api/v1/schedule/entries/:id -> Remove lessons
   ```

2. **Admin Database Operations**
   ```typescript
   POST /admin/import/questions -> Bulk question import package
   POST /admin/database/migrate -> Schema migration runner
   GET /admin/database/schema/status -> Migration audit log
   ```

3. **Content Management**
   ```typescript
   POST /admin/lectures/generate -> AI lecture generation
   POST /admin/content/archive -> Move content to archive
   POST /admin/content/rollback -> Revert content versions
   ```

---

## 🧪 Testing Infrastructure Setup

### Local Development Testing

```bash
# Start all services locally
cd workers/api
npm run dev  # Cloudflare worker mock

# Frontend
cd frontend
npm run dev  # Next.js local dev server

# Manual curl tests (replace ENV with your values)
curl -X POST https://localhost:8787/api/v1/tests/test-uuid/start \
  -H "Authorization: Bearer $JWT" \
  -d '{}'

curl -X POST https://localhost:8787/api/v1/homeworks \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Smoke test"}'
```

---

## ✅ Acceptance Criteria for Phase 1 Completion

By end of Week 4 (October 22-November 19):

**Core Platform Stability:**
- [ ] CI/CD pipeline green (all PRs pass automated tests before merge)
- [ ] Zero critical bugs in last 30 days of production traffic
- [ ] API response time p95 < 500ms median < 200ms

**Functional Parity:**
- [ ] Test attempt lifecycle works start-to-finish (beginner/student verified)
- [ ] Homework create/update/delete/submit all functional
- [ ] File upload/downloading verified with Upstash Blob
- [ ] Admin schedule management operational

**Documentation:**
- [ ] PHASES_STATUS.md updated with current phase completion %
- [ ] UNFINISHED-REGISTRY.md lists remaining gaps
- [ ] SYNC_STAMP.md shows latest version parity check

**Quality Gates:**
- [ ] All database writes go through RPC functions (no direct table inserts from client)
- [ ] RLS policies tested with actual student tokens (not admin)
- [ ] Automated rollback tested and documented
- [ ] Shadow Worker traffic can be reduced below 5% safely

---

## 🎯 Next Steps (Starting Today)

### Immediate (This Week):
1. Configure GitHub Actions secrets
2. Run first successful CI deployment to production
3. Execute test attempt smoke test with real student credentials

### Short Term (Weeks 2-3):
4. Implement homework patch/delete handlers
5. Add admin schedule write operations
6. Set up monitoring/alerting for Cloudflare Worker errors

### Long Term (Week 4+):
7. Begin FESMU/browser extension development (Phase 2)
8. Start Interactive Labs module design (Phase 3)
9. Build multi-source question import pipeline (Phase 4)

---

*Document generated: 2026-10-22*
*Source: Cloudflare Worker v83 active at 100% traffic*
