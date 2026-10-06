# MEDBIOHIM — Pass 14–17 Second Verification — 2026-10-06

## Purpose

This is the mandatory second pass after implementation of Pass 14–17. It uses the current `main` code and live Supabase state, not the historical implementation notes as proof.

## Live hard-gate results

| Check | Result |
|---|---:|
| active test attempts missing group/context/snapshot | 0 |
| active preparation sessions missing group/session/context/snapshot | 0 |
| test answers outside immutable attempt snapshot | 0 |
| preparation results missing answer_snapshot | 0 |
| attempts attached to a group the user is not a member of | 0 |
| preparation sessions attached to a foreign group | 0 |
| schedule entry ↔ academic session/year/semester mismatches | 0 |
| submitted attempts missing score/max_score | 1 legacy row |

The single submitted-attempt anomaly is a legacy attempt created on 2026-10-02 before the snapshot architecture existed. It has no saved answers, no question snapshot, no group and no academic session. It is intentionally **not rewritten**: inventing a score or historical context would corrupt historical data. New attempts are protected by the current snapshot contract.

## Code hardening completed in this second pass

- Homework list now exposes one canonical derived `my_status`:
  `pending | done | submitted | returned | graded`.
- Homework list also exposes `my_status_source`, so UI/API consumers can distinguish personal completion from submission state.
- Planner uses the same canonical status contract when deciding whether homework contributes to recovery/pending work.
- This removes the remaining semantic split where `homework_progress.completed` and `homework_submissions.status` could produce different visible states.

## Pass status after the second verification

### Pass 14 — Context foundation
**🟢 CLOSED at implementation + live invariant level.**

Canonical group/subject/session/lesson/context-version resolver exists and is used by the core flows. No current foreign-context or active-snapshot gaps were found.

### Pass 15 — Core academic flow
**🟢 CLOSED for the implementation contract; runtime deployment remains a separate release gate.**

Planner, schedule, attendance, homework, attempts and progress use explicit group scope. Test attempts are retry-safe. Homework now has one canonical derived state.

### Pass 16 — Tests / Preparation
**🟢 CLOSED for the implementation contract.**

Preparation start, question membership, sequential bank progress and terminal transitions are context-aware.

### Pass 17 — Test integrity / reproducibility
**🟢 CLOSED for the implementation contract and live DB invariants.**

Answers are persisted server-side; scoring is server-authoritative; ordinary attempts and preparation sessions carry immutable academic/question snapshots; preparation answer snapshots are populated.

## Remaining release-level gate

The following is deliberately NOT marked done by this document:

- PHP/TypeScript/Next production build after the latest commits;
- authenticated browser smoke;
- exact Vercel commit/deployment verification;
- exact SpaceWeb artifact/runtime verification.

Those belong to the deployment/runtime gate, not to pretending Pass 14–17 are incomplete.

## Source-of-truth rule

Historical Pass 14–17 notes remain as audit evidence. This document supersedes their stale "remaining P1" lists where later Pass 18–22 or this second verification already closed the item.

