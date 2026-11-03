# Histology content archive — 2026-10-12

## Source and normalization

A supplied `content.zip` was inspected and converted into a clean working asset package. The original archive had duplicate ZIP entries caused by filenames encoded as literal `#UXXXX` sequences alongside normal Unicode names.

The prepared package `content-histology-working.zip`:
- preserves the existing `content/histology/` directory layout expected by the PHP media endpoint;
- decodes legacy `#UXXXX` filename sequences to Unicode;
- removes duplicate entries only when both normalized path and SHA-256 content match;
- retains original image bytes without lossy recompression;
- includes 178 JPG, 4 JPEG, 62 PNG, 28 DOCX documents, two JSON maps, and README metadata (275 source files before the two generated audit files);
- adds `asset-manifest.json` with sizes and SHA-256 hashes and `IMPORT-REPORT.md`;
- repairs the 28 `docx-to-image-map.json` document paths to the flat `electronograms/docx/<docxName>` layout actually present in the archive and verifies each referenced document and image exists.

## Deployment

This is a media/content package, not an application build and not a backend code deployment.

1. Keep the current SpaceWeb backend active.
2. Back up the existing `backend/content/histology/` directory before replacing or merging files.
3. Upload and extract the package so the resulting directory is `backend/content/histology/` (alongside `backend/config/`, `backend/src/`, and `backend/public/`), or configure `HISTOLOGY_MEDIA_ROOT` to the actual location.
4. Verify representative image URLs through `GET /api/v1/trainers/feed/{id}/image`; check both micro-preparations and electronograms.
5. Do not delete old media until the atlas and trainer routes have been checked on desktop and mobile.

The archive should not be committed wholesale to Git: it is a large binary collection and the deployed PHP media endpoint already expects these files outside the source tree. Keep the lightweight maps/manifests versioned if needed; keep the full media package in the intended hosting/storage location.

## Validation limits

The archive structure and map-to-file references were validated locally. This does not prove the package has been uploaded to SpaceWeb, that Supabase rows point to every file, or that the live image endpoint serves all assets. Those checks remain outstanding.
