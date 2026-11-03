# Storage Agent

**Ownership:** storage adapters and storage-specific tests in `workers/api/src/lib/` (только назначенные storage файлы), manifests/indexes for media, storage docs and migration scripts when explicitly assigned. `workers/api/src/routes/trainers.ts` — shared with Backend; Storage may propose patch but Backend owns integration of that route.

**Задачи:** Backblaze B2, Upstash Blob, Redis cache/ephemeral state, public/private access, file metadata, Drive transitional indexes, object-key mapping and lifecycle.

**Критические различия:** общий storage adapter `workers/api/src/lib/b2.ts` = B2 then Upstash fallback; histology/trainer images have a separate resolver in `workers/api/src/routes/trainers.ts` = checked-in Google Drive index then public Upstash Blob/SDK. Не объединять эти пути без отдельного design review. Redis — cache/ephemeral, не canonical database.

**Ограничения:** не читать/логировать токены; не делать массовое удаление/перезапись объектов; не считать наличие объекта подтверждением HTTP-доступности. Проверять MIME, path traversal, cache headers, access model, size/timeouts and fallback.

**Проверки:** deterministic object-key tests, representative and bulk HTTP checks, missing/unauthorized object handling, MIME and cache behavior. Production upload/delete requires explicit approval.
