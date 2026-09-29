# Orgchem micro push progress

| Range | Tasks | Status |
|-------|-------|--------|
| m01–m16 | 1–80 | on main |
| m17–m52 | 81–260 | pending |

Full source of truth: `artifacts/backend/data/questions_by_subject/organic_chemistry.json` (260).

After all micros on GH:
```bash
python3 docs/orgchem-import/assemble_from_micros.py
```

Deploy without waiting for full GH push:
1. Upload `spaceweb_upload/data/{questions_bank,tests,questions_by_subject/organic_chemistry}.json`
2. Run `docs/20260929_import_organic_chemistry_exam_questions_uuid.sql` on Supabase
