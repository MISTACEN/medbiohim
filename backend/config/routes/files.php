<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Services\B2Storage;
use Medbiohim\Services\SpecialtyAccess;
use Medbiohim\Services\AcademicContextResolver;
use Medbiohim\Services\AcademicContextException;
use Medbiohim\Support\Logger;
use Medbiohim\Support\Multipart;

return static function (Router $router): void {
    $requiredSpecialtyForFile = static function (array $file): string {
        $specialty = trim((string) ($file['specialty_slug'] ?? ''));
        $histologyFlag = strtolower((string) ($file['is_histology_material'] ?? ''));
        $isHistologyMaterial = in_array($histologyFlag, ['1', 't', 'true', 'yes'], true);
        return ($isHistologyMaterial || $specialty === 'mbh') ? 'mbh' : $specialty;
    };
    $router->post('/api/v1/files/upload', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;

        $name = '';
        $mime = 'application/octet-stream';
        $binary = null;

        $mp = Multipart::firstFile('file');
        if ($mp !== null) {
            $name = $mp['name'];
            $mime = $mp['type'] !== '' ? $mp['type'] : $mime;
            $binary = $mp['binary'];
        } else {
            $name = (string) $req->json('original_name', 'upload.bin');
            $mime = (string) $req->json('mime_type', 'application/octet-stream');
            $b64 = (string) $req->json('content_base64', '');
            if ($b64 !== '') {
                $decoded = base64_decode($b64, true);
                if ($decoded === false) {
                    Response::error('VALIDATION_ERROR', 'Invalid base64', $req->requestId, 422);
                    return;
                }
                $binary = $decoded;
            }
        }

        if ($binary === null || $binary === '') {
            Response::error('VALIDATION_ERROR', 'Provide multipart field "file" or JSON content_base64', $req->requestId, 422);
            return;
        }
        if (strlen($binary) > 15 * 1024 * 1024) {
            Response::error('VALIDATION_ERROR', 'File too large (max 15MB)', $req->requestId, 413);
            return;
        }
        if (isset($_POST['original_name']) && is_string($_POST['original_name']) && $_POST['original_name'] !== '') {
            $name = $_POST['original_name'];
        }

            $groupId = null;
            if ($req->json('group_id')) $groupId = trim((string) $req->json('group_id'));
            elseif (isset($_POST['group_id']) && is_string($_POST['group_id'])) $groupId = trim($_POST['group_id']);

            // Client input cannot grant group access. The uploader must already belong
            // to the selected group; otherwise the file remains explicitly global only.
            if ($groupId !== null && $groupId !== '') {
                $isStaff = in_array((string)$req->user->role, ['teacher','moderator','admin'], true);
                if ($isStaff) {
                    (new AcademicContextResolver())->assertActiveGroup($groupId);
                } else {
                    (new AcademicContextResolver())->assertGroupMember($req->user->id, $groupId);
                }
            }
            $visibility = trim((string) ($req->json('visibility') ?? $_POST['visibility'] ?? 'group'));
            if (!in_array($visibility, ['group','public'], true)) {
                Response::error('VALIDATION_ERROR','Unsupported file visibility',$req->requestId,422);
                return;
            }
            $specialty = trim((string) ($req->json('specialty_slug') ?? $_POST['specialty_slug'] ?? ''));
        $b2 = new B2Storage();
        $key = $b2->buildObjectKey($req->user->id, $name !== '' ? $name : 'upload.bin');
        try {
            if ($b2->isConfigured()) {
                $up = $b2->upload($key, $binary, $mime);
            } else {
                $up = ['object_key' => $key, 'b2_file_id' => null, 'size' => strlen($binary)];
                Logger::info('b2_skipped_not_configured', ['object_key' => $key]);
            }
            $meta = (new FileRepository())->create([
                'original_name' => $name !== '' ? $name : 'upload.bin',
                'mime_type' => $mime,
                'size_bytes' => $up['size'],
                'object_key' => $up['object_key'],
                'b2_file_id' => $up['b2_file_id'] ?? null,
                'uploaded_by' => $req->user->id,
                'group_id' => $groupId,
                'visibility' => $visibility,
                'specialty_slug' => $specialty,
                'sha256' => hash('sha256', $binary),
                'storage_provider' => !empty($up['b2_file_id']) ? 'b2' : 'unknown',
                'processing_status' => 'ready',
            ]);
            Response::success(['file' => $meta], $req->requestId, 201);
        } catch (\Throwable $e) {
            Logger::error('file_upload_failed', ['message' => $e->getMessage()]);
            Response::error('UPLOAD_FAILED', 'Could not store file', $req->requestId, 500);
        }
    });

    $router->get('/api/v1/files/{id}/download', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $file = (new FileRepository())->assertAccess((string)($params['id'] ?? ''), $req->user->id);
            if ($file === null || ($file['status'] ?? 'active') !== 'active') {
                Response::error('NOT_FOUND', 'File not found', $req->requestId, 404);
                return;
            }
            $requiredSpecialty = $requiredSpecialtyForFile($file);
            if ($requiredSpecialty !== '' && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, $requiredSpecialty)) {
                Response::error('FORBIDDEN', 'Этот файл недоступен для вашей специальности', $req->requestId, 403);
                return;
            }
            $b2 = new B2Storage();
            if ($b2->isConfigured() && !empty($file['object_key'])) {
                $url = $b2->presignedDownloadUrl((string)$file['object_key'], 3600);
                header('Location: '.$url, true, 302);
                exit;
            }
            Response::error('FILE_UNAVAILABLE', 'Storage is not configured', $req->requestId, 503);
        } catch (\Throwable $e) {
            Response::error('FILE_ERROR', 'Could not open file', $req->requestId, 503);
        }
    });

    $router->get('/api/v1/files/{id}', static function (Request $req, array $params): void {
        if (!RequireAuth::handle($req)) return;
        try {
            $file = (new FileRepository())->assertAccess((string)$params['id'], $req->user->id);
            if ($file === null) {
                Response::error('NOT_FOUND', 'File not found', $req->requestId, 404);
                return;
            }
            $requiredSpecialty = $requiredSpecialtyForFile($file);
            if ($requiredSpecialty !== '' && !(new SpecialtyAccess())->userHasSpecialty($req->user->id, $requiredSpecialty)) {
                Response::error('FORBIDDEN', 'Этот файл недоступен для вашей специальности', $req->requestId, 403);
                return;
            }
            $download = ['status' => 'unavailable', 'url' => null, 'expires_in' => null];
            $b2 = new B2Storage();
            if ($b2->isConfigured() && !empty($file['object_key'])) {
                try {
                    $url = $b2->presignedDownloadUrl((string) $file['object_key'], 3600);
                    $download = ['status' => 'ready', 'url' => $url, 'expires_in' => 3600];
                } catch (\Throwable $e) {
                    Logger::error('b2_presign_failed', ['message' => $e->getMessage()]);
                    $download['status'] = 'error';
                }
            }
            unset($file['is_histology_material']);
            Response::success(['file' => $file, 'download' => $download], $req->requestId);
        } catch (\Throwable $e) {
            Response::error('DB_UNAVAILABLE', 'Database is not available', $req->requestId, 503);
        }
    });
};
