# MEDBIOHIM — SITE-WIDE HIDDEN GAPS AUDIT / 2026-10-06

Цель: продолжение двухпроходного аудита всего сайта. Ищутся не только отсутствующие endpoints, а семантические разрывы: UI → контекст → API → БД → lifecycle → результат → recovery → admin.

## Pass 1 — inventory / cross-layer consistency

### P0 — production/auth
1. Auth remains a release gate. Code contains register/login/me/refresh and the previous getPreferences fix, but target SpaceWeb runtime must still be proven after the recent router regression.
2. Production acceptance must be tied to the same commit for frontend + backend; otherwise a fixed source tree can coexist with an older deployed runtime.

### P0 — reports / complaints
The report button exists in normal tests, preparation, bank and practice, and the admin problem center exists.

Hidden semantic gap:
- report stores question_id/category/message/reporter/status/work_id;
- it does not preserve the exact test/session/context/question/options/selected answer that the student saw.

Therefore an admin may receive “wrong answer” without enough evidence to reproduce the student's state.

Required report snapshot:
- test_id/test title;
- preparation session id and mode;
- question position;
- question text snapshot;
- options snapshot;
- selected answer / free answer;
- correctness state;
- subject/module/topic;
- user/group;
- created_at.

### P0 — report lifecycle
Current admin UI can create a work item, update report status and edit the question. But these operations are not one transactional lifecycle.
Risk: report → fixed can happen without proving work → edit → validate → publish → resolved.
Required state machine: new → reviewing → work → fixed_pending_validation → published/resolved, or rejected with reason.
Also add internal admin comments, assignee, priority/SLA, change history and student-visible resolution status/notification.

### P1 — admin information architecture
Admin has grown into a mixed CMS/DB/system console. Current home combines schedule, subjects, groups, users/roles, content, homework/media, tickets, lectures, imports/tools and complaints/work items.
New IA should separate: Dashboard; Academic structure; Content; Moderation; Integrations; Imports/validation; System/diagnostics.
Raw DB editor must be clearly marked as a dangerous system tool, not normal content editing.

### P1 — broken semantic navigation
src/app/admin/page.tsx links “Банк вопросов тестов” to /tests. next.config.ts redirects /tests to /subjects.
So the admin shortcut does not open the intended test bank despite both pieces of code being individually valid.
Acceptance: every admin quick link must resolve to the intended destination, not merely return HTTP 200.

### P1 — tests / preparation
Test/preparation acceptance must verify every entry path: direct test; bank; preparation full; preparation count; preparation sequential; resume; finish; result; report; admin edit.
The /tests redirect conflict is especially dangerous because it can hide the problem from code-level endpoint checks.

### P1 — community moderation
Student community posting exists and admin can hide/pin/delete posts.
Missing student-facing safety lifecycle: report a post; edit own post; delete own post; moderation reason/status; visible moderation feedback.
If community is a student-generated-content area, create + admin delete is incomplete.

### P1 — settings / OAuth providers
Settings contains fallback provider definitions for Google, VK and Telegram marked enabled/linkable.
Risk: if backend does not return providers_available, frontend can display providers as available even when the actual provider is not configured.
Acceptance: provider buttons must be driven by verified backend/provider availability, not optimistic frontend defaults. A failed linking attempt needs a clear recovery state.

### P1 — duplicate subject slugs
Live DB currently has duplicate active subject slugs: informatics ×3; physiology ×3; chemistry_organic_physical ×3; optics ×2; philosophy ×2; biology ×2; mathematical_analysis ×2; histology ×2; history ×2.
Therefore slug is not a globally unique subject identity.
Rule: UI/API must resolve subject by stable UUID plus course/semester/group context; slug can be a display/routing hint only.
Services that do slug=eq...&limit=1 are unsafe where semester matters. This is especially relevant to SRS and subject-scoped content APIs.

### P1 — generic material delivery
Current live integrity check shows no published materials that are completely empty and no known missing active file links in the validated set.
The remaining product gap is delivery semantics: generic materials, DOCX/PDF/image, HTML mirror and original file need one unified viewer contract, including the physical-storage-unavailable state.

### P1 — homework
Homework has group scope, due date, completion, submission, file upload and grading backend.
Required explicit states: draft → submitted → graded/returned.
The UI exposes “Сдать работу” even when an item is already done. The DB has UNIQUE(homework_id,user_id), so resubmission semantics must be explicit rather than implicit.

### P1 — progress
Progress correctly hides numeric cards in degraded mode.
Remaining acceptance: a test attempt, completed preparation, homework completion/submission and grade must each change the expected progress values. A valid-looking progress page is not enough; activity-to-progress E2E is required.

### P1 — schedule
Schedule has group-aware data and active-version integrity.
Acceptance still needs: one pair split by a break remains one logical lesson; alternating pairs; week/month/semester views; cancelled/makeup state; attendance; homework linkage; subject colors; mobile agenda; refresh after schedule version replacement.

### P1 — search
Search exists, but acceptance must verify result identity: subject UUID, material UUID, question UUID, test UUID and lecture UUID. A result must never navigate by an ambiguous subject slug alone.

### P1 — questions/content
Live DB currently has 195 questions not linked to test_questions. This is not automatically corruption because some questions are intended for other banks/practice.
Validator must distinguish intentionally standalone, test-linked, archived, unpublished and unintentionally orphaned rows. Do not auto-delete or relink based only on absence from test_questions.

### P2 — generic learning_sessions
Generic learning_sessions storage/API exists but active frontend flows use dedicated preparation/training paths. Keep deferred until all external consumers are checked.

### P2 — version history
Audit log + rollback exists. Still missing polished entity-level history: who changed what; before/after diff; reason; restore preview; restore confirmation; relation to complaint/work item.

## Pass 2 — scenario walk

### Student: “I found an error in question”
Expected: question → report → snapshot → admin queue → work → edit → validate → publish → student sees resolution.
Current: UI/API/admin queue exist, but context snapshot and complete lifecycle are missing.

### Student: “I open tests from admin”
Expected: Admin → Test bank.
Current: admin shortcut /tests → Next redirect /subjects. This is a real product navigation defect.

### Student: “I create a community post”
Expected: post → group → visible feed → report/moderation → resolution.
Current: create/feed/admin moderation exist; student report/edit/delete lifecycle is incomplete.

### Student: “I connect Telegram/VK”
Expected: settings → verified provider availability → OAuth → callback → linked identity → recoverable failure.
Current: provider UI has optimistic fallback entries. Runtime provider availability is external and must be authoritative.

### Student: “I open a subject”
Expected: current course/semester/group → stable subject UUID → plan/materials/tests/tickets/progress.
Risk: duplicate slugs make slug-only resolution unsafe.

### Student: “I submit homework twice”
Expected: explicit replace submission / resubmit semantics.
Current: DB prevents duplicate rows, but UI semantics need to be explicit.

### Student: “Progress says 0”
Expected: either real 0 or clear degraded state.
Current degraded handling exists; activity-based E2E still needs proof.

## Global Definition of Done
A feature is not DONE because a button, route or table exists.
Required: UI; correct context; API; persistence; authorization; RLS; lifecycle; success feedback; error/retry; duplicate/reload safety; mobile state; admin/moderation path where applicable; E2E proof in target environment.

## Priority after this audit
### P0
- auth/router/production stability;
- authenticated smoke;
- report context snapshot;
- report lifecycle with validation/publish;
- same-commit frontend/backend deployment proof.

### P1
- admin IA redesign;
- fix admin /tests navigation conflict;
- provider availability truth;
- duplicate-slug-safe subject resolution;
- community moderation lifecycle;
- homework resubmission semantics;
- test/preparation full entry-path smoke;
- progress activity E2E;
- unified materials viewer contract.

### P2
- entity version history UI;
- bulk content validation;
- route consolidation;
- generic learning_sessions cleanup;
- analytics/polish.

## Do not touch
- existing ticket-bank metadata without a source-backed requirement;
- intentionally standalone questions;
- unused indexes solely because Supabase reports them as unused;
- empty activity tables as demo data.