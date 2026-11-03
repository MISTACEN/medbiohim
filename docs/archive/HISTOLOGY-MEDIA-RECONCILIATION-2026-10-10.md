# Histology media reconciliation — 2026-10-10

## Scope and safety

Read-only reconciliation of live Supabase metadata against the GitHub `main` tree. No database rows or physical media were modified. GitHub's source tree does not contain the large media archive; absence from GitHub does not establish absence on SpaceWeb or Backblaze B2.

## Electronograms

Live query scope: `subject_slug = histology`, `mode_set = electronogram`, `is_published = true`.

- 28 published cards.
- 28/28 have non-empty `source_key`.
- 28/28 have non-empty `preparation.imagePath`.
- 23/28 have exact `source_key = preparation.imagePath`.
- 5/28 differ and require physical filename/HTTP verification.
- 0 exact matches and 0 basename matches between these cards' `source_key` values and `content_sources.source_path`.
- GitHub `main` tree has no matching image assets. The canonical manifest says physical media is deployed separately to SpaceWeb.

### Mismatched cards

| Card ID | source_key | preparation.imagePath | Finding |
|---|---|---|---|
| `feed-em-f22bfe6d5e` | `electronograms/images/parietalnyj-ekzokrinocit-sobstvennyh-zhelez-zheludka.png` | `electronograms/images/parietalnyj-ekzokrinocit-sobstvennyh-zhelez-zhelud.png` | imagePath appears truncated; verify actual filename |
| `feed-em-bab1517f74` | `histology-em-capillary-20261005` | `electronograms/images/poperechnyj-srez-krovenosnogo-kapillyara.jpeg` | source_key is an ID-like legacy key; verify actual .jpeg file and intended lookup |
| `feed-em-8976014fa3` | `electronograms/images/poverhnost-mnogoryadnogo-resnitchatogo-epiteliya-skaniruyusc.png` | `electronograms/images/poverhnost-mnogoryadnogo-resnitchatogo-epiteliya-s.png` | imagePath appears truncated; verify actual filename |
| `feed-em-05259b86bb` | `electronograms/images/uzlovoj-perehvat-ranve-v-nervnom-volokne-sedalischnogo-nerva.png` | `electronograms/images/uzlovoj-perehvat-ranve-v-nervnom-volokne-sedalisch.png` | imagePath appears truncated; verify actual filename |
| `feed-em-402e952e4b` | `electronograms/images/dendrity-fotoreceptornyh-palochkovyh-nejronov-setchatki-glaz.png` | `electronograms/images/dendrity-fotoreceptornyh-palochkovyh-nejronov-setc.png` | imagePath appears truncated; verify actual filename |

## Histology materials

Read-only query found 80 histology material rows:
- 43 type `other`, 30 type `table`, 7 type `docx`.
- All 80 have non-empty `content_html`.
- All 80 have a `source_key` that resolves to a `content_sources` row.
- All 80 have `file_id IS NULL` and `external_url IS NULL`; this is not automatically a defect because the records carry inline HTML and a separate source metadata reference. The actual viewer/download flow and physical source availability still need runtime verification.

## Required next checks

1. From the SpaceWeb host, list the actual files under `/public_html/content/histology/electronograms/images/` and `/public_html/content/histology/em/`; do not rename Unicode or extension variants based on guesses.
2. Request all 28 authenticated image endpoints with an MBH account and confirm HTTP 200, correct image content-type, and non-empty image bytes.
3. Repeat access checks with a non-MBH account; expected denial is 403/404 without leaking the file.
4. Match each card ID to the served file and compare actual bytes/extension before correcting either `source_key` or `preparation.imagePath`.
5. Test material detail/download/viewer paths for the 80 material rows; distinguish inline HTML from downloadable source documents.
6. Only then apply a narrow, reversible metadata fix and rerun the same checks.

## CI / deployment limitations

GitHub Actions jobs for run `37993824049`, attempt 4, again failed before any steps (`steps=[]`). This is a runner/dispatch failure, not a test result. Vercel deployment is separately blocked by the observed `build-rate-limit` target. Therefore this report is a metadata reconciliation, not a production HTTP acceptance report.
