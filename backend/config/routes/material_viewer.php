<?php
declare(strict_types=1);

use Medbiohim\Database\Connection;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SpecialtyAccess;
use Medbiohim\Services\AcademicContextResolver;
use Medbiohim\Services\B2Storage;

return static function (Router $router): void {
    $router->get('/api/v1/materials/{id}/file', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $id = trim((string)($params['id'] ?? ''));
        if ($id === '') { Response::error('BAD_REQUEST', 'Material id is required', $req->requestId, 400); return; }

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT m.id, m.title, m.file_id, m.source_key, s.slug AS subject_slug,
                        s.specialty_slug,
                        f.original_name AS file_original_name, f.mime_type AS file_mime_type,
                        f.size_bytes AS file_size_bytes, f.object_key AS file_object_key,
                        f.group_id AS file_group_id,
                        cs.source_path, cs.original_format, cs.mime_type
                 FROM public.materials m
                 JOIN public.subjects s ON s.id = m.subject_id
                 LEFT JOIN public.files f ON f.id = m.file_id AND f.status = 'active'
                 LEFT JOIN public.content_sources cs ON cs.id::text = m.source_key
                 WHERE m.id = :id AND m.is_published = true
                 LIMIT 1'
            );
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();
            if ($row === false) { Response::error('NOT_FOUND', 'Material not found', $req->requestId, 404); return; }

            $specialty = trim((string)($row['specialty_slug'] ?? ''));
            if ($specialty !== '' && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, $specialty)) {
                Response::error('FORBIDDEN', 'Этот материал недоступен для вашей специальности', $req->requestId, 403);
                return;
            }

            $fileGroupId = trim((string)($row['file_group_id'] ?? ''));
            if ($fileGroupId !== '') {
                (new AcademicContextResolver())->assertGroupMember($req->user->id, $fileGroupId);
            }

            // Prefer the canonical file metadata / B2 object when the material has one.
            // This makes the viewer work for all subjects, not only Histology.
            if (!empty($row['file_object_key'])) {
                $storage = new B2Storage();
                if ($storage->isConfigured()) {
                    try {
                        $url = $storage->presignedDownloadUrl((string)$row['file_object_key'], 3600);
                        header('Location: '.$url, true, 302);
                        exit;
                    } catch (Throwable $e) {
                        // Fall through to the physical SpaceWeb path for Histology.
                    }
                }
            }

            // Histology packages may intentionally use Supabase metadata + SpaceWeb binary
            // without a public.files row. Preserve that canonical fallback.
            if (($row['subject_slug'] ?? '') !== 'histology') {
                Response::error('FILE_UNAVAILABLE', 'Физический файл этого материала недоступен', $req->requestId, 503);
                return;
            }

            $relative = trim((string)($row['source_path'] ?? ''));
            if ($relative === '') { Response::error('NOT_FOUND', 'Material source file is not mapped', $req->requestId, 404); return; }

            // Normalize legacy import paths to the current SpaceWeb content tree.
            $relative = str_replace('\\', '/', $relative);
            $relative = preg_replace('#^features/histology-content/#', 'content/histology/', $relative) ?? $relative;
            $relative = preg_replace('#^content/histology-content/#', 'content/histology/', $relative) ?? $relative;
            $relative = ltrim($relative, '/');
            if (str_contains($relative, '..')) {
                Response::error('BAD_REQUEST', 'Invalid material path', $req->requestId, 400); return;
            }

            $root = getenv('HISTOLOGY_MEDIA_ROOT') ?: (__DIR__ . '/../../../content/histology');
            $root = rtrim((string)$root, '/\\');
            $candidate = $root . '/' . preg_replace('#^content/histology/#', '', $relative);
            if (!is_file($candidate)) {
                Response::error('NOT_FOUND', 'Material file is not deployed on the backend', $req->requestId, 404);
                return;
            }

            $ext = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));

            // Legacy .doc files are kept as originals, but browsers do not render
            // them inline. The SpaceWeb content bundle also carries a generated
            // HTML mirror for these files; prefer that mirror for in-site viewing.
            if ($ext === 'doc') {
                $htmlCandidate = preg_replace('/\\.doc$/i', '.html', $candidate) ?? ($candidate . '.html');
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
                'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
                'gif' => 'image/gif', 'webp' => 'image/webp',
                'html' => 'text/html; charset=utf-8',
            ];
            $mime = $mimeMap[$ext] ?? ((string)($row['mime_type'] ?? '') ?: 'application/octet-stream');
            $name = basename($candidate);

            header('Content-Type: ' . $mime);
            header('Content-Length: ' . (string)filesize($candidate));
            header('Content-Disposition: inline; filename="' . str_replace('"', '', $name) . '"');
            header('Cache-Control: private, max-age=300');
            readfile($candidate);
        } catch (Throwable $e) {
            Response::error('CONTENT_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });
};
