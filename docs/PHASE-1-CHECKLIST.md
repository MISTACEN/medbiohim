# PHASE 1 — Quick Checklist (Current Status: Week 0)

## ✅ Already Complete in Cloudflare Worker

### Core API Routes (Production Ready)
```
✅ /api/v1/tests/:id/start          → medbiohim_start_test_attempt RPC
✅ /api/v1/tests/attempts/:id/answer → medbiohim_save_test_answer RPC  
✅ /api/v1/tests/attempts/:id/finish → medbiohim_finish_test_attempt RPC
✅ /api/v1/homeworks                 → Student create + list
✅ /api/v1/homeworks/:id/submit      → Submit text/file answers
✅ /api/v1/files/upload              → Upstash Blob upload pipeline
✅ /api/v1/files/:id/download        → Signed URL download
```

### Newly Added Today (Week 0 Day 1)
```
✅ /api/v1/homeworks (PATCH)         → Update homework handler
✅ /api/v1/homeworks (DELETE)        → Soft-delete handler
```

---

## 🔴 Critical Blockers to Fix First

### Priority #1: CI/CD Configuration
**Status:** ❌ BLOCKING all deployments

**Required Actions:**
1. Generate Cloudflare API Token at cloudflare.com/profile/api-tokens
2. Add to GitHub: Settings > Secrets > CLOUDFLARE_API_TOKEN
3. Trigger workflow: https://github.com/MISTACEN/medbiohim/actions

**See Full Guide:** [`CICD-SETUP.md`](../../CICD-SETUP.md)

---

## 🧪 Testing Required Before Production

### Test Suite A: Test Attempts
```bash
# Prerequisites: Valid test UUID from database
SELECT id FROM tests WHERE is_published=true LIMIT 1;

# Manual curl test with student JWT token
curl -X POST 'https://medbiohim-api.ryazansevegor.workers.dev/api/v1/tests/{test-id}/start' \
  -H "Authorization: Bearer YOUR_STUDENT_JWT"

# Should return attempt object WITHOUT question_snapshot/correct_answer
```

**Test Cases:**
- [ ] Start attempt → Verify response stripped of answer keys
- [ ] Submit multiple answers → Text/string/array formats  
- [ ] Finish attempt → Server-side scoring works correctly
- [ ] Re-grade endpoint → PATCH individual question answers

**Acceptance:** All responses < 500ms, no client access to correct_answer

---

### Test Suite B: Homework CRUD
```bash
# 1. Create homework
curl -X POST 'https://medbiohim-api.ryazansevegor.workers.dev/api/v1/homeworks' \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Test","description":"Auto-generated","due_date":"2026-11-01"}'

# 2. Update homework
curl -X PATCH 'https://medbiohim-api.ryazansevegor.workers.dev/api/v1/homeworks/{created-id}' \
  -H "Authorization: Bearer $JWT" \
  -d '{"title":"Updated Title"}'

# 3. Submit assignment
curl -X POST 'https://medbiohim-api.ryazansevegor.workers.dev/api/v1/homeworks/{id}/submit' \
  -d '{"text_answer":"Student response"}'

# 4. Delete homework
curl -X DELETE 'https://medbiohim-api.ryazansevegor.workers.dev/api/v1/homeworks/{id}'
```

**Expected Results:**
- [ ] CREATE: Returns 201 with full homework object
- [ ] UPDATE: Only owner/staff can modify, validates due_date format
- [ ] SUBMIT: Locked after first submission (returns 409 if re-attempted)
- [ ] DELETE: Soft-deletes (status→archived), archived_at timestamp set

---

### Test Suite C: File Upload
```bash
# Prepare multipart form data
node -e "
const { FormData, Blob } = require('formdata-node');
const form = new FormData();
const file = new Blob(['test content'], {type:'text/plain'});
form.append('file', file, 'test.txt');
form.append('visibility','public');
console.log(form);
"

# Upload via curl
curl -X POST 'https://medbiohim-api.ryazansevegor.workers.dev/api/v1/files/upload' \
  -F "file=@test.txt" \
  -F "visibility=public" \
  -H "Authorization: Bearer $JWT"

# Expected: 201 Created with signed URL
```

**Validation Checks:**
- [ ] Max file size enforced (12MB limit)
- [ ] MIME type filtering works (images/PDF/text only)
- [ ] Specialty access control for MBH histology files
- [ ] SHA256 hash stored for deduplication
- [ ] Signed URL expires in 3600 seconds (1 hour)

---

## 📋 Implementation Gaps & Remaining Work

### Homewrok Operations - Partially Complete
```
TODO: Implement admin bulk operations
       → Bulk delete/archive old assignments
       → Reassign submissions to different teacher
       
TODO: Add attachment handling
       → Upload file attachments to homeworks
       → Storage provider fallback (B2 if Upstash fails)
```

### Admin Write Operations - MISSING
```
❌ PUT /api/v1/admin/schedule    → Versioned schedule save
❌ PATCH /api/v1/schedule/entries/:id  → Update lessons
❌ DELETE /api/v1/schedule/entries/:id   → Remove lessons
❌ POST /api/v1/admin/lectures/generate → AI lecture creation
```

### Content Management - MISSING  
```
❌ POST /api/v1/content/archive     → Archive content
❌ POST /api/v1/content/rollback    → Revert versions
❌ GET /api/v1/content/version-log  → Audit trail
```

---

## 🗂️ Documentation Created Today

| Document | Purpose | Location |
|----------|---------|----------|
| `PHASE-1-ACTUAL-STATUS.md` | Detailed status report | `docs/` |
| `CICD-SETUP.md` | Deployment guide | Root |
| `PHASE-1-CHECKLIST.md` | This quick reference | `docs/` |

---

## ⏱️ Timeline Estimates

### Week 1 (Oct 22-28): Fix CI/CD + Smoke Tests
- **Goal:** Automated deployments working, basic E2E verified
- **Success Metrics:**
  - ✅ PRs auto-deploy to staging on merge
  - ✅ Test attempts work start-to-finish
  - ✅ Homework CRUD functional

### Week 2 (Oct 29-Nov 4): Admin Operations
- **Goal:** Schedule management live
- **Tasks:**
  - Implement versioned schedule save RPC wrapper
  - Build admin UI hooks (React components)
  - Add conflict resolution for concurrent edits

### Week 3 (Nov 5-11): Advanced Features
- **Goal:** File attachments + AI generation
- **Tasks:**
  - Homework file attachment pipeline
  - Lecture generation AI orchestration
  - Cache invalidation strategy

### Week 4 (Nov 12-18): Stabilization & Migration
- **Goal:** Shadow Worker traffic reduction
- **Tasks:**
  - Monitor error rates for 7 days
  - Reduce shadow traffic to 0%
  - Archive legacy PHP backend code

---

## 🎯 Success Criteria for Phase 1 Completion

By end of Week 4, ALL must be true:

- [ ] CI/CD green - every push deploys successfully
- [ ] Zero critical bugs in production logs (last 30 days)
- [ ] API p95 latency < 500ms across all endpoints tested
- [ ] Test attempt lifecycle works without exposing answer keys
- [ ] Homework system fully CRUD functional for students+staff
- [ ] File uploads/downloads working with signed URLs
- [ ] Shadow Worker removed from deployment pipeline
- [ ] Documentation updated (ROADMAP.md, UNFINISHED-REGISTRY.md)

---

## Next Steps After Phase 1

1. **Phase 2: Official Site Integration** (Weeks 5-8)
   - Browser extension for EIOS imports
   - FESMU.ru information aggregator
   
2. **Phase 3: Interactive Labs** (Weeks 9-12)
   - Virtual dissection station (reusing histology assets)
   - Chemistry simulation engine
   
3. **Phase 4: Question Bank Consolidation** (Weeks 13-16)
   - Multi-source question import pipeline
   - Provenance tracking + verification workflow

---

*Generated: 2026-10-22 | Based on Cloudflare Worker v83 Analysis*
