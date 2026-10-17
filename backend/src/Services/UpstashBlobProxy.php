<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Http\Request;
use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
use Medbiohim\Support\Logger;

/**
 * Shared media proxy: SpaceWeb PHP reads the same private Upstash Blob objects
 * as the Cloudflare Worker. Supabase remains the metadata/index store.
 */
final class UpstashBlobProxy
{
    /** @return array{body:string,status:int}|null */
    public static function fetch(Request $request, string $objectKey): ?array
    {
        $base = rtrim((string) Env::get('MEDBIOHIM_CLOUDFLARE_API_URL', ''), '/');
        $token = $request->bearerToken();
        $key = trim($objectKey);
        if ($base === '' || $token === '' || $key === '' || !str_starts_with($key, 'histology/')) {
            return null;
        }
        if (strlen($key) > 1024 || str_contains($key, '\\\\') || str_contains($key, '..')
            || preg_match('/[?#\\x00-\\x1F\\x7F]/', $key)) {
            return null;
        }

        $url = $base . '/storage/object?key=' . rawurlencode($key);
        try {
            $result = HttpClient::request('GET', $url, null, [
                'Authorization: Bearer ' . $token,
                'Accept: */*',
            ], 45);
            if ($result['status'] === 200) {
                return ['body' => $result['body'], 'status' => 200];
            }
            if ($result['status'] !== 404) {
                Logger::error('upstash_blob_proxy_non_200', [
                    'status' => $result['status'],
                    'key' => $key,
                ]);
            }
        } catch (\\Throwable $e) {
            Logger::error('upstash_blob_proxy_failed', [
                'key' => $key,
                'error' => $e->getMessage(),
            ]);
        }
        return null;
    }

    public static function emit(Request $request, string $objectKey, string $mime, string $filename): bool
    {
        $object = self::fetch($request, $objectKey);
        if ($object === null) return false;

        $safeMime = preg_match('#^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+(?:;\\s*charset=[a-zA-Z0-9._-]+)?$#', $mime)
            ? $mime : 'application/octet-stream';
        $safeName = str_replace(["\\r", "\\n", '"', '\\\\'], '', basename($filename));
        header('Content-Type: ' . $safeMime);
        header('Content-Disposition: inline; filename="' . ($safeName !== '' ? $safeName : 'media.bin') . '"');
        header('Cache-Control: private, max-age=300');
        header('X-MBH-Media-Source: upstash-blob');
        echo $object['body'];
        exit;
    }
}
