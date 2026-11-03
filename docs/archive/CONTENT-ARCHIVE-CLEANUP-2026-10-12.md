# Histology content archive cleanup — 2026-10-12

## Source and output

- Source upload: `content.zip` (444 file entries; approximately 212.3 MB uncompressed).
- Prepared archive: `content_cleaned.zip` (275 files; approximately 134.6 MB uncompressed).
- Mapping report: `content_archive_manifest.csv`.
- Validation: ZIP CRC/integrity check passed.
- Changes: decoded legacy filename escapes of the form `#Uhhhh`, removed 169 byte-identical duplicate entries, and preserved file bytes. No different-content filename collisions were found.

## Inventory

- 178 histology preparation photographs under `content/histology/5_Фотографии препаратов/`.
- Electronogram folder contains 31 PNG images, 2 JPEG images, 28 DOCX documents, and 2 JSON files.
- `content/histology/em/` contains a parallel image set/aliases. Keep these paths unless the content loader and database `source_key` values are deliberately updated together.
- The existing `content/histology/README.md` describes the current image endpoint and `HISTOLOGY_MEDIA_ROOT` configuration.

## Deployment caution

The prepared archive is not committed to Git and has not been uploaded to SpaceWeb, Backblaze B2, Supabase, or Cloudflare. It is a cleaned staging artifact only. The cleaned archive is still about 134 MB, so do not add it to ordinary Git history or embed it in a Worker deployment.

For the existing PHP media endpoint, extract it so the resulting path is `backend/content/histology/` (or the configured `HISTOLOGY_MEDIA_ROOT`) on the current PHP host. Before replacing existing files, compare the manifest and current deployed media. Do not delete existing images or alter Supabase `source_key` values until the references are reconciled. The Cloudflare migration should later read media from the chosen object-storage origin, not bundle this archive into the Worker.

## Verification still needed

- Compare every cleaned path against current SpaceWeb files and Supabase `trainer_feed_cards.source_key` / `preparation.imagePath` values.
- Verify the 28 DOCX files and JSON package contents before importing or generating any database rows.
- Smoke-test `GET /api/v1/trainers/feed/{id}/image` on the current host after a non-destructive staging upload.
