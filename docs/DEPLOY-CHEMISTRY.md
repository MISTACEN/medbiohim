# Deploy chemistry (main)

## Code (on GitHub main)
- `/chemistry` — UI
- `/api/chemistry/resolve?query=...`
- `/api/chemistry/health`
- Sidebar: «Химия»

## Supabase (один раз)
SQL Editor, по порядку:
1. `database/migrations/chemical_engine_beta.sql`
2. `database/migrations/chemical_engine_beta_seed.sql`

## Smoke
1. Vercel deploy
2. GET `/api/chemistry/health` → `status: ok`
3. GET `/api/chemistry/resolve?query=benzene` → CID 241
4. UI `/chemistry` — 2D-картинка бензола

## Не входит (beta)
RDKit, Ketcher, 3Dmol, Фишер/Newman renderers
