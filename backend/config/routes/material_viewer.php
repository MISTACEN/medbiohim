<?php
declare(strict_types=1);

use Medbiohim\Database\Connection;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SpecialtyAccess;

return static function (Router $router): void {
    $router->get('/api/v1/materials/{id}/file', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $id = trim((string)($params['id'] ?? ''));
        if ($id === '') { Response::error('BAD_REQUEST', 'Material id is required', $req->requestId, 400); return; }

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT m.id, m.title, m.file_id, m.source_key, s.slug AS subject_slug,
                        cs.source_path, cs.original_format, cs.mime_type
                 FROM public.materials m
                 JOIN public.subjects s ON s.id = m.subject_id
                 LEFT JOIN public.content_sources cs ON cs.id = m.source_key
                 WHERE m.id = :id AND m.is_published = true
                 LIMIT 1'
            );
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();
            if ($row === false) { Response::error('NOT_FOUND', 'Material not found', $req->requestId, 404); return; }

            if (($row['subject_slug'] ?? '') !== 'histology') {
                Response::error('FORBIDDEN', 'This material viewer is restricted to histology', $req->requestId, 403);
                return;
            }
            if (!(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
                Response::error('FORBIDDEN', 'Этот материал доступен только специальности МБХ', $req->requestId, 403);
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
        } catch (\Throwable $e) {
            Response::error('CONTENT_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });
};
