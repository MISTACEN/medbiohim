# Статус проекта — 2026-10-14

Краткий актуальный статус. История pass-отчётов не дублируется.

## Production

| Компонент | Состояние |
|-----------|-----------|
| Frontend (Vercel) | Работает, origin → SpaceWeb |
| SpaceWeb PHP API | Основной backend |
| Supabase | SoT, Auth, RLS |
| Cloudflare API Worker | Shadow only, **не** production traffic |
| Telegram | PHP/Node path; Cloudflare Worker — прототип |

## Cloudflare migration

Уже на shadow Worker (по последним отчётам в репо):

- Health / ping-подобные
- Auth me / profile aliases
- Groups list (GET)
- Subjects list / detail (read)
- Dashboard, schedule, homeworks (read)
- Tests catalog (read)
- Questions bank (read)
- Lectures (read)
- Search (read)
- Subjects-catalog, subject-plans
- Curriculum alias
- Subject-materials (read, без download_url без B2)
- Files read/download (source; runtime B2 secrets могут отсутствовать)

**Намеренно заблокировано (fail-closed):**

- Login / register — пока rate-limit enforcement не верифицирован
- Test attempt start / save / finish — пока нет secure answer snapshots + guarded scoring на Worker

**Ещё на SpaceWeb (критичные пробелы для cutover):**

- Files upload, materials file, histology source-file (физические media)
- Homework create / submit / grade
- Test attempts (write path)
- Preparation sessions
- Trainer feed answer + image
- Admin API целиком
- Settings, presence, Telegram link
- Community, notes, favorites, SRS, calculators, AI chat

Детальный чеклист: [SPACEWEB-API-INVENTORY.md](SPACEWEB-API-INVENTORY.md).

## Известные блокеры

1. **GitHub Actions** — jobs часто падают до allocation steps (runner). Локальные/Worker тесты ≠ CI green.
2. **Least-privilege DB migration** — committed, **не applied** на live Supabase без явного решения.
3. **B2 secrets** на Worker — нужны для реального download; без них fail-closed.
4. **Cutover** — не делать, пока student-facing parity + smoke с реальным JWT не пройдены.

## Следующие шаги (порядок)

1. Держать production на SpaceWeb.
2. Добивать read-only parity + live RLS smoke (валидный student JWT).
3. Узкие student-owned writes (homework progress, notes) после ownership/idempotency тестов.
4. Test attempts — только после snapshot/scoring модели на Worker.
5. Files/media + admin — позже, с явным least-privilege дизайном.
6. Vercel origin cutover — последним шагом, с rollback-планом.

## Baseline rollback

Технический baseline (не независимая prod-проверка): см. историю коммитов / предыдущие notes в `docs/history` после архивации.
