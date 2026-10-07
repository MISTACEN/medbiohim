# MEDBIOHIM — проверки, которые нельзя честно подтвердить текущими инструментами

Дата: 2026-10-07

Этот файл содержит только пункты, для которых исходники/структура БД позволяют сделать вывод о наличии реализации, но не дают доказательства фактического поведения целевого runtime.

## 1. Target runtime / deployment
- [ ] Последний backend commit реально установлен на SpaceWeb.
- [ ] Bootstrap.php + routes.php в целевом PHP runtime не дают Router type mismatch.
- [ ] /api/v1/auth/login, /api/v1/auth/me, refresh и bearer auth проходят полный authenticated smoke.
- [ ] Vercel production использует тот же commit, что и проверяемый frontend.
- [ ] SpaceWeb physical media: реальные Histology DOCX/JPG/PNG возвращают HTTP 200 и правильный MIME.
- [ ] Trainer images не дают 404/502 в реальном браузере.
- [ ] Последние media-derivative изменения работают на целевом PHP runtime.

## 2. Media processing
- [ ] Реальные GD/WebP/AVIF возможности целевого PHP подтверждены.
- [ ] Реальный binary derivative прошёл upload → file_variants → выдачу пользователю.
- [ ] Perceptual text/detail/artifact scoring реализован реальными измерениями, а не placeholder scores.
- [ ] Автоматическая очередь/worker derivative processing работает.
- [ ] EXIF/GPS stripping подтверждён на реальном изображении.
- [ ] Video 1080p/720p/480p derivatives и adaptive delivery проверены.
- [ ] Materials / Atlas / Trainer / Homework реально потребляют variants после генерации.
- [ ] Mobile Safari/Chrome и desktop browsers проверены на выдачу вариантов.

## 3. Data integrity
- [ ] Полный SQL cross-check questions ↔ test_questions с разделением намеренно standalone / archived / unpublished / orphaned.
- [ ] Полный cross-check exam_questions по subject/topic/test/ticket context.
- [ ] Полный physical reconciliation materials → content_sources → files/B2/SpaceWeb.
- [ ] Полный reconciliation trainer source_key/source_file_id → physical object → HTTP.
- [ ] Schedule academic session/semester/date consistency проверена на всех 309 schedule entries.

Причина: текущий connector runtime не позволил безопасно выполнить запрошенные read-only aggregate SQL-проверки в этой сессии, поэтому эти пункты не помечаются как verified.

## 4. Frontend/device acceptance
- [ ] iPhone Safari: dark/misaligned area полностью устранена.
- [ ] Mobile admin pagination и dense tables проверены реальным touch UI.
- [ ] Tests/preparation/trainers/materials checked на iOS/Android.
- [ ] Chrome/Edge/Firefox/Yandex desktop acceptance.
- [ ] Subject-loading perceived latency проверена на реальной сети.
- [ ] Answer/preparation delay проверена без искусственного mock backend.

## 5. AI
- [ ] GigaChat production credentials/network.
- [ ] Gemini через intended proxy path.
- [ ] Mistral/OpenRouter/Groq runtime credentials/policy.
- [ ] Smart answer checking: deterministic normalized match → optional AI semantic fallback → completion remains non-blocking при AI timeout/error.

## Правило
Ни один пункт выше не переводить в DONE только по наличию кода. Нужен runtime evidence: HTTP response, browser flow, server log, DB result или deployment result.