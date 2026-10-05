<?php
declare(strict_types=1);

use MedbiohimHttpRequest;
use MedbiohimHttpResponse;
use MedbiohimHttpRouter;
use MedbiohimMiddlewareRequireAuth;
use MedbiohimServicesSpecialtyAccess;
use MedbiohimDatabaseConnection;

return static function (Router $router): void {
    $router->get('/api/v1/histology/source/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        if (!(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
            Response::error('FORBIDDEN', 'Материал доступен только специальности МБХ', $req->requestId, 403);
            return;
        }

        $id = trim((string)($params['id'] ?? ''));
        if ($id === '' || !str_starts_with($id, 'histology-zip-')) {
            Response::error('NOT_FOUND', 'Histology source not found', $req->requestId, 404);
            return;
        }

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT source_path, mime_type, title
                 FROM public.content_sources
                 WHERE id = :id AND source_archive = :archive
                 LIMIT 1'
            );
            $stmt->execute(['id' => $id, 'archive' => 'Гистология.zip']);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row === false) {
                Response::error('NOT_FOUND', 'Histology source not found', $req->requestId, 404);
                return;
            }

            $relative = ltrim(str_replace('\\', '/', (string)$row['source_path']), '/');
            if ($relative === '' || str_contains($relative, '..')) {
                Response::error('MEDIA_INVALID', 'Invalid source path', $req->requestId, 422);
                return;
            }

            $root = rtrim((string)(getenv('HISTOLOGY_MEDIA_ROOT') ?: (__DIR__ . '/../../../content/histology')), '/');
            $path = realpath($root . '/source-materials/' . $relative);
            $rootReal = realpath($root . '/source-materials');

            if ($rootReal === false || $path === false
                || !str_starts_with($path, $rootReal . DIRECTORY_SEPARATOR)
                || !is_file($path)) {
                Response::error('SOURCE_NOT_DEPLOYED', 'Source material is not deployed on the backend yet', $req->requestId, 404);
                return;
            }

            $mime = trim((string)($row['mime_type'] ?? ''));
            if ($mime === '') {
                $mime = function_exists('mime_content_type')
                    ? (string)mime_content_type($path)
                    : 'application/octet-stream';
            }

            header('Content-Type: ' . $mime);
            header('Content-Disposition: inline; filename="' . addcslashes((string)($row['title'] ?? 'histology-source'), '"\\') . '"');
            header('Cache-Control: private, max-age=3600');
            readfile($path);
            exit;
        } catch (Throwable $e) {
            Response::error('SOURCE_ERROR', $e->getMessage(), $req->requestId, 503);
        }
    });
};
