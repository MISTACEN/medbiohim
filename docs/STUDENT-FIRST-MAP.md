# MEDBIOHIM — Student-first project map

Дата: 2026-10-06

## Product idea

MEDBIOHIM — учебная платформа **от студентов для студентов**.

Главный цикл:

`student → group → schedule → lesson → homework → completion → progress`

Telegram extends it:

`group chat → bot → message/photo → classification → subject → lesson → homework → website`

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

Live Supabase check on 2026-10-06:

| Area | Rows |
|---|---:|
| telegram_bot_chats | 0 |
| telegram_messages | 0 |
| telegram_homework_links | 0 |
| homework_attachments | 0 |
| homeworks | 0 |
| groups | 4 |
| active group memberships | 4 |
| schedule entries | 309 |

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

Current DB has `groups` + `group_memberships`, but no clear student-facing join endpoint/UI was found.

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
→ website
`

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
  │
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
  │
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
- real Telegram → homework smoke test.

### P1
- candidate/confirmation workflow;
- student-generated content;
- starosta/moderation;
- contribution history;
- group feed;
- real activity-based progress.

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
4. How does the result return to the student's learning workflow?

If these links are missing, the feature is not considered integrated into MEDBIOHIM.
