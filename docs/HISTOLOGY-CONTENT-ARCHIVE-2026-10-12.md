# Histology content archive audit — 2026-10-12

## Source

User-provided `content.zip`. The source archive is kept intact; no Supabase records or existing trainer cards are modified by this audit.

## Inventory

- 444 files, approximately 202.46 MiB.
- 178 correctly named preparation photos under `content/histology/5_Фотографии препаратов/`.
- 33 canonical electronogram image paths and 33 compatibility paths under `em/`; several are duplicate byte content or alternate filename aliases.
- Caption metadata covers 28 electronogram topics in `electronograms/docx-captions.json` and `docx-to-image-map.json`.
- 52 DOCX source documents are present. They are intentionally not copied into the public media deployment package.
- 169 ZIP entry names use the legacy `#UXXXX` escaping form. The importer decodes these names and deduplicates identical target paths by SHA-256.
- The deployment package generated for this audit contains 178 preparation-photo paths, 33 canonical electronogram paths, 33 `em/` compatibility paths and both caption metadata files. It has 207 unique image hashes across the included paths and no normalized-path conflicts.

## Deployment package

The separately generated file `medbiohim-histology-media-spaceweb.zip` is not committed to Git because binary media should not bloat the repository history. Extract it from the backend project root (the directory containing `config/`, `src/`, and `public/`). The archive paths then create `content/histology/`.

The archive includes `DEPLOYMENT-README.md` and `histology-media-manifest.json`. Before deploying, confirm the PHP runtime uses `backend/content/histology/` or set `HISTOLOGY_MEDIA_ROOT` to that directory, then smoke-test a known image via `GET /api/v1/trainers/feed/{id}/image`.

## Reproducible importer

The repository importer supports both the legacy `features.zip` and this `content.zip` layout:

```bash
python tools/import_histology_media.py content.zip --out backend/content
python -m unittest tools/test_import_histology_media.py
```

The importer does not write to Supabase. The source DOCX files remain archive/source material and are not exposed as public media automatically. Existing trainer cards, question banks and subject mappings must be preserved during any later database reconciliation.
