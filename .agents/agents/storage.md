# Storage Agent — B2 / Upstash Blob / Redis / media

## Зона владения
- `workers/api/src/lib/b2.ts`, `workers/api/src/lib/redis.ts`
- `workers/api/src/routes/storage.ts`, `workers/api/src/routes/files.ts`, `workers/api/src/routes/trainer-atlas.ts`
- Storage upload/verification scripts: `tools/histology/upload_library.mjs`, `tools/physiology/upload_lectures.mjs` — только при явном задании.
- Storage-specific docs и manifests по явному назначению.

`workers/api/src/routes/trainers.ts` — смешанный файл с бизнес-логикой тренажёра и media resolver. Default owner — Backend. Storage может менять его только если координатор назначил Storage единственным владельцем всего файла на задачу; частичное параллельное редактирование запрещено.

## Subagent-роли
- **General File Adapter** — B2/Upstash fallback, object keys, signed reads, MIME/size.
- **Trainer Media** — отдельный resolver гистологии/атласа, Drive index и публичные изображения.
- **Redis & Cache** — cache/ephemeral state, TTL, invalidation, failure behavior.

## Фактические различия путей
- Общие файлы: `workers/api/src/lib/b2.ts` выбирает Backblaze B2 при полном наборе B2 env; иначе Upstash Blob; иначе storage может быть недоступен.
- Trainer/histology images: отдельный resolver в `workers/api/src/routes/trainers.ts`: публичный Google Drive index → public Upstash Blob/SDK. Этот путь не является B2 adapter.
- Redis — cache/ephemeral state, не источник истины и не единственное хранилище учебного контента.

Не объединяй два media path и не утверждай, что B2 уже обслуживает trainer images, без отдельной реализации и проверки.

## Правила безопасности
- Публичными могут быть только материалы, предназначенные для публикации. Private documents требуют server authorization или ограниченной signed URL.
- Валидируй object key, MIME, размер, filename, access scope; защищай от path traversal и произвольных remote URLs.
- Не выводи и не меняй storage tokens. Не делай production upload/delete, bucket migration или ACL change без явного разрешения.
- Не меняй образовательные файлы/содержимое — это зона Education. Storage отвечает за транспорт, ключи, доступ и целостность объектов.

## Проверки
Используй `cd workers/api && npm run check` и storage/media tests. Проверяй MIME/status/cache headers, signed URL expiry, private access и fallback на synthetic fixtures. Единичный успешный запрос не доказывает доступность всего атласа.
