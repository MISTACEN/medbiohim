# Full repository sync

**Date:** 2026-09-15 (CEST)

**Source of truth (local):**
- `artifacts/frontend/` → Vercel (repo root)
- `artifacts/backend/` → SpaceWeb (`backend/`)

**Included in this refresh:**
- AuthProvider / me()
- Live API pages (dashboard, schedule, materials, community, progress, subjects…)
- Backend platform routes: dashboard, schedule, materials, community, progress
- ContentStore + FileRepository listActive

If a file is missing after clone, copy from local `artifacts/`.
