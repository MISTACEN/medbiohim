<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Database\Connection;
use Medbiohim\Services\SpecialtyAccess;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Middleware\RequireRole;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Repositories\ScheduleRepository;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Repositories\UserRepository;
use Medbiohim\Services\B2Storage;
use Medbiohim\Services\ProgressService;
use Medbiohim\Services\ScheduleRestStore;
use Medbiohim\Services\SupabaseRest;
use Medbiohim\Support\ContentStore;

return static function (Router $router): void {

    // --- ultra-safe probe (no heavy deps) ---
    $router->get('/api/v1/debug/ping', static function (Request $req, array $params): void {
        Response::success([
            'pong' => true,
            'php' => PHP_VERSION,
            'time' => date('c'),
            'has_ContentStore' => class_exists(ContentStore::class),
            'has_UserRepository' => class_exists(UserRepository::class),
            'has_ScheduleRepository' => class_exists(ScheduleRepository::class),
        ], $req->requestId);
    });

    $router->get('/api/v1/debug/dashboard-probe', static function (Request $req, array $params): void {
        $out = ['steps' => []];
        try {
            $out['steps'][] = 'php:'.PHP_VERSION;
            $out['steps'][] = 'ContentStore:'.(class_exists(ContentStore::class)?'yes':'no');
            if (class_exists(ContentStore::class)) {
                try {
                    $store = new ContentStore();
                    $out['steps'][] = 'site:ok';
                    try { $out['site'] = $store->getSite(); } catch (\Throwable $e) { $out['steps'][] = 'getSite:'.$e->getMessage(); }
                    try { $out['ann'] = count($store->listAnnouncements()); } catch (\Throwable $e) { $out['steps'][] = 'ann:'.$e->getMessage(); }
                    try { $out['sched_n'] = count($store->listSchedule()); } catch (\Throwable $e) { $out['steps'][] = 'sched:'.$e->getMessage(); }
                } catch (\Throwable $e) {
                    $out['steps'][] = 'ContentStore:'.$e->getMessage();
                }
            }
        } catch (\Throwable $e) {
            $out['steps'][] = 'fatal:'.$e->getMessage();
        }
        Response::success($out, $req->requestId);
    });

    // --- dashboard always 200 ---
    $router->get('/api/v1/dashboard', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $profile = [
            'user' => $req->user->toArray(),
            'roles' => $req->user->role ? [$req->user->role] : [],
            'groups' => [],
        ];
        $homeworks = [];
        $tests = [];
        $schedule = [];
        $scheduleSource = 'none';
        $site = ['title' => 'Медбиохим'];
        $announcements = [];
        try {
            try {
                $profile = (new UserRepository())->profileBundle($req->user->id);
            } catch (\Throwable $e) {
                try { $profile = SupabaseRest::profileBundle($req->user->id, $req->bearerToken()); } catch (\Throwable $x) {}
            }
            try {
                $homeworks = (new HomeworkRepository())->listForUser($req->user->id);
                if (!is_array($homeworks)) $homeworks = [];
            } catch (\Throwable $e) { $homeworks = []; }
            try {
                $tests = (new TestRepository())->listPublished(null);
                if (!is_array($tests)) $tests = [];
            } catch (\Throwable $e) { $tests = []; }
            try {
                $store = new ContentStore();
                try { $site = $store->getSite(); } catch (\Throwable $e) {}
                try { $announcements = array_slice($store->listAnnouncements(), 0, 10); } catch (\Throwable $e) {}
            } catch (\Throwable $e) {}
            // Live dashboard schedule uses the same Supabase source as CMS.
            try {
                $tz = new \DateTimeZone('Asia/Vladivostok');
                $today = new \DateTimeImmutable('now', $tz);
                $from = $today->format('Y-m-d');
                // Dashboard needs current/future events, not the first N rows of the semester.
                $to = $today->modify('+42 days')->format('Y-m-d');
                $items = (new ScheduleRepository())->listForUser($req->user->id, $from, $to);
                $schedule = is_array($items) ? $items : [];

                // Supabase is the source of truth. Retry through REST when direct DB is empty.
                if (count($schedule) === 0) {
                    try {
                        $restItems = (new ScheduleRestStore())->listForUser(
                            $req->user->id,
                            $from,
                            $to,
                            $req->bearerToken()
                        );
                        if (is_array($restItems) && count($restItems) > 0) {
                            $schedule = $restItems;
                            $scheduleSource = 'supabase_rest';
                        } else {
                            $scheduleSource = 'db_empty';
                        }
                    } catch (\Throwable $restError) {
                        $scheduleSource = 'unavailable';
                    }
                } else {
                    $scheduleSource = 'db';
                }
            } catch (\Throwable $e) {
                try {
                    $items = (new ScheduleRestStore())->listForUser(
                        $req->user->id,
                        $from,
                        $to,
                        $req->bearerToken()
                    );
                    $schedule = is_array($items) ? $items : [];
                    $scheduleSource = 'supabase_rest';
                } catch (\Throwable $restError) {
                    $schedule = [];
                    $scheduleSource = 'unavailable';
                }
            }
        } catch (\Throwable $e) {}
        Response::success([
            'profile' => $profile,
            'site' => is_array($site) ? $site : ['title' => 'Медбиохим'],
            'announcements' => is_array($announcements) ? $announcements : [],
            'schedule' => is_array($schedule) ? $schedule : [],
            'schedule_source' => $scheduleSource,
            'homeworks' => is_array($homeworks) ? $homeworks : [],
            'tests' => is_array($tests) ? $tests : [],
        ], $req->requestId);
    });

    // --- trainer feed ---
    $router->get('/api/v1/trainers/feed', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $subjectSlug = trim((string) ($req->query['subject'] ?? ''));
        $specialtySlug = trim((string) ($req->query['specialty'] ?? ''));
        $limit = max(1, min(500, (int) ($req->query['limit'] ?? 30)));
        $offset = max(0, (int) ($req->query['offset'] ?? 0));

        if ($subjectSlug === 'histology' || $specialtySlug === 'mbh') {
            if (!(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
                Response::error('FORBIDDEN', 'Тренажёр по гистологии доступен только специальности МБХ', $req->requestId, 403);
                return;
            }
        }

        $items = [];
        $source = 'db';

        try {
            $sql = 'SELECT c.id, c.subject_id, c.subject_slug, c.specialty_slug, c.mode_set,
                           c.preparation, c.hotspots, c.question, c.tags, c.difficulty, c.source_key, c.source_file_id,
                           c.is_published, c.created_at, c.updated_at,
                           c.plan_module_id, c.plan_topic_id,
                           tm.title AS plan_module_title, tt.title AS plan_topic_title
                    FROM public.trainer_feed_cards c
                    LEFT JOIN public.modules tm ON tm.id = c.plan_module_id
                    LEFT JOIN public.topics tt ON tt.id = c.plan_topic_id
                    WHERE c.is_published = true';
            $paramsSql = [];

            if ($subjectSlug !== '') {
                $sql .= ' AND c.subject_slug = :subject_slug';
                $paramsSql['subject_slug'] = $subjectSlug;
            }
            if ($specialtySlug !== '') {
                $sql .= ' AND c.specialty_slug = :specialty_slug';
                $paramsSql['specialty_slug'] = $specialtySlug;
            }

            $sql .= ' ORDER BY c.id LIMIT :limit OFFSET :offset';
            $stmt = Connection::pdo()->prepare($sql);
            foreach ($paramsSql as $key => $value) $stmt->bindValue($key, $value);
            $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue('offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $items = $stmt->fetchAll() ?: [];

            if (count($items) === 0) {
                $path = 'trainer_feed_cards?is_published=eq.true&select=' . rawurlencode(
                    'id,subject_id,subject_slug,specialty_slug,mode_set,preparation,hotspots,question,tags,difficulty,source_key,source_file_id,is_published,created_at,updated_at,plan_module_id,plan_topic_id,plan_module:modules(title),plan_topic:topics(title)'
                );
                if ($subjectSlug !== '') $path .= '&subject_slug=eq.' . rawurlencode($subjectSlug);
                if ($specialtySlug !== '') $path .= '&specialty_slug=eq.' . rawurlencode($specialtySlug);
                $path .= '&order=id.asc&limit=' . $limit . '&offset=' . $offset;
                $items = SupabaseRest::select($path);
                $source = 'supabase_rest';
            }
        } catch (Throwable $e) {
            try {
                $path = 'trainer_feed_cards?is_published=eq.true&select=' . rawurlencode(
                    'id,subject_id,subject_slug,specialty_slug,mode_set,preparation,hotspots,question,tags,difficulty,source_key,source_file_id,is_published,created_at,updated_at,plan_module_id,plan_topic_id,plan_module:modules(title),plan_topic:topics(title)'
                );
                if ($subjectSlug !== '') $path .= '&subject_slug=eq.' . rawurlencode($subjectSlug);
                if ($specialtySlug !== '') $path .= '&specialty_slug=eq.' . rawurlencode($specialtySlug);
                $path .= '&order=id.asc&limit=' . $limit . '&offset=' . $offset;
                $items = SupabaseRest::select($path);
                $source = 'supabase_rest';
            } catch (Throwable $fallback) {
                Response::error('TRAINER_ERROR', 'Не удалось загрузить тренажёр', $req->requestId, 503);
                return;
            }
        }

        foreach ($items as &$item) {
            foreach (['preparation', 'hotspots', 'question', 'tags'] as $jsonKey) {
                if (isset($item[$jsonKey]) && is_string($item[$jsonKey])) {
                    $decoded = json_decode($item[$jsonKey], true);
                    if (is_array($decoded)) $item[$jsonKey] = $decoded;
                }
            }
        }
        unset($item);

        // PostgREST fallback returns embedded rows; flatten them to *_title fields.
        foreach ($items as &$item) {
            foreach (['plan_module' => 'plan_module_title', 'plan_topic' => 'plan_topic_title'] as $embed => $flat) {
                if (isset($item[$embed])) {
                    if (is_array($item[$embed])) $item[$flat] = $item[$embed]['title'] ?? null;
                    unset($item[$embed]);
                }
            }
        }
        unset($item);

        Response::success([
            'items' => array_values($items),
            'limit' => $limit,
            'offset' => $offset,
            'source' => $source,
        ], $req->requestId);
    });

    $router->get('/api/v1/trainers/feed/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT c.id, c.subject_id, c.subject_slug, c.specialty_slug, c.mode_set,
                        c.preparation, c.hotspots, c.question, c.tags, c.difficulty, c.source_key, c.source_file_id,
                        c.is_published, c.created_at, c.updated_at,
                        c.plan_module_id, c.plan_topic_id,
                        tm.title AS plan_module_title, tt.title AS plan_topic_title
                 FROM public.trainer_feed_cards c
                 LEFT JOIN public.modules tm ON tm.id = c.plan_module_id
                 LEFT JOIN public.topics tt ON tt.id = c.plan_topic_id
                 WHERE c.id = :id AND c.is_published = true
                 LIMIT 1'
            );
            $stmt->execute(['id' => (string) ($params['id'] ?? '')]);
            $item = $stmt->fetch();
            if ($item !== false) {
                foreach (['preparation', 'hotspots', 'question', 'tags'] as $jsonKey) {
                    if (isset($item[$jsonKey]) && is_string($item[$jsonKey])) {
                        $decoded = json_decode($item[$jsonKey], true);
                        if (is_array($decoded)) $item[$jsonKey] = $decoded;
                    }
                }
            }
            if ($item === false) {
                Response::error('NOT_FOUND', 'Trainer card not found', $req->requestId, 404);
                return;
            }

            if ((string) ($item['specialty_slug'] ?? '') === 'mbh'
                && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
                Response::error('FORBIDDEN', 'Карточка доступна только специальности МБХ', $req->requestId, 403);
                return;
            }

            Response::success(['item' => $item], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('TRAINER_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->post('/api/v1/trainers/feed/answer', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $cardId = trim((string) $req->json('card_id', ''));
        if ($cardId === '') {
            Response::error('VALIDATION_ERROR', 'card_id required', $req->requestId, 422);
            return;
        }

        try {
            $db = Connection::pdo();
            $cardStmt = $db->prepare(
                'SELECT id, specialty_slug, question
                 FROM public.trainer_feed_cards
                 WHERE id = :id AND is_published = true
                 LIMIT 1'
            );
            $cardStmt->execute(['id' => $cardId]);
            $card = $cardStmt->fetch(PDO::FETCH_ASSOC);
            if ($card === false) {
                Response::error('NOT_FOUND', 'Trainer card not found', $req->requestId, 404);
                return;
            }

            if ((string) ($card['specialty_slug'] ?? '') === 'mbh'
                && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
                Response::error('FORBIDDEN', 'Карточка доступна только специальности МБХ', $req->requestId, 403);
                return;
            }

            $question = is_array($card['question'] ?? null)
                ? $card['question']
                : (json_decode((string) ($card['question'] ?? '{}'), true) ?: []);
            $givenOption = trim((string) $req->json('option_id', ''));
            $givenText = trim((string) $req->json('answer_text', ''));
            $isSkipped = (bool) $req->json('is_skipped', false);
            $timeMs = $req->json('time_ms');
            $correct = null;

            foreach (($question['options'] ?? []) as $option) {
                if ((string) ($option['id'] ?? '') === $givenOption) {
                    $correct = (bool) ($option['correct'] ?? false);
                    break;
                }
            }

            $answerText = $givenText !== '' ? $givenText : ($givenOption !== '' ? $givenOption : null);
            $ins = $db->prepare(
                'INSERT INTO public.trainer_feed_answers
                   (user_id, card_id, option_id, answer_text, is_skipped, is_correct, time_ms)
                 VALUES (:uid, :cid, :oid, :answer_text, :skipped, :correct, :time_ms)
                 RETURNING id, card_id, option_id, answer_text, is_skipped, is_correct, time_ms, created_at'
            );
            $ins->execute([
                'uid' => $req->user->id,
                'cid' => $cardId,
                'oid' => $givenOption !== '' ? $givenOption : null,
                'answer_text' => $answerText,
                'skipped' => $isSkipped,
                'correct' => $isSkipped ? null : $correct,
                'time_ms' => is_numeric($timeMs) ? (int) $timeMs : null,
            ]);

            Response::success(['answer' => $ins->fetch(), 'correct' => $isSkipped ? null : $correct], $req->requestId, 201);
        } catch (\Throwable $e) {
            Response::error('TRAINER_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/trainers/feed/{id}/image', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT source_key, source_file_id, specialty_slug, preparation
                 FROM public.trainer_feed_cards
                 WHERE id = :id AND is_published = true
                 LIMIT 1'
            );
            $stmt->execute(['id' => (string) ($params['id'] ?? '')]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row === false) {
                Response::error('NOT_FOUND', 'Image not found', $req->requestId, 404);
                return;
            }

            if ((string) ($row['specialty_slug'] ?? '') === 'mbh'
                && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
                Response::error('FORBIDDEN', 'Медиа доступно только специальности МБХ', $req->requestId, 403);
                return;
            }

            if (!empty($row['source_file_id'])) {
                $fileStmt = Connection::pdo()->prepare(
                    'SELECT object_key FROM public.files WHERE id = :id AND status = \'active\' LIMIT 1'
                );
                $fileStmt->execute(['id' => (string) $row['source_file_id']]);
                $file = $fileStmt->fetch(PDO::FETCH_ASSOC);
                if ($file !== false && !empty($file['object_key'])) {
                    $storage = new B2Storage();
                    if ($storage->isConfigured()) {
                        try {
                            $url = $storage->presignedDownloadUrl((string) $file['object_key'], 3600);
                            header('Location: ' . $url, true, 302);
                            exit;
                        } catch (\Throwable $e) {
                            // Fall through to the backend-local media path.
                        }
                    }
                }
            }

            // Trainer cards store the canonical deployed media path in preparation.imageUrl.
            // source_key is an opaque content identifier and must not be treated as a filesystem path.
            $preparation = [];
            if (isset($row['preparation'])) {
                $decoded = json_decode((string) $row['preparation'], true);
                if (is_array($decoded)) $preparation = $decoded;
            }
            $imageUrl = is_string($preparation['imageUrl'] ?? null) ? trim($preparation['imageUrl']) : '';
            $relative = ltrim(str_replace('\\', '/', $imageUrl), '/');
            $relative = preg_replace('#^content/histology/#', '', $relative) ?? $relative;
            if ($relative === '' || str_contains($relative, '..')) {
                Response::error('MEDIA_INVALID', 'Invalid media path', $req->requestId, 422);
                return;
            }

            // The histology media installer writes to content/histology. Keep
            // HISTOLOGY_MEDIA_ROOT configurable, but use that deployed tree by
            // default instead of the obsolete storage/histology path.
            $root = rtrim((string) (getenv('HISTOLOGY_MEDIA_ROOT') ?: (__DIR__ . '/../../../content/histology')), '/');
            $path = realpath($root . '/' . $relative);
            $rootReal = realpath($root);

            // Older trainer cards stored photo paths without the "photos/" segment,
            // while the canonical media installer deploys them under
            // content/histology/photos/5_Фотографии препаратов/...
            // Keep both representations readable so existing Supabase cards do not
            // need a destructive data rewrite.
            if ($path === false && str_starts_with($relative, '5_Фотографии препаратов/')) {
                $legacyPhotoPath = $root . '/photos/' . $relative;
                $path = realpath($legacyPhotoPath);
            }

            if ($rootReal === false || $path === false || !str_starts_with($path, $rootReal . DIRECTORY_SEPARATOR) || !is_file($path)) {
                Response::error('MEDIA_NOT_FOUND', 'Original media is not deployed on the backend yet', $req->requestId, 404);
                return;
            }

            $mime = function_exists('mime_content_type') ? (string) mime_content_type($path) : 'application/octet-stream';
            header('Content-Type: ' . ($mime !== '' ? $mime : 'application/octet-stream'));
            header('Cache-Control: private, max-age=86400');
            readfile($path);
            exit;
        } catch (\Throwable $e) {
            Response::error('MEDIA_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

// --- schedule ---
    $router->get('/api/v1/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        // Supabase is the single source of truth for the live schedule.
        $items = [];
        $source = 'db';
        try {
            $items = (new ScheduleRepository())->listForUser($req->user->id);
            $items = is_array($items) ? $items : [];

            // Prefer live Supabase REST data when the direct DB path returns no rows.
            if (count($items) === 0) {
                try {
                    $restItems = (new ScheduleRestStore())->listForUser(
                        $req->user->id,
                        null,
                        null,
                        $req->bearerToken()
                    );
                    if (is_array($restItems) && count($restItems) > 0) {
                        $items = $restItems;
                        $source = 'supabase_rest';
                    } else {
                        $source = 'db_empty';
                    }
                } catch (\Throwable $restError) {
                    $source = 'unavailable';
                }
            } else {
                $source = 'db';
            }
        } catch (\Throwable $e) {
            try {
                $items = (new ScheduleRestStore())->listForUser(
                    $req->user->id,
                    null,
                    null,
                    $req->bearerToken()
                );
                $items = is_array($items) ? $items : [];
                $source = 'supabase_rest';
            } catch (\Throwable $restError) {
                $items = [];
                $source = 'unavailable';
            }
        }
        if (!is_array($items)) $items = [];
        $from = isset($req->query['from']) ? trim((string)$req->query['from']) : '';
        $to = isset($req->query['to']) ? trim((string)$req->query['to']) : '';
        if ($from !== '') $items = array_values(array_filter($items, static fn($x) => (string)($x['date'] ?? '') >= $from));
        if ($to !== '') $items = array_values(array_filter($items, static fn($x) => (string)($x['date'] ?? '') <= $to));
        Response::success(['items' => $items, 'source' => $source], $req->requestId);
    });

    // Compatibility write endpoint used by the legacy frontend API client.
    $router->put('/api/v1/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        try {
            Response::success((new ScheduleRepository())->replace($req->jsonBody ?? []), $req->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success(SupabaseRest::replaceSchedule($req->jsonBody ?? []), $req->requestId);
            } catch (\Throwable $x) {
                Response::error('DB_ERROR', $x->getMessage(), $req->requestId, 500);
            }
        }
    });

    $router->get('/api/v1/schedule/meta', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $course = isset($req->query['course']) && $req->query['course'] !== '' ? (int)$req->query['course'] : null;
        $semester = isset($req->query['semester']) && $req->query['semester'] !== '' ? (int)$req->query['semester'] : null;
        try {
            $meta = (new ScheduleRepository())->calendarMeta($course, $semester);
            Response::success($meta, $req->requestId);
        } catch (Throwable $e) {
            try { Response::success(SupabaseRest::calendarMeta($course, $semester), $req->requestId); }
            catch (Throwable $x) { Response::error('DB_ERROR', $x->getMessage(), $req->requestId, 500); }
        }
    });

    // --- admin schedule (was 404) ---
    $router->get('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        $groupId = isset($req->query['group_id']) ? trim((string)$req->query['group_id']) : null;
        $semester = isset($req->query['semester']) && $req->query['semester'] !== '' ? (int)$req->query['semester'] : null;
        $items = [];
        $source = 'local';
        try {
            $items = (new ScheduleRepository())->listAll($groupId !== '' ? $groupId : null, $semester);
            if (is_array($items) && count($items) > 0) $source = 'db';
        } catch (\Throwable $e) {}
        // Never fall back to legacy local JSON: CMS and student schedule must stay identical.
        if (!is_array($items)) $items = [];
        Response::success(['items' => is_array($items)?$items:[], 'source' => $source], $req->requestId);
    });

    $router->put('/api/v1/admin/schedule/local', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        Response::error('GONE', 'Local JSON schedule storage has been retired. Use /api/v1/admin/schedule.', $req->requestId, 410);
    });

    $router->put('/api/v1/admin/schedule', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req) || !RequireRole::handle($req, ['teacher', 'moderator', 'admin'])) return;
        try {
            Response::success((new ScheduleRepository())->replace($req->jsonBody ?? []), $req->requestId);
        } catch (\Throwable $e) {
            try {
                Response::success(SupabaseRest::replaceSchedule($req->jsonBody ?? []), $req->requestId);
            } catch (\Throwable $x) {
                Response::error('DB_ERROR', $x->getMessage(), $req->requestId, 500);
            }
        }
    });

    $router->get('/api/v1/curriculum', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new ContentStore())->listCurriculum()], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => []], $req->requestId);
        }
    });

    $router->get('/api/v1/materials', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new FileRepository())->listActive(null)], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => []], $req->requestId);
        }
    });

    $router->get('/api/v1/community/posts', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            Response::success(['items' => (new ContentStore())->listCommunityPosts()], $req->requestId);
        } catch (\Throwable $e) {
            Response::success(['items' => []], $req->requestId);
        }
    });

    $router->get('/api/v1/progress', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        Response::success([
            'overall_pct' => 0,
            'subjects' => [],
            'weak_topics' => [],
            'recent_activity' => [],
            'ledger' => ['count' => 0],
            'homework' => ['total' => 0, 'done' => 0, 'percent' => 0, 'items' => []],
            'tests' => ['attempts' => 0, 'finished' => 0, 'avg_score' => null, 'items' => []],
            'note' => 'degraded',
        ], $req->requestId);
    });
};
