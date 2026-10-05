# MEDBIOHIM — security + state-contract audit / Pass 6 / 2026-10-06

Цель: проверить не только наличие RLS, а фактический путь backend service-key → DB → B2 → frontend и сопоставить его с product semantics.

## P0 — Homework submission authorization mismatch
`POST /api/v1/homeworks/{id}/submit` authenticates user, finds homework by id, но не проверяет membership пользователя в `homework.group_id`, затем создаёт/обновляет submission.
Authenticated user потенциально может отправить работу к homework другой группы, если знает UUID.
`file_id` также передаётся в submission без проверки ownership/access к файлу.
Целевой контракт: user → homework → group membership → allowed submission → own/accessibile file.

## P0 — Backend service-key bypass vs RLS
Live Supabase policies: homework_submissions_insert ограничивает user_id = auth.uid(); homeworks insert/update/delete — starosta-scoped; files_read_allowed — owner/group member; files_insert — owner.
SpaceWeb backend использует server-side DB/service access, поэтому RLS не заменяет route authorization.

## P0 — Homework creation semantic contradiction
Backend POST /homeworks разрешает создание студенту и автоматически выбирает первую active membership.
Live RLS при этом разрешает homeworks INSERT только is_group_starosta(group_id) + created_by = auth.uid().
Правильная student-first модель: обычный студент может создать предложение/черновик group homework; starosta может подтвердить его как shared/official. Если продукт намеренно разрешает студенту сразу публиковать group homework, RLS и backend должны быть синхронизированы явно.

## P0 — File upload group spoofing
`POST /files/upload` принимает group_id, visibility, specialty_slug от клиента и не проверяет membership в group_id, право публикации, допустимость visibility и соответствие specialty/group context.
Нужен server-derived context или строгая membership/role check.

## P0 — File download authorization mismatch
`GET /files/{id}/download` проверяет authenticated и specialty access, но не проверяет group membership/visibility перед выдачей B2 presigned URL.
Live RLS files_read_allowed разрешает group file только участнику группы. При server-side presign RLS может быть обойдён.

## P1 — FileRepository.listForUser semantic mismatch
listForUser() возвращает own + public files, но не group-visible files. Поэтому список и download имеют разные semantics.

## P1 — API cache is not identity-aware
apiCached() использует cache key = path only. Cacheable GET включает subjects, materials, lectures, tickets, subject-materials и trainers/feed.
SessionStorage key не содержит user id, group context, specialty или academic context. Если любой endpoint станет user/group-scoped, браузер может показать данные предыдущего session/user до TTL.
Target: cache key = identity/context fingerprint + path + relevant query, либо cache только endpoints, доказанно публичные. После logout/session switch — invalidate identity-scoped cache.

## P1 — Stale cache can hide permission/context changes
apiCached() возвращает stale successful data при NETWORK/UPSTREAM/DB_UNAVAILABLE/BAD_RESPONSE. Это допустимо только для explicitly stale-safe content.
Нужен allowlist stale-safe endpoints, а не общий fallback.

## P1 — Community RLS vs product contract
Live policy разрешает group_id IS NULL. Product contract требует group scope по умолчанию и явный global visibility. Нужен explicit visibility/type вместо implicit NULL.

## P1 — Comments DB lifecycle already exists
Live RLS имеет insert self, read allowed, update own, delete own. Поэтому comments не являются только DB gap; основной остаточный gap — API/UI lifecycle и report/moderation.

## P1 — Homework global rows inconsistent
HomeworkRepository::listForUser() включает h.group_id IS NULL. Live homework_read_group проверяет membership в homeworks.group_id. Backend direct-DB и Supabase RLS paths могут поэтому показывать разные наборы.
Нужно определить единую semantics для global homework.

## P1 — File metadata has multiple request sources
Upload path может брать group_id из JSON или multipart, visibility тоже из двух источников. Нужен единый normalized payload.

## P2 — B2 object ownership
Object key генерируется с user id, что полезно, но authorization никогда не должен опираться на naming. Решение о presigned URL должно приниматься по DB ACL/context.

# Pass 6 invariant
RLS не считается достаточной защитой, если backend использует service credentials.
Для каждого protected backend route: identify user → resolve academic/group context → authorize → query/write → return only authorized entity → authorize metadata before presign → keep primary/fallback semantics identical.

# New priority order
P0: homework submit group authorization; submission file authorization; file upload group authorization; file download group/visibility authorization; reconcile student-vs-starosta homework creation; verify service-key routes against RLS.
P1: identity-aware API cache; stale-safe endpoint allowlist; community explicit global/group visibility; homework global-vs-group consistency; file list/download consistency.