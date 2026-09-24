<?php
declare(strict_types=1);

use Medbiohim\Database\Connection;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SpecialtyAccess;
use Medbiohim\Services\B2Storage;

return static function (Router $router): void {
    $router->get('/api/v1/subject-materials', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $subjectId = trim((string) ($req->query['subject_id'] ?? ''));
        $subjectSlug = trim((string) ($req->query['subject_slug'] ?? ''));
        $type = trim((string) ($req->query['type'] ?? ''));

        try {
            $sql = 'SELECT m.id, m.subject_id, m.module_id, m.topic_id, m.type, m.title,
                           m.content_html, m.external_url, m.source_key, m.order_index,
                           m.is_published, m.created_at, m.updated_at,
                           s.name AS subject_name, s.slug AS subject_slug,
                           s.specialty_slug
                    FROM public.materials m
                    JOIN public.subjects s ON s.id = m.subject_id
                    WHERE m.is_published = true';
            $paramsSql = [];

            if ($subjectId !== '') {
                $sql .= ' AND m.subject_id = :subject_id';
                $paramsSql['subject_id'] = $subjectId;
            }
            if ($subjectSlug !== '') {
                $sql .= ' AND s.slug = :subject_slug';
                $paramsSql['subject_slug'] = $subjectSlug;
            }
            if ($type !== '') {
                $sql .= ' AND m.type = :type';
                $paramsSql['type'] = $type;
            }

            $sql .= ' ORDER BY s.name, m.order_index NULLS LAST, m.title';
            $stmt = Connection::pdo()->prepare($sql);
            $stmt->execute($paramsSql);
            $items = $stmt->fetchAll() ?: [];

            $access = new SpecialtyAccess();
            $items = array_values(array_filter($items, static function (array $item) use ($access, $req): bool {
                $slug = trim((string) ($item['specialty_slug'] ?? ''));
                return $slug === '' || $access->userHasSpecialty($req->user->id, $slug);
            }));

            Response::success(['items' => $items, 'source' => 'supabase'], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('CONTENT_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/content-sources/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT id, title, source_path, mime_type, original_format, source_archive, note, file_id, created_at
                 FROM public.content_sources
                 WHERE id = :id
                 LIMIT 1'
            );
            $stmt->execute(['id' => (string) ($params['id'] ?? '')]);
            $row = $stmt->fetch();
            if ($row === false) {
                Response::error('NOT_FOUND', 'Content source not found', $req->requestId, 404);
                return;
            }

            if (strtolower((string) ($row['id'] ?? '')) === 'histology' || str_starts_with((string) ($row['id'] ?? ''), 'histology-')) {
                if (!(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
                    Response::error('FORBIDDEN', 'Этот материал доступен только специальности МБХ', $req->requestId, 403);
                    return;
                }
            }

            $download = null;
            if (!empty($row['file_id'])) {
                $fileStmt = Connection::pdo()->prepare(
                    'SELECT id, original_name, mime_type, size_bytes, object_key
                     FROM public.files
                     WHERE id = :id AND status = \'active\'
                     LIMIT 1'
                );
                $fileStmt->execute(['id' => (string) $row['file_id']]);
                $file = $fileStmt->fetch();
                if ($file !== false && !empty($file['object_key'])) {
                    $storage = new B2Storage();
                    if ($storage->isConfigured()) {
                        try { $download = ['name'=>$file['original_name'] ?? null,'mime_type'=>$file['mime_type'] ?? null,'size_bytes'=>$file['size_bytes'] ?? null,'url'=>$storage->presignedDownloadUrl((string)$file['object_key'],3600)]; }
                        catch (\Throwable $e) { $download = null; }
                    }
                }
            }
            Response::success(['source' => $row, 'download' => $download], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('CONTENT_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/trainers/feed/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT id, subject_id, subject_slug, specialty_slug, mode_set,
                        preparation, hotspots, question, tags, difficulty, source_key, source_file_id,
                        is_published, created_at, updated_at
                 FROM public.trainer_feed_cards
                 WHERE id = :id AND is_published = true
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
                'SELECT source_key, source_file_id, specialty_slug
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

            $relative = ltrim(str_replace('\\', '/', (string) ($row['source_key'] ?? '')), '/');
            if ($relative === '' || str_contains($relative, '..')) {
                Response::error('MEDIA_INVALID', 'Invalid media path', $req->requestId, 422);
                return;
            }

            $root = rtrim((string) (getenv('HISTOLOGY_MEDIA_ROOT') ?: (__DIR__ . '/../../../storage/histology')), '/');
            $path = realpath($root . '/' . $relative);
            $rootReal = realpath($root);
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

    $router->get('/api/v1/materials', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $subjectId = trim((string) ($req->query['subject_id'] ?? ''));
        $subjectSlug = trim((string) ($req->query['subject_slug'] ?? ''));
        $type = trim((string) ($req->query['type'] ?? ''));
        $q = trim((string) ($req->query['q'] ?? ''));

        try {
            $sql = 'SELECT m.id, m.subject_id, m.module_id, m.topic_id, m.type, m.title,
                           m.file_id, m.external_url, m.content_html, m.order_index,
                           m.is_published, m.created_at, m.updated_at, m.source_key,
                           s.name AS subject_name, s.slug AS subject_slug, s.specialty_slug,
                           f.original_name AS source_file_name, f.mime_type AS source_file_mime,
                           f.size_bytes AS source_file_size, f.object_key AS source_object_key
                    FROM public.materials m
                    JOIN public.subjects s ON s.id = m.subject_id
                    LEFT JOIN public.files f ON f.id = m.file_id AND f.status = \'active\'
                    WHERE m.is_published = true';
            $p = [];

            if ($subjectId !== '') {
                $sql .= ' AND m.subject_id = :subject_id';
                $p['subject_id'] = $subjectId;
            }
            if ($subjectSlug !== '') {
                $sql .= ' AND s.slug = :subject_slug';
                $p['subject_slug'] = $subjectSlug;
            }
            if ($type !== '') {
                $sql .= ' AND m.type = :type';
                $p['type'] = $type;
            }
            if ($q !== '') {
                $sql .= ' AND (m.title ILIKE :q OR coalesce(m.content_html, \'\') ILIKE :q)';
                $p['q'] = '%' . $q . '%';
            }

            $sql .= ' ORDER BY s.name, m.order_index NULLS LAST, m.title';
            $stmt = Connection::pdo()->prepare($sql);
            $stmt->execute($p);
            $items = $stmt->fetchAll() ?: [];

            $access = new SpecialtyAccess();
            $storage = new B2Storage();
            $items = array_values(array_filter($items, static function (array $item) use ($access, $req): bool {
                $slug = trim((string) ($item['specialty_slug'] ?? ''));
                return $slug === '' || $access->userHasSpecialty($req->user->id, $slug);
            }));
            foreach ($items as &$item) {
                $item['source'] = [
                    'key' => $item['source_key'] ?? null,
                    'file_id' => $item['file_id'] ?? null,
                    'name' => $item['source_file_name'] ?? null,
                    'mime_type' => $item['source_file_mime'] ?? null,
                    'size_bytes' => $item['source_file_size'] ?? null,
                    'download_url' => null,
                ];
                if ($storage->isConfigured() && !empty($item['source_object_key'])) {
                    try {
                        $item['source']['download_url'] = $storage->presignedDownloadUrl((string) $item['source_object_key'], 3600);
                    } catch (\Throwable $e) {
                        $item['source']['download_url'] = null;
                    }
                }
                unset($item['source_object_key'], $item['source_file_name'], $item['source_file_mime'], $item['source_file_size']);
            }
            unset($item);

            Response::success(['items' => $items, 'source' => 'supabase'], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('MATERIALS_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/materials/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT m.id, m.subject_id, m.module_id, m.topic_id, m.type, m.title,
                        m.file_id, m.external_url, m.content_html, m.order_index,
                        m.is_published, m.created_at, m.updated_at, m.source_key,
                        s.name AS subject_name, s.slug AS subject_slug, s.specialty_slug,
                        f.original_name AS source_file_name, f.mime_type AS source_file_mime,
                        f.size_bytes AS source_file_size, f.object_key AS source_object_key
                 FROM public.materials m
                 JOIN public.subjects s ON s.id = m.subject_id
                 LEFT JOIN public.files f ON f.id = m.file_id AND f.status = \'active\'
                 WHERE m.id = :id AND m.is_published = true
                 LIMIT 1'
            );
            $stmt->execute(['id' => (string) ($params['id'] ?? '')]);
            $item = $stmt->fetch();
            if ($item === false) {
                Response::error('NOT_FOUND', 'Material not found', $req->requestId, 404);
                return;
            }
            $specialty = trim((string) ($item['specialty_slug'] ?? ''));
            if ($specialty !== '' && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, $specialty)) {
                Response::error('FORBIDDEN', 'Этот материал недоступен для вашей специальности', $req->requestId, 403);
                return;
            }

            $source = [
                'key' => $item['source_key'] ?? null,
                'file_id' => $item['file_id'] ?? null,
                'name' => $item['source_file_name'] ?? null,
                'mime_type' => $item['source_file_mime'] ?? null,
                'size_bytes' => $item['source_file_size'] ?? null,
                'download_url' => null,
            ];
            if (!empty($item['source_object_key'])) {
                $storage = new B2Storage();
                if ($storage->isConfigured()) {
                    try {
                        $source['download_url'] = $storage->presignedDownloadUrl((string) $item['source_object_key'], 3600);
                    } catch (\Throwable $e) {
                        $source['download_url'] = null;
                    }
                }
            }
            unset($item['source_object_key'], $item['source_file_name'], $item['source_file_mime'], $item['source_file_size']);
            Response::success(['item' => $item, 'source' => $source], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('MATERIAL_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

};