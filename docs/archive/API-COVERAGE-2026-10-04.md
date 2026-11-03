# MEDBIOHIM — API coverage / compatibility audit

Дата: 2026-10-04

## Current result

Frontend больше не использует retired `/api-compat/*` routes. Predeploy audit автоматически проверяет это.

Исторический compatibility слой теперь считается CLOSED для текущего frontend.

## Реальные backend endpoints, на которые переведены активные flows

- /auth/register
- /community/posts
- /lectures
- /lectures/{id}
- /lesson-plan
- /questions
- /questions/{id}
- /questions/{id}/report
- /files/{id}
- /admin/schedule
- /groups
- /subjects
- /admin/*
- /trainings/*
- /tests/preparation/*
- /srs/*
- /search
- /calculators/*
- /presence/*

## Что дополнительно проверено

- homework → API-only;
- schedule save → real `/admin/schedule`;
- subject test/lecture/ticket queries are subject-scoped;
- search exposes plan type;
- SRS has persistent DB storage;
- calculators have real backend service;
- presence has persistent DB storage.

## Legacy API surfaces that remain intentionally

`/sessions` / learning_sessions — real backend storage/API with no current main UI consumer. Keep deferred until historical consumer check.

Duplicate route registration in aggregate and dedicated route files remains an architectural cleanup item, not an API compatibility blocker.

## Rule

Do not add new compatibility routes. New frontend features must call the canonical backend endpoint directly.