<?php
declare(strict_types=1);

use Medbiohim\Database\Connection;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\AcademicContextResolver;
use Medbiohim\Services\B2Storage;
use Medbiohim\Services\SpecialtyAccess;
use Medbiohim\Support\Logger;

return static function (Router $router): void {
    $router->get('/api/v1/materials/{id}/file-url', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $id = trim((string)($params['id'] ?? ''));
        if ($id === '') {
            Response::error('BAD_REQUEST', 'Material id is required', $req->requestId, 400);
            return;
        }

        try {
            $stmt = Connection::pdo()->prepare(
                "SELECT m.id, m.file_id, m.source_key, s.slug AS subject_slug, s.specialty_slug,
                        f.object_key AS file_object_key, f.group_id AS file_group_id,
                        cs.source_path
                 FROM public.materials m
                 JOIN public.subjects s ON s.id = m.subject_id
                 LEFT JOIN public.files f
                   ON f.id = m.file_id AND f.status = 'active'
                 LEFT JOIN public.content_sources cs
                   ON cs.id::text = m.source_key
                 WHERE m.id = :id AND m.is_published = true
                 LIMIT 1"
            );
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();

            if ($row === false) {
                Response::error('NOT_FOUND', 'Material not found', $req->requestId, 404);
                return;
            }

            $specialty = trim((string)($row['specialty_slug'] ?? ''));
            $subjectSlug = trim((string)($row['subject_slug'] ?? ''));
            $requiredSpecialty = ($subjectSlug === 'histology' || $specialty === 'mbh') ? 'mbh' : $specialty;
            if ($requiredSpecialty !== '' && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, $requiredSpecialty)) {
                Response::error('FORBIDDEN', 'Этот материал недоступен для вашей специальности', $req->requestId, 403);
                return;
            }

            $fileGroupId = trim((string)($row['file_group_id'] ?? ''));
            if ($fileGroupId !== '') {
                (new AcademicContextResolver())->assertGroupMember($req->user->id, $fileGroupId);
            }

            if (!empty($row['file_object_key']) && str_starts_with((string)$row['file_object_key'], 'histology/')) {
                Response::success([
                    'url' => null,
                    'mode' => 'authenticated_binary',
                    'path' => '/api/v1/materials/' . rawurlencode($id) . '/file',
                ], $req->requestId);
                return;
            }

            if (!empty($row['file_object_key'])) {
                $storage = new B2Storage();
                if ($storage->isConfigured()) {
                    try {
                        $url = $storage->presignedDownloadUrl((string)$row['file_object_key'], 3600);
                        Response::success(['url' => $url, 'mode' => 'presigned'], $req->requestId);
                        return;
                    } catch (\Throwable $e) {
                        // Fall through to legacy source if available.
                    }
                }
            }

            $relative = trim((string)($row['source_path'] ?? ''));
            if ($relative !== '' && ($row['subject_slug'] ?? '') === 'histology') {
                Response::success([
                    'url' => null,
                    'mode' => 'authenticated_binary',
                    'path' => '/api/v1/materials/' . rawurlencode($id) . '/file',
                ], $req->requestId);
                return;
            }

            if ($row['file_id'] !== null) {
                Response::error('FILE_UNAVAILABLE', 'Физический файл материала временно недоступен', $req->requestId, 503);
                return;
            }

            Response::error('NOT_FOUND', 'Material source file is not mapped', $req->requestId, 404);
        } catch (\Throwable $e) {
            Logger::error('material_viewer_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('CONTENT_ERROR', 'Материал временно недоступен', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/materials/{id}/file', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $id = trim((string)($params['id'] ?? ''));
        if ($id === '') {
            Response::error('BAD_REQUEST', 'Material id is required', $req->requestId, 400);
            return;
        }

        try {
            $stmt = Connection::pdo()->prepare(
                "SELECT m.id, m.title, m.file_id, m.source_key, s.slug AS subject_slug,
                        s.specialty_slug,
                        f.original_name AS file_original_name,
                        f.mime_type AS file_mime_type,
                        f.size_bytes AS file_size_bytes,
                        f.object_key AS file_object_key,
                        f.group_id AS file_group_id,
                        cs.source_path, cs.original_format, cs.mime_type
                 FROM public.materials m
                 JOIN public.subjects s ON s.id = m.subject_id
                 LEFT JOIN public.files f
                   ON f.id = m.file_id AND f.status = 'active'
                 LEFT JOIN public.content_sources cs
                   ON cs.id::text = m.source_key
                 WHERE m.id = :id AND m.is_published = true
                 LIMIT 1"
            );
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();

            if ($row === false) {
                Response::error('NOT_FOUND', 'Material not found', $req->requestId, 404);
                return;
            }

            $specialty = trim((string)($row['specialty_slug'] ?? ''));
            $subjectSlug = trim((string)($row['subject_slug'] ?? ''));
            $requiredSpecialty = ($subjectSlug === 'histology' || $specialty === 'mbh') ? 'mbh' : $specialty;
            if (
                $requiredSpecialty !== ''
                && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, $requiredSpecialty)
            ) {
                Response::error(
                    'FORBIDDEN',
                    'Этот материал недоступен для вашей специальности',
                    $req->requestId,
                    403
                );
                return;
            }

            $fileGroupId = trim((string)($row['file_group_id'] ?? ''));
            if ($fileGroupId !== '') {
                (new AcademicContextResolver())->assertGroupMember($req->user->id, $fileGroupId);
            }

            // Canonical uploaded files: keep the original object private and
            // generate a short-lived B2 download URL only after access checks.
            if (!empty($row['file_object_key']) && str_starts_with((string)$row['file_object_key'], 'histology/')) {
                $mime = trim((string)($row['file_mime_type'] ?? $row['mime_type'] ?? '')) ?: 'application/octet-stream';
                $name = trim((string)($row['file_original_name'] ?? $row['title'] ?? basename((string)$row['file_object_key'])));
                \Medbiohim\Services\UpstashBlobProxy::emit($req, (string)$row['file_object_key'], $mime, $name);
            }

            if (!empty($row['file_object_key'])) {
                $storage = new B2Storage();
                if ($storage->isConfigured()) {
                    try {
                        $url = $storage->presignedDownloadUrl((string)$row['file_object_key'], 3600);
                        header('Location: ' . $url, true, 302);
                        exit;
                    } catch (\Throwable $e) {
                        // Fall through to the legacy physical source below.
                    }
                }
            }

            // Legacy imported Histology materials may intentionally have no
            // public.files row yet. Keep their authenticated SpaceWeb delivery.
            $relative = trim((string)($row['source_path'] ?? ''));
            if ($relative === '') {
                if ($row['file_id'] !== null) {
                    Response::error(
                        'FILE_UNAVAILABLE',
                        'Физический файл материала временно недоступен',
                        $req->requestId,
                        503
                    );
                    return;
                }
                Response::error(
                    'NOT_FOUND',
                    'Material source file is not mapped',
                    $req->requestId,
                    404
                );
                return;
            }

            $relative = str_replace('\\', '/', $relative);
            if (($row['subject_slug'] ?? '') === 'histology') {
                $relative = preg_replace('#^features/histology-content/#', 'content/histology/', $relative) ?? $relative;
                $relative = preg_replace('#^content/histology-content/#', 'content/histology/', $relative) ?? $relative;
            }
            $relative = ltrim($relative, '/');

            if (str_contains($relative, '..')) {
                Response::error('BAD_REQUEST', 'Invalid material path', $req->requestId, 400);
                return;
            }

            if (($row['subject_slug'] ?? '') !== 'histology') {
                Response::error(
                    'FILE_UNAVAILABLE',
                    'Физический файл этого материала пока не подключён к хранилищу',
                    $req->requestId,
                    503
                );
                return;
            }

            $root = getenv('HISTOLOGY_MEDIA_ROOT') ?: (__DIR__ . '/../../../content/histology');
            $root = rtrim((string)$root, '/\\');
            $candidate = $root . '/' . preg_replace('#^content/histology/#', '', $relative);

            // Shared Upstash Blob is canonical; local disk remains a migration fallback.
            $remoteRelative = ltrim(preg_replace('#^content/histology/#', '', $relative) ?? $relative, '/');
            $remoteExt = strtolower(pathinfo($remoteRelative, PATHINFO_EXTENSION));
            $remoteMime = trim((string)($row['mime_type'] ?? ''));
            if ($remoteMime === '') {
                $remoteMime = match ($remoteExt) {
                    'jpg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif',
                    'webp' => 'image/webp', 'pdf' => 'application/pdf',
                    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'doc' => 'application/msword', 'html' => 'text/html; charset=utf-8',
                    default => 'application/octet-stream',
                };
            }
            $remoteKey = 'histology/' . $remoteRelative;
            \Medbiohim\Services\UpstashBlobProxy::emit($req, $remoteKey, $remoteMime, basename($remoteRelative));

            if (!is_file($candidate)) {
                Response::error(
                    'NOT_FOUND',
                    'Material file is not deployed on the backend',
                    $req->requestId,
                    404
                );
                return;
            }

            $ext = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));

            // Legacy .doc files are kept as originals. Prefer an HTML mirror
            // when it exists so the material can be read in-site.
            if ($ext === 'doc') {
                $htmlCandidate = preg_replace('/\.doc$/i', '.html', $candidate) ?? ($candidate . '.html');
                $htmlRootCandidate = rtrim($root, '/\\') . '/legacy-doc-html/' . pathinfo($candidate, PATHINFO_FILENAME) . '.html';
                foreach ([$htmlCandidate, $htmlRootCandidate] as $mirror) {
                    if (is_file($mirror)) {
                        $candidate = $mirror;
                        $ext = 'html';
                        break;
                    }
                }
            }

            $mimeMap = [
                'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'doc' => 'application/msword',
                'pdf' => 'application/pdf',
                'jpg' => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'png' => 'image/png',
                'gif' => 'image/gif',
                'webp' => 'image/webp',
                'html' => 'text/html; charset=utf-8',
            ];
            $mime = $mimeMap[$ext]
                ?? ((string)($row['mime_type'] ?? '') ?: (string)($row['file_mime_type'] ?? '') ?: 'application/octet-stream');
            $name = basename($candidate);

            header('Content-Type: ' . $mime);
            header('Content-Length: ' . (string)filesize($candidate));
            header('Content-Disposition: inline; filename="' . str_replace('"', '', $name) . '"');
            header('Cache-Control: private, max-age=300');
            readfile($candidate);
        } catch (\Throwable $e) {
            Logger::error('material_viewer_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('CONTENT_ERROR', 'Материал временно недоступен', $req->requestId, 503);
        }
    });
};
