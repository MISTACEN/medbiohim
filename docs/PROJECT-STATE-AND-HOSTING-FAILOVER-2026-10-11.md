# MEDBIOHIM — единый снимок состояния и план отказоустойчивого хостинга

Дата фиксации: 2026-10-11  
Ветка-источник: `main`  
Последний подтверждённый в предыдущем аудите HEAD: `5a137cf6925d16bb292a172b2b58ef105e12d9b1` — `docs: link continuation snapshot and hosting strategy` (2026-10-11 03:00:14 UTC). Перед следующим изменением сверить актуальный HEAD через GitHub: состояние могло измениться после снимка.  
Режим этой записи: **фиксация и планирование, не внедрение**. В этой работе не менялись production, БД, секреты, деплои или настройки интеграций. Хостинговые кандидаты из пользовательского сообщения — идеи для проверки, не выбранные и не подключённые сервисы.

## 1. Что представляет собой проект

MEDBIOHIM — учебная платформа для самостоятельной подготовки студентов к экзаменам, тестам и зачётам, а не официальный сайт вуза. Принцип: «от студентов для студентов», student-first. Подтверждения ответственного лица нужны только там, где это оправдано; студент должен иметь возможность самостоятельно изучать материалы и управлять своей подготовкой. Проект некоммерческий по замыслу; аудитория на старте небольшая.

### Текущая основная архитектура — сохраняется

- GitHub `MISTACEN/medbiohim`, основная ветка `main`.
- Frontend: Next.js / React, деплой на Vercel.
- Основной API: PHP на SpaceWeb.
- Поток: браузер → Vercel `/api/v1` proxy → PHP API на SpaceWeb → Supabase.
- Supabase: PostgreSQL, Auth и прикладные данные.
- Большие материалы/файлы: SpaceWeb и существующая интеграция Backblaze B2 (`medbiohim-files`, приватный EU endpoint); фактическое наличие всех файлов в production-хранилищах проверяется отдельно.
- Telegram: отдельный webhook/Node MVP существует в `integrations/telegram-bot`; есть связка Telegram → Node webhook → PHP API. Не считать непрерывную работу 24/7 и полный пользовательский workflow подтверждёнными без live-тестов.
- Browser extension MVP: `integrations/browser-extension`, только быстрые ссылки; не расширение для чтения портала или извлечения сессионных данных.

Не заменять эту архитектуру новым провайдером. Дополнительные площадки рассматриваются как CDN/ускорение, резервный frontend/API ingress и аварийный региональный маршрут.

## 2. Последнее обновление и зафиксированные изменения

По доступному снимку `main`:
- Последний известный HEAD: `5a137cf6925d16bb292a172b2b58ef105e12d9b1`, обновление документации/continuation stamp.
- Предыдущие изменения затрагивали маршрутизацию Telegram → Node → PHP, проверки безопасности, регрессионные тесты и документацию.
- Последние Pass 65–73: явные `permissions: contents: read` во всех шести GitHub Actions workflow; исправлена YAML-вложенность в `.github/workflows/package-archives.yml` (commit `d566031d01e73f7a62a91e7502c9410456a9e6f2`). Исправление YAML подтвердило, что GitHub снова распознаёт workflow, но выполнение job всё ещё не началось.
- Ранее улучшен API proxy: для trainer API сохранён PHP-first, Supabase fallback выполняется только после upstream 404; приватные изображения получают `private, no-store`; наружу не выдаётся сырой текст ошибки 502.
- Добавлены статические/predeploy проверки, PHP regression tests, архивные проверки и smoke workflow, однако они не могут считаться пройденными, пока runner не запускает шаги.
- Созданы и поддерживаются `ROADMAP.md`, `PHASES_STATUS.md`, `SYNC_STAMP.md`, `docs/STUDENT-FIRST-MAP.md`, `docs/FUTURE-INTEGRATIONS-IDEAS-MAP.md`, `docs/UNFINISHED-REGISTRY.md`, отчёты по CI/PHP, данным и безопасности. Этот файл объединяет текущее состояние и hosting failover proposal; исторические отчёты сохраняются.

Ссылки:
- [Репозиторий](https://github.com/MISTACEN/medbiohim)
- [Roadmap](https://github.com/MISTACEN/medbiohim/blob/main/ROADMAP.md)
- [Фазы](https://github.com/MISTACEN/medbiohim/blob/main/PHASES_STATUS.md)
- [Незавершённые задачи](https://github.com/MISTACEN/medbiohim/blob/main/docs/UNFINISHED-REGISTRY.md)
- [Последний continuation handoff Pass 65–66](https://github.com/MISTACEN/medbiohim/blob/main/docs/CONTINUATION-HANDOFF-2026-10-10-PASS65-66.md)
- [Аудит целостности и привилегий БД](https://github.com/MISTACEN/medbiohim/blob/main/docs/DATA-SECURITY-INTEGRITY-WORKSTREAM-2026-10-10.md)
- [Сверка медиаматериалов гистологии](https://github.com/MISTACEN/medbiohim/blob/main/docs/HISTOLOGY-MEDIA-RECONCILIATION-2026-10-10.md)

## 3. Что подтверждено, что нет

Легенда: **есть в коде/истории** не означает, что это успешно работает в production. **Не подтверждено** означает отсутствие фактического успешного runtime/CI доказательства в текущем снимке.

### GitHub и CI

Подтверждено:
- Репозиторий private; основной источник изменений — `main`.
- Есть шесть workflow, включая code checks, smoke, архивирование/пакетирование, deploy backend и optional integrations.
- Workflow ограничены `contents: read`, кроме фактических deployment-требований, которые требуют отдельного аудита.
- В архивном workflow исправлена YAML-ошибка.

Не подтверждено / блокирует:
- GitHub Actions job завершаются до первого шага; raw job metadata: `runner_id: 0`, нет runner name, `steps: []`, нет логов. Это похоже на сбой назначения/инициализации runner, но точная первопричина не установлена.
- Примеры последних зафиксированных запусков: code-check `38101031997` (более поздний образец аудита), а в Pass 65–73 — `38025017750`, smoke `38025017788`, архив SpaceWeb `38025017818`, source package `38025017740`. Проверить текущий статус в [Actions](https://github.com/MISTACEN/medbiohim/actions).
- PHP lint, TypeScript, Next build, regression tests, архивные secret-leak guards и smoke tests **не считать прошедшими**.
- Нет lock-файла npm/yarn/pnpm: повторяемость установки зависимостей хуже.
- `next.config.ts` включает `eslint.ignoreDuringBuilds: true` и `typescript.ignoreBuildErrors: true`; отдельный predeploy audit пытается выполнять typecheck/build, но CI заблокирован.
- `eslint.config.mjs` почти не задаёт полезных правил; lint не является полноценным quality gate.
- Деплой workflow использует отключение проверки TLS-сертификата в FTP/FTPS пути (`curl -k` / `ssl:verify-certificate no`). Это риск, исправлять только после проверки правильного hostname/certificate и способа деплоя, не отключая production deployment вслепую.

### Vercel

Подтверждено:
- Команда `MISTACEN`, проект `medbiohim` обнаружен через интеграцию.
- Vercel Hobby указан как текущая основная frontend-площадка.

Не подтверждено:
- Интеграция не позволила прочитать проект/deploy/runtime: ответы 404/403, `linkedProjects: []`, `originConnections: []`; запрос к `https://medbiohim.vercel.app/api/v1/health` отклонён доступом инструмента.
- Поэтому текущий deployed commit, фактический статус последнего production deployment, env var names/наличие, runtime errors и live smoke **не подтверждены**. Это не доказывает, что сайт недоступен пользователям. Требуется восстановить/проверить авторизацию Vercel connector для правильной команды/проекта.
- Не выполнять повторный deploy без устранения/понимания CI и без доступного runtime smoke.

### Supabase

Подтверждено предыдущим read-only аудитом:
- Project ref `gnobvyjywtqbdfeejxmf`, регион `eu-west-1`, состояние `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166.
- 83 таблицы в `public`; RLS включён на всех 83; в просмотренных политиках не было широких anonymous/public INSERT/UPDATE/DELETE политик.
- Зафиксированы лишние права `MAINTAIN`, `TRUNCATE`, `REFERENCES`, `TRIGGER` у клиентских ролей на большом числе таблиц. RLS не защищает от `TRUNCATE`, поэтому права надо минимизировать.
- Миграция `database/migrations/20261010_revoke_non_rls_table_privileges.sql` создана, но **не применена к live Supabase**.
- Security Advisor: `security_definer_view` на `public.trainer_feed_cards_public`; предупреждение по execute у authenticated для `submit_trainer_feed_answer(...)`; отключена защита от утёкших паролей.
- View отфильтровывает опубликованные карточки и удаляет ключи правильных ответов; RPC проверяет авторизованного пользователя/карточку/ответ и пишет от его имени. Это требует осторожной проверки, а не слепого удаления SECURITY DEFINER или переключения view на security_invoker.
- Performance Advisor сообщал о 44 отсутствующих FK-индексах уровня INFO; оценивать по workload/EXPLAIN, не создавать все автоматически.
- В журнале видимых managed migrations последняя применённая — `20261008153906 adjust_spaceweb_pgsql_sslmode`; миграции в репозитории находятся в `database/migrations`, не в `supabase/migrations`. Нужно сверить историю миграций и схему, не повторять SQL вслепую.
- В прошлой выборке за заданные 24 часа не было строк postgres ERROR/FATAL/PANIC; это ограниченная выборка, не гарантия полного здоровья приложения.
- Проверка данных: 854 связей test-question, без дублей/битых ссылок; 32/32 опубликованных активных тестов связаны с вопросами, 660/660 активных опубликованных вопросов связаны с тестами; 776 опубликованных exam_questions с prompt; 719 пустых ответов похожи на open-ticket/preparation records — не автозаполнять; 5 legacy subject rows с NULL slug не являются orphan. Снимок был read-only.
- Гистология: 5 ticket banks сохранены; 28 опубликованных electronograms, source keys/imagePath непустые, но physical file presence/HTTP response в SpaceWeb/B2 не подтверждены. В предыдущей сверке 23 exact matches + 5 mismatch/truncated-looking; отдельно в sync stamp есть более старый счётчик 0 matches по `content_sources.source_path` — эти разные сравнения не смешивать.

### PHP backend / API

Есть в коде:
- PHP API на SpaceWeb, центральный Vercel proxy.
- Проверки прав/роль-проверки и несколько hardening commits.
- Telegram webhook → Node → PHP API маршрут.
- Trainer fallback, кэш-изоляция приватных изображений, generic proxy error.

Не закрыто / требует проверки:
- Полный PHP lint/type-ish checks, все routes, SQL, RLS/authorization, резервные ветви и error paths не прошли фактический CI.
- Ранее зарегистрированные проблемы требуют повторной проверки после последних фиксов: дубли ContentStore method; отсутствующие B2 columns; RLS для homework_submissions; self role assignment; отсутствие `/auth/register` и неполный `/auth/me`; enum для finished; старая схема questions; dashboard 500/UNAUTHORIZED bearer; `AccountSettingsService::getPreferences()` undefined; auth/schedule 401; trainer images 404/502; тип closure Router mismatch в routes.php; test session check rejects `cancelled`. Это **исторический список потенциальных/ранее найденных дефектов**, не утверждение, что каждый всё ещё воспроизводится: нужно сверить с актуальным HEAD и прогнать тесты.
- В одном fallback error path ранее замечен риск передачи `details: data` с исходным PostgREST error JSON. Перепроверить актуальный код; внешние ответы должны быть стабильными и без сырых SQL/upstream деталей.
- Production SpaceWeb файловая структура, env config, реальные media и PHP HTTP endpoints не были полностью проверены в этом аудите.

### OpenAI Platform / LLM

- Connector OpenAI Platform поддерживает создание/настройку ключей, но не подтверждает фактический usage/значения секретов. В этом аудите ключи не создавались и не читались.
- `LlmGateway.php` general chat может использовать `LLM_PRIMARY_API_KEY` / `LLM_API_KEY` / fallback `OPENAI_API_KEY`; при OpenAI fallback base defaults to `https://api.openai.com/v1`, model default `gpt-4o-mini`.
- `OPENAI_API_KEY` отсутствует в `.env.example` и `docs/ENV-CONFIG-MAP.md` — документация конфигурации не полная.
- Persistent AI chat provider chain defaults to Groq and then Groq/GigaChat/Gemini/Mistral/OpenRouter; OpenAI не является явным провайдером этого chain. Vision chain использует Gemini/OpenRouter.
- Проверка свободного ответа сначала deterministic exact/MCQ; LLM вызывается только для не точного free-text с reference answer, должен игнорировать орфографию, а confidence <0.65 даёт pending. Нужно проверять на тестах.
- `LLM_ALLOW_GLOBAL` по умолчанию true: необходимо явно решить privacy boundary для передачи учебных ответов/вопросов внешнему провайдеру и документировать, какие данные уходят наружу.

### Telegram и расширение

- `integrations/telegram-bot`: отдельный Node webhook MVP; commands /start, /help, /app, /site, /schedule, /tests, /subjects, /materials, /privacy; опциональная relay-связка с PHP через HTTPS и shared secret; предусмотрены POST-only, timing-safe secret compare, body cap, timeout и минимизация логов.
- README описывает bot как не привязанный к аккаунту студента, без DB/private student data в базовом режиме. Продвинутая обработка домашних заданий, распознавание/классификация, OCR/vision, агрегация сообщений, due dates, confidence workflow, привязка аккаунтов и UI вложений — не считать завершёнными без проверки.
- Separate Vercel deployment/root directory for Telegram bot не подтверждён.
- `integrations/browser-extension`: Manifest V3 quick links; без host permissions и чтения истории/токенов; тесты не выполнены из-за CI.
- B2 service exists in code; actual credentials/config and real file existence/serving not confirmed.

## 4. Hosting / resilience strategy — proposed, not yet implemented

### User's required order

1. **Primary international** — existing Vercel + SpaceWeb + Supabase remains the primary stack. Do not replace it.
2. **Fast international path** — add a complementary edge/CDN/ingress path for static assets and/or selected public endpoints, to reduce latency and mitigate provider- or ISP-specific reachability issues. Keep the current Vercel → SpaceWeb PHP API path intact initially.
3. **Secondary international frontend/entry** — deploy a separate copy to a different provider so that if one provider/domain is unreachable from a particular ISP, another independent hostname can work. It should be deployable from the same `main` source but should not automatically write/deploy to production without verification.
4. **Russian fallback, last resort** — separate Russian-hosted frontend mirror for a broad international provider outage/blocking scenario. User explicitly prefers international services as primary and Russian hosting as secondary/emergency; updates on Russian mirror can lag slightly, but must not drift indefinitely. It must never become the primary data authority.
5. **Telegram bot** — choose a dedicated, free where possible, no-card host with persistent webhook/runtime and reliable outbound HTTPS. It should remain operational independently from the frontend deployment. Avoid services needing daily manual renewals for the primary bot.

### Routing principle

- A second frontend does not automatically fix a failed API. Frontend, API ingress, media/CDN and database are separate failure domains.
- Preserve one canonical backend/database (PHP + Supabase) initially; avoid dual-writes or independent databases.
- Use a health check/monitoring and a small static status/diagnostics page. Document alternate URLs in a stable place.
- Failover can be manual at first (clear primary/secondary/emergency links), safer than DNS automation with untested health checks. Test from multiple networks (home Wi-Fi, mobile data, VPN-off, and if possible another ISP/region).
- A static or edge mirror can display cached public learning content but must not silently claim that login, submissions, homework, schedules or private materials work while the API is unavailable.
- Do not copy Supabase credentials/service-role secrets into client-side bundles. Never mirror private user data to a public static host.
- Same source of truth: GitHub `main`; primary international deploy first, secondary international after successful build/smoke, Russian mirror last. If CI remains broken, manual release must include explicit local build/test evidence and a recorded commit SHA.
- For static assets, consider edge CDN/cache separately from app compute. Keep private media uncacheable; cache only public immutable assets with versioned URLs.
- All hosters are candidates until account creation, no-card eligibility, build/deploy, HTTPS, limits and test availability are verified. Free tiers can change.

### Candidate screening — based on official pricing/docs checked 2026-10-11

**Best first candidate for edge/API adjunct: Cloudflare Workers + Pages**
- Official Workers docs currently show Free: 100,000 requests/day, 10 ms CPU per invocation, 128 MB memory; limits apply and exceeding the daily request cap can fail. Suitable for small webhook/API routing and lightweight edge logic, not as a direct replacement for PHP runtime or long CPU jobs. Source: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- Pages static asset requests are free/unlimited; Pages Functions count against Workers request quota; Pages free plan shows 500 builds/month and a 20-minute build timeout. Source: [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/) and [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).
- Recommended role: edge cache/static assets and optionally a small health/redirect/API ingress layer. Do not port all PHP endpoints before a separate compatibility study. Test account signup/verification and custom-domain requirements rather than assuming all features are available without a card.
- Important: Cloudflare edge improves latency/reachability only where Cloudflare itself is reachable; it does not guarantee bypass of ISP filtering.

**Second international frontend candidate: Netlify or Cloudflare Pages**
- Cloudflare Pages is a strong candidate for static/mostly-static fallback, but MEDBIOHIM is Next.js and needs a real build compatibility test for the actual App Router/server API usage. Static export will not replace authenticated dynamic pages/API.
- Netlify remains a candidate from the user's list, but current quotas and no-card onboarding were not independently verified in this pass. Compare only after testing the exact Next.js build, server rendering requirements, and free-tier rules.

**Russian emergency frontend: Layero, with ONREZA as alternative**
- Official Layero Free docs currently say 0 ₽, up to 5 projects, HTTPS on `*.layero.app`, Git deploy/CLI and runtime apps including Next.js SSR; no custom domains, indexing, analytics or observability on Free. Usage docs show quotas including 15 GB outgoing traffic, 300k requests and 6,000 app runtime minutes per period, with platform-specific accounting. Sources: [Layero pricing](https://layero.ru/pricing), [Next.js hosting](https://www.layero.ru/hosting-nextjs.html), [usage limits](https://docs.layero.ru/billing/usage/).
- Layero is a promising Russian last-resort mirror because its documented Free plan explicitly includes Next.js SSR, but its exact production limits, terms, provider reliability and signup must be tested. Free subdomain only; own domain is Pro.
- ONREZA official Free plan currently advertises no card, 250 ₽ monthly usage credit, Git integration and up to five custom domains/SSL. Source: [ONREZA pricing](https://onreza.ru/pricing.html). It is an alternative candidate, but the free usage credit means it is not necessarily unlimited/free under load; calculate actual consumption before choosing.
- Use Russian host only as an independently accessible emergency copy; no separate database or independent mutable source of truth.

**Telegram bot host: shortlist, choose only after tests**
- **First to test: Cloudflare Workers** for webhook-style bot if implementation is compatible with Workers runtime and all state can be kept in existing PHP/Supabase services. Advantages: no sleeping server; official Free limit 100,000 requests/day and low CPU budget. It is not a drop-in Node server if code relies on unsupported Node APIs, persistent processes, or large dependencies. Run compatibility test first.
- **Alternative: Layero Free runtime** if current Node webhook needs conventional runtime and the free runtime limits are enough; verify that a long-running Node process/webhook is supported and stable, not merely SSR/runtime app support.
- **Avoid FPS.ms as primary bot** despite advertised CPU/RAM: official docs confirm free-server expiry/suspension and renewal windows (e.g. Discord bot 24 h); it introduces manual renewal and risk of downtime. Could be a disposable test environment only. Source: [FPS.ms renewal docs](https://docs.fps.ms/getting-started/how-server-renewal-works).
- Hugging Face Spaces, Render, Railway, Replit, Deta Space, Prisma Compute, Restate Cloud, rawhq, Telebot Creator, FreeTierBot, ONREZA, Netlify and other names from the user list remain **unverified candidates** for card requirements, current limits, persistent background execution, privacy, outbound networking and actual project fit. Some are not equivalent to general-purpose web hosts. Do not adopt based on a copied list alone.
- Deta Space's historical availability/continuity and exact current product status must be verified before any use; do not assume its old 10 GB claim still applies.
- Railway's promotional credits and Render's sleep/usage behavior are time-sensitive and need checking against current official plan pages before selection.
- GitHub Pages, GitVerse Pages, SourceCraft Sites, S3 static hosting and Cloudflare Drop/AgentScale can be considered only for static emergency pages/assets, not full authenticated Next.js + PHP functionality. Temporary 1-hour links are not production failover.

### Suggested initial target topology (proposal only)

- Primary: Vercel frontend → existing SpaceWeb PHP API → existing Supabase; existing SpaceWeb/B2 media remains.
- Edge: Cloudflare for public static assets/CDN and a small independent status/health route; consider API proxy only after compatibility/security review.
- Secondary international frontend: Cloudflare Pages or Netlify, exact choice pending a real build test; independent hostname and documented read-only fallback behavior.
- Russian emergency frontend: Layero Free first to test Next.js SSR and free subdomain; ONREZA as alternative. Same source, deployed later, no private data cache.
- Bot: test Cloudflare Workers webhook port first; Layero runtime as fallback if Workers incompatibility; do not use FPS.ms as primary due renewal.
- Data: one Supabase project and one canonical PHP API; no cross-host dual writes. For bot critical messages, use idempotency/deduplication and persistent storage in existing backend/DB.
- This is not yet an implementation decision; no accounts, domains, DNS, webhook endpoints, secrets or deployment targets were changed.

## 5. Priority queue — what to do next

### P0 — establish trustworthy baseline
1. Re-read current `main` HEAD and check changes after this snapshot.
2. Restore GitHub Actions runner execution: inspect repo/org Actions policy, billing/usage and runner availability; contact GitHub Support if no policy issue explains `runner_id: 0`.
3. Once jobs execute, run real frontend typecheck/build, PHP lint and regression tests, route scan, SQL/RLS contract tests, archive leak checks, smoke tests. Capture logs and commit SHA.
4. Restore Vercel connector/project/deployment access and confirm current production commit/runtime status.
5. Review FTP/FTPS certificate verification in deploy workflow safely.

### P1 — security and database integrity
6. Review/rehearse Supabase least-privilege migration on staging or in a controlled transaction/rollback plan; verify effective privileges before production approval.
7. Review `trainer_feed_cards_public` SECURITY DEFINER view and answer RPC against actual grants/RLS; preserve answer secrecy and grading writes.
8. Reconcile managed migration history with repository migration files without blindly replaying migrations.
9. Recheck auth role escalation, homework submission RLS, `/auth/me`, schedule/auth 401s, settings preferences, enum/status handling, trainer image paths and error disclosure.
10. Document LLM providers, environment variables, outbound data/privacy and deterministic-vs-AI grading behavior.

### P2 — availability and hosting
11. Prototype Cloudflare Worker webhook compatibility in a separate test project/preview, no production secrets initially.
12. Build the exact Next.js project on Cloudflare Pages/Netlify and Layero/ONREZA; record SSR/API compatibility, deployment time, limits, free/no-card status and test URLs.
13. Decide which public assets can be cached safely; keep private media `private, no-store`.
14. Add an explicit status page and fallback links; test from multiple networks. Only then consider automation.
15. Bot migration only after webhook signature/secret, duplicate updates, retry semantics, persistent state, rate limits and observability are tested.

## 6. Explicit exclusions / don't do yet

- Do not replace Vercel → SpaceWeb or Supabase.
- Do not select a provider only because a third-party list claims “free/no card”.
- Do not use a daily-renewal server for the primary 24/7 bot.
- Do not make the Russian mirror the canonical source or let it drift without a documented release SHA.
- Do not expose service-role keys, bot tokens or upstream database error payloads to the browser.
- Do not auto-apply the Supabase privilege migration or change SECURITY DEFINER/view grants without staging/rollback verification.
- Do not call CI green until jobs have actual steps and logs.
- Do not mark historical bugs as fixed solely because a commit exists; re-test against current main and production.
- Avoid unnecessary branches and micro-pass reports; group work by domain and keep the roadmap/status/handoff aligned.

## 7. Definition of done for this snapshot

This file records the known state and candidate architecture. It does **not** mean the problems have been repaired or that new hosts are connected. Before the next development pass, treat the items above as the restart point, verify current HEAD, then work in small batches with evidence and update the roadmap/status after each completed workstream.
