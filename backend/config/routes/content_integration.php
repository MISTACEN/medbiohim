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
    $filterMaterialsForUser = static function (array $items, Request $req): array {
        $access = new SpecialtyAccess();
        return array_values(array_filter($items, static function (array $item) use ($access, $req): bool {
            $subjectSlug = trim((string) ($item['subject_slug'] ?? ''));
            $specialty = trim((string) ($item['specialty_slug'] ?? ''));
            $requiredSpecialty = ($subjectSlug === 'histology' || $specialty === 'mbh') ? 'mbh' : $specialty;
            return $requiredSpecialty === '' || $access->userHasSpecialty($req->user->id, $requiredSpecialty);
        }));
    };
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
                           s.specialty_slug, cs.id AS source_id,
                           cs.source_path, cs.original_format, cs.mime_type AS source_mime_type,
                           mod.title AS module_title, top.title AS topic_title
                    FROM public.materials m
                    JOIN public.subjects s ON s.id = m.subject_id
                    LEFT JOIN public.content_sources cs ON cs.id::text = m.source_key
                    LEFT JOIN public.modules mod ON mod.id = m.module_id
                    LEFT JOIN public.topics top ON top.id = m.topic_id
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

            $items = $filterMaterialsForUser($items, $req);

            Response::success(['items' => $items, 'source' => 'supabase'], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('CONTENT_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });

    $router->get('/api/v1/content-sources/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT cs.id, cs.title, cs.source_path, cs.mime_type, cs.original_format,
                        cs.source_archive, cs.note, cs.file_id, cs.created_at,
                        EXISTS (
                            SELECT 1
                            FROM public.materials m
                            JOIN public.subjects s ON s.id = m.subject_id
                            WHERE m.source_key = cs.id::text AND s.slug = \'histology\'
                        ) AS is_histology_source
                 FROM public.content_sources cs
                 WHERE cs.id = :id
                 LIMIT 1'
            );
            $stmt->execute(['id' => (string) ($params['id'] ?? '')]);
            $row = $stmt->fetch();
            if ($row === false) {
                Response::error('NOT_FOUND', 'Content source not found', $req->requestId, 404);
                return;
            }

            $sourcePath = str_replace('\\\\', '/', trim((string) ($row['source_path'] ?? '')));
            $sourceId = strtolower((string) ($row['id'] ?? ''));
            $histologySourceFlag = in_array(strtolower((string) ($row['is_histology_source'] ?? '')), ['1', 't', 'true', 'yes'], true);
            $isHistologySource = $histologySourceFlag
                || $sourceId === 'histology'
                || str_starts_with($sourceId, 'histology-')
                || preg_match('#(?:^|/)(?:content|features)/histology(?:-content)?/#i', $sourcePath) === 1;
            if ($isHistologySource && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
                Response::error('FORBIDDEN', 'Этот материал доступен только специальности МБХ', $req->requestId, 403);
                return;
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
                           cs.id AS source_id, cs.source_path, cs.original_format,
                           cs.mime_type AS source_mime_type,
                           mod.title AS module_title, top.title AS topic_title,
                           f.original_name AS source_file_name, f.mime_type AS source_file_mime,
                           f.size_bytes AS source_file_size, f.object_key AS source_object_key
                    FROM public.materials m
                    JOIN public.subjects s ON s.id = m.subject_id
                    LEFT JOIN public.content_sources cs ON cs.id::text = m.source_key
                    LEFT JOIN public.modules mod ON mod.id = m.module_id
                    LEFT JOIN public.topics top ON top.id = m.topic_id
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

            $storage = new B2Storage();
            $items = $filterMaterialsForUser($items, $req);
            foreach ($items as &$item) {
                $item['source'] = [
                    'id' => $item['source_id'] ?? null,
                    'key' => $item['source_key'] ?? null,
                    'file_id' => $item['file_id'] ?? null,
                    'name' => $item['source_file_name'] ?? null,
                    'mime_type' => $item['source_file_mime'] ?? ($item['source_mime_type'] ?? null),
                    'source_path' => $item['source_path'] ?? null,
                    'original_format' => $item['original_format'] ?? null,
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
            $subjectSlug = trim((string) ($item['subject_slug'] ?? ''));
            $specialty = trim((string) ($item['specialty_slug'] ?? ''));
            $requiredSpecialty = ($subjectSlug === 'histology' || $specialty === 'mbh') ? 'mbh' : $specialty;
            if ($requiredSpecialty !== '' && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, $requiredSpecialty)) {
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