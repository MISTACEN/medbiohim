# MEDBIOHIM — Student-first project map

Дата: 2026-10-06

## Product idea

MEDBIOHIM — учебная платформа **от студентов для студентов**.

Главный цикл:

`student → group → schedule → lesson → homework → completion → progress`

Telegram extends it:

`group chat → bot → message/photo → classification → subject → lesson → homework → website`

## Two-pass functional audit — 2026-10-06

### Pass 1 — UI/function inventory

The repository contains user-facing routes/components for:

- authentication: login, registration, password recovery, OAuth providers;
- dashboard/home;
- schedule;
- subjects and subject content;
- homework;
- tests/preparation/question bank;
- exam tickets;
- SRS cards;
- practice/questions/favorites/reports;
- materials/files;
- lectures;
- progress;
- academic plan/state;
- community/search;
- AI tutor;
- settings;
- chemistry tools;
- admin: users, roles, schedule, materials, homework, announcements and Telegram tools.

Buttons/actions are not generally static placeholders: the code contains handlers for navigation, loading, creation, deletion, submission, completion, favorites, reports, theme switching, logout, AI conversations and admin operations.

### Pass 2 — integration/functionality verification

A function is considered **PROVEN** only when its UI action, API route, persistence and result can be traced end-to-end. Code presence alone is **IMPLEMENTED**, not PROVEN.

Current evidence:

| Function | Code | API/DB path | Live proof | Status |
|---|---|---|---|---|
| Login/register | yes | auth routes | previous regressions exist | 🔴 BLOCKED/RECHECK |
| Dashboard | yes | dashboard API | not fully E2E verified | 🟡 |
| Schedule | yes | schedule API + 309 rows | data exists | 🟢 DATA / 🟡 E2E |
| Subjects | yes | subjects API + 114 rows | data exists | 🟢 DATA / 🟡 E2E |
| Questions | yes | questions API + 855 rows | data exists | 🟢 DATA / 🟡 E2E |
| Tests | yes | tests/test_questions + 33 tests | data exists | 🟢 DATA / 🟡 E2E |
| Tickets | yes | ticket banks/tickets | schema exists; tickets currently 0 in live audit | 🟡 |
| Materials | yes | materials + file viewer | 80 materials; histology files previously unresolved | 🟠 |
| Homework | yes | CRUD/submit/done | live homeworks = 0 | 🟠 UNPROVEN |
| Progress | yes | progress/ledger APIs | E2E not proven | 🟡 |
| SRS cards | yes | SRS API/DB | E2E not proven | 🟡 |
| Community | yes | community APIs | E2E not proven | 🟡 |
| AI tutor | yes | AI conversation/message routes | provider failures previously observed | 🟠 |
| Admin | yes | protected admin routes | E2E not proven | 🟡 |
| Telegram webhook | yes | POST webhook | telegram tables all empty | 🟠 FOUNDATION ONLY |
| Telegram registration | traces | OAuth/custom provider | no proven /start→account flow | 🔴 MISSING |
| Telegram → lesson resolver | classifier exists | no proven exact lesson resolver | no live chain | 🔴 MISSING |
| Student contributions | partial | community/content tables | moderation workflow not proven | 🟠 |
| Mobile UX | yes | responsive components | no automated browser proof in current audit | 🟠 |

### Live database snapshot

| Area | Rows |
|---|---:|
| groups | 4 |
| group_memberships | 5 |
| schedule_entries | 309 |
| questions | 855 |
| tests | 33 |
| materials | 80 |
| homeworks | 0 |
| telegram_bot_chats | 0 |
| telegram_messages | 0 |
| telegram_homework_links | 0 |
| homework_attachments | 0 |

The zero Telegram/homework rows mean these workflows are not yet accepted as production-proven.

## Current reality

### Ready in code

- groups and group_memberships
- group-aware schedule
- group-aware homework
- student homework submission/done flows
- Telegram webhook
- Telegram chat discovery and admin binding
- Telegram message persistence and duplicate protection
- reply/media-group homework attachment linking
- OCR/vision metadata path
- semantic homework classifier
- subject hint / due hint extraction
- homework creation
- homework attachments
- Telegram OAuth/custom-provider traces

### Not proven in production

Live Supabase check on 2026-10-06 shows Telegram and homework tables empty.

Therefore Telegram is currently **implemented as a backend foundation, not an accepted production feature**.

## Main missing pieces

### 1. Student registration

Target:

`Telegram /start → identity verification → MEDBIOHIM account → group join → schedule`

Current gap:
- custom Telegram auth exists as a trace;
- no proven Telegram bot /start registration flow;
- no proven Telegram-user ↔ site-user binding;
- no safe group-code/link join flow.

### 2. Group membership

Current DB has `groups` + `group_memberships`, but no clear student-facing join endpoint/UI was proven.

Needed:
- join by short code/link;
- confirmation;
- duplicate membership protection;
- leave/change group;
- starosta role;
- audit trail.

### 3. Lesson resolver

This is the most important missing Telegram component.

The bot must not stop at:

`message → subject`

It must resolve:

`message → group → date/time → schedule entry → subject → homework`

Recommended separate service:

`TelegramHomeworkResolver`

Input:
- group_id
- telegram_date
- message/caption/OCR
- subject_hint
- due_hint

Output:
- subject_id
- schedule_entry_id
- lesson context
- confidence
- auto / needs_confirmation / unresolved

### 4. Confirmation workflow

Low-confidence AI output must become a **candidate**, not an official homework item.

Student/starosta should be able to correct:
- subject;
- lesson;
- due date;
- description;
- attachments.

Only then publish to the group.

### 5. Student-generated knowledge

Future platform model:

`student contribution → peer/starosta confirmation → shared group knowledge`

Examples:
- notes;
- corrections;
- useful files;
- lesson clarifications;
- questions;
- homework additions.

Canonical academic content remains protected from arbitrary edits.

## Telegram production test

Required acceptance chain:

`Telegram group
→ webhook
→ telegram_messages
→ group resolution
→ subject resolution
→ lesson resolution
→ homework
→ attachment
→ website`

Registration acceptance chain:

`/start
→ account link
→ group join
→ schedule
→ homework`

A HTTP 200 alone is not enough.

## Project dependency graph

```
STUDENT
  │
  ├── Auth / Telegram identity
  ▼
USER
  │
  ▼
GROUP MEMBERSHIP
  │
  ├───────────────┐
  ▼               ▼
SCHEDULE        COMMUNITY
  │
  ▼
LESSON CONTEXT
  │
  ├──────────┬──────────┐
  ▼          ▼          ▼
HOMEWORK   MATERIALS   TESTS
  │
  ▼
SUBMISSION / DONE
  │
  ▼
PROGRESS

TELEGRAM GROUP
  │
  ▼
BOT
  │
  ▼
MESSAGE / PHOTO
  │
  ▼
OCR + CLASSIFIER
  │
  ▼
HOMEWORK RESOLVER
  ├── subject_id
  ├── schedule_entry_id
  └── due_at
          │
          ▼
       HOMEWORK
          │
          ▼
       STUDENTS
```

## Priority

### P0

- production auth/router stability;
- student identity;
- group membership;
- Telegram registration/linking;
- lesson resolver;
- real Telegram → homework smoke test;
- E2E verification of core buttons: login, schedule, subject, test, homework, submit/done, logout.

### P1

- candidate/confirmation workflow;
- student-generated content;
- starosta/moderation;
- contribution history;
- group feed;
- real activity-based progress;
- mobile browser regression pass.

### P2

- UI polish;
- Aero Glass;
- advanced analytics;
- additional AI automation.

## Architectural rule

Every new feature must answer:

1. Who is the student?
2. Which group does the action belong to?
3. Which lesson/subject does it belong to?
4. Which API/database operation does the action execute?
5. What visible result does the student receive?
6. What happens on error, retry and duplicate click?

If these links are missing, the feature is not considered integrated into MEDBIOHIM.


## Pass 4–5 semantic/code-contract audit

Detailed findings: `docs/SEMANTIC-CODE-AUDIT-2026-10-06-PASS4-5.md`.

### Mandatory architecture invariants

- Student self-service is the default; admin/teacher approval is never a prerequisite for a normal personal action.
- Starosta/group moderator confirmation is an additional layer for shared group facts, disputed content or moderation.
- Attendance self-report remains available to the student; official confirmation is a separate provenance state.
- Group-scoped entities must use group_id and stable UUIDs; slugs/names are not identity.
- Primary and fallback backend paths must implement the same semantic contract.
- Empty result and backend failure must never be indistinguishable.
- A production build that ignores TypeScript/ESLint errors is not final proof of correctness.

## Product contract clarification — 2026-10-11

See the canonical [product intent and integration contract](MEDBIOHIM-PRODUCT-INTENT-AND-INTEGRATION-CONTRACT.md).

- MEDBIOHIM is a standalone student self-preparation tool for exams, tests, pass/fail assessments and learning workflows—not the official university site or a replacement for the official portal.
- Existing site structure and visual organization are approved; improve and complete the current UX rather than redesigning or duplicating sections.
- Imported real questions should preserve source/provenance and remain distinguishable from AI-generated or unverified content.
- Any authenticated member of the same group should be able to add shared homework. UI and API must agree; group membership and academic scope must be checked server-side. Individual completion/submission remains separate from the group assignment.
- Telegram is both an account entry point (registration/login and opening the site as a Mini App) and an academic chat ingestion channel.
- Open findings: checked homework UI/API still restrict creation to privileged roles/starosta; PHP webhook secret validation is fail-open if no secret is configured; complete Telegram registration/account-linking/Mini App flow is not proven. These are work items, not completed features.
