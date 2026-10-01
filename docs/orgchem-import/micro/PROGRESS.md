# Orgchem micro push progress

| Range | Tasks | Status |
|-------|-------|--------|
| **m01–m52** | **1–260** | **COMPLETE on main** |

Assemble full bank:
```bash
python3 docs/orgchem-import/assemble_from_micros.py
```

Deploy SpaceWeb:
1. Upload `spaceweb_upload/data/{questions_bank,tests,questions_by_subject/organic_chemistry}.json`
2. Run SQL import on Supabase
