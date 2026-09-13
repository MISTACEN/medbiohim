<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Services\B2Storage;
use Medbiohim\Support\Logger;

return static function (Router $router): void {
    $router->post('/api/v1/files/upload', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        $name = (string) $req->json('original_name', 'upload.bin');
        $mime = (string) $req->json('mime_type', 'application/octet-stream');
        $b64 = (string) $req->json('content_base64', '');
        if ($b64 === '') {
            Response::error('VALIDATION_ERROR', 'content_base64 is required (MVP upload)', $req->requestId, 422);
            return;
        }
        $binary = base64_decode($b64, true);
        if ($binary === false) {
            Response::error('VALIDATION_ERROR', 'Invalid base64', $req->requestId, 422);
            return;
        }
        if (strlen($binary) > 15 * 1024 * 1024) {
            Response::error('VALIDATION_ERROR', 'File too large (max 15MB)', $req->requestId, 413);
            return;
        }
        $b2 = new B2Storage();
        $key = $b2->buildObjectKey($req->user->id, $name);
        try {
            if ($b2->isConfigured()) {
                $up = $b2->upload($key, $binary, $mime);
            } else {
                $up = ['object_key' => $key, 'b2_file_id' => null, 'size' => strlen($binary)];
                Logger::info('b2_skipped_not_configured', ['object_key' => $key]);
            }
            $meta = (new FileRepository())->create([
                'original_name' => $name,
                'mime_type' => $mime,
                'size_bytes' => $up['size'],
                'object_key' => $up['object_key'],
                'b2_file_id' => $up['b2_file_id'] ?? null,
                'uploaded_by' => $req->user->id,
                'group_id' => $req->json('group_id') ? (string) $req->json('group_id') : null,
                'visibility' => (string) $req->json('visibility', 'group'),
            ]);
            Response::success(['file' => $meta], $req->requestId, 201);
        } catch (\Throwable $e) {
            Logger::error('file_upload_failed', ['message' => $e->getMessage()]);
            Response::error('UPLOAD_FAILED', 'Could not store file', $req->requestId, 500);
        }
    });

    $router->get('/api/v1/files/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $file = (new FileRepository())->findById($params['id']);
            if ($file === null) {
                Response::error('NOT_FOUND', 'File not found', $req->requestId, 404);
                return;
            }
            Response::success([
                'file' => $file,
                'download' => ['status' => 'pending_presign', 'note' => 'Presigned download when B2 SigV4 is configured'],
            ], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });
};
