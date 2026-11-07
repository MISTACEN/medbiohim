# Chemical Engine (на main)

Перенесено с экспериментальной ветки `beta` 2026-09-30.

## Контракт

Один объект `ChemicalMolecule` (идентификаторы + provenance). UI только отображает.

```
query → /api/chemistry/resolve → PubChem → validate → ChemicalMolecule
```

## Файлы

- `src/lib/chemistry/` — types, pubchem, validation, fixtures
- `src/app/api/chemistry/resolve`, `health`
- `src/app/chemistry/page.tsx`
- `database/migrations/chemical_engine_beta.sql` (+ seed)

## Supabase

Выполнить на проде после деплоя кода:

1. `database/migrations/chemical_engine_beta.sql`
2. `database/migrations/chemical_engine_beta_seed.sql`

## Следующие эксперименты (только beta)

RDKit, Ketcher, 3Dmol, проекции Фишер/Haworth/Newman/Chair — см. [ACTIVE-EXPERIMENTS.md](ACTIVE-EXPERIMENTS.md).
