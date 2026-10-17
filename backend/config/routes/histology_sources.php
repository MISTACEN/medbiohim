<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Services\SpecialtyAccess;
use Medbiohim\Database\Connection;

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

            $mime = trim((string)($row['mime_type'] ?? '')) ?: 'application/octet-stream';
            $remoteKeys = [
                'histology/source-materials/' . $relative,
                'histology/' . $relative,
            ];
            foreach (array_unique($remoteKeys) as $remoteKey) {
                if (\Medbiohim\Services\UpstashBlobProxy::emit($req, $remoteKey, $mime, basename($relative))) {
                    return;
                }
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
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('histology_source_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('SOURCE_ERROR', 'Источник материала временно недоступен', $req->requestId, 503);
        }
    });

    /**
     * SpaceWeb-only textbook directory.
     *
     * Physical PDFs live in:
     *   content/histology/source-materials/Учебники/
     *
     * They are intentionally not mirrored into Supabase.
     */
    $router->get('/api/v1/histology/source-materials', static function (Request $req): void {
        if (!RequireAuth::handle($req)) return;
        if (!(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
            Response::error('FORBIDDEN', 'Материал доступен только специальности МБХ', $req->requestId, 403);
            return;
        }

        $folder = trim((string)($req->query['folder'] ?? 'Учебники'));
        if ($folder !== 'Учебники') {
            Response::error('BAD_REQUEST', 'Разрешён только каталог Учебники', $req->requestId, 400);
            return;
        }

        try {
            $apiBase = rtrim((string) \Medbiohim\Support\Env::get('MEDBIOHIM_CLOUDFLARE_API_URL', 'https://medbiohim-api.ryazansevegor.workers.dev/api/v1'), '/');
            $bearer = $req->bearerToken();
            if ($apiBase !== '' && $bearer) {
                $remote = \Medbiohim\Support\HttpClient::request('GET', $apiBase . '/histology/source-materials?folder=' . rawurlencode($folder), null, [
                    'Authorization: Bearer ' . $bearer,
                    'Accept: application/json',
                ], 20);
                if ($remote['status'] === 200 && $remote['json'] !== null) {
                    header('Content-Type: application/json; charset=utf-8');
                    header('Cache-Control: private, max-age=60');
                    echo $remote['body'];
                    exit;
                }
            }

            $root = rtrim((string)(getenv('HISTOLOGY_MEDIA_ROOT') ?: (__DIR__ . '/../../../content/histology')), '/\\');
            $dir = $root . '/source-materials/' . $folder;

            if (!is_dir($dir)) {
                Response::success([
                    'items' => [],
                    'folder' => $folder,
                    'source' => 'spaceweb',
                    'status' => 'empty',
                ], $req->requestId);
                return;
            }

            $items = [];
            foreach (scandir($dir) ?: [] as $name) {
                if ($name === '.' || $name === '..') continue;
                $candidate = $dir . DIRECTORY_SEPARATOR . $name;
                if (!is_file($candidate)) continue;
                if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'pdf') continue;

                $items[] = [
                    'name' => $name,
                    'path' => $folder . '/' . $name,
                    'mime_type' => 'application/pdf',
                    'size_bytes' => filesize($candidate) ?: 0,
                    'updated_at' => date(DATE_ATOM, filemtime($candidate) ?: time()),
                ];
            }

            usort($items, static fn(array $a, array $b): int =>
                strnatcasecmp((string)$a['name'], (string)$b['name'])
            );

            Response::success([
                'items' => $items,
                'folder' => $folder,
                'source' => 'spaceweb',
                'status' => $items === [] ? 'empty' : 'ready',
            ], $req->requestId);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('histology_source_list_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('SOURCE_LIST_ERROR', 'Материалы по гистологии временно недоступны', $req->requestId, 503);
        }
    });

    /**
     * Protected inline delivery for a concrete PDF from source-materials/Учебники.
     * No Supabase row is required.
     */
    $router->get('/api/v1/histology/source-file', static function (Request $req): void {
        if (!RequireAuth::handle($req)) return;
        if (!(new SpecialtyAccess())->userHasSpecialty($req->user->id, 'mbh')) {
            Response::error('FORBIDDEN', 'Материал доступен только специальности МБХ', $req->requestId, 403);
            return;
        }

        $relative = trim(str_replace('\\', '/', (string)($req->query['path'] ?? '')));
        if ($relative === '' || str_contains($relative, '..') || !str_starts_with($relative, 'Учебники/')) {
            Response::error('BAD_REQUEST', 'Недопустимый путь учебника', $req->requestId, 400);
            return;
        }

        $filename = basename($relative);
        if ($filename === '' || strtolower(pathinfo($filename, PATHINFO_EXTENSION)) !== 'pdf') {
            Response::error('BAD_REQUEST', 'Доступны только PDF из каталога Учебники', $req->requestId, 400);
            return;
        }

        try {
            $remoteKeys = [
                'histology/source-materials/' . $relative,
                'histology/' . $relative,
                'histology/Учебники/' . $filename,
            ];
            foreach (array_unique($remoteKeys) as $remoteKey) {
                \Medbiohim\Services\UpstashBlobProxy::emit($req, $remoteKey, 'application/pdf', $filename);
            }

            $root = rtrim((string)(getenv('HISTOLOGY_MEDIA_ROOT') ?: (__DIR__ . '/../../../content/histology')), '/\\');
            $rootReal = realpath($root . '/source-materials');
            $path = realpath($root . '/source-materials/' . $relative);

            if ($rootReal === false || $path === false
                || !str_starts_with($path, $rootReal . DIRECTORY_SEPARATOR)
                || !is_file($path)) {
                Response::error('NOT_FOUND', 'Учебник не найден на SpaceWeb', $req->requestId, 404);
                return;
            }

            header('Content-Type: application/pdf');
            header('Content-Length: ' . (string)(filesize($path) ?: 0));
            header('Content-Disposition: inline; filename="' . str_replace('"', '', $filename) . '"');
            header('Cache-Control: private, max-age=900');
            readfile($path);
            exit;
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('histology_source_file_failed', ['requestId' => $req->requestId, 'error' => $e->getMessage()]);
            Response::error('SOURCE_FILE_ERROR', 'Не удалось открыть учебник', $req->requestId, 503);
        }
    });

};
