<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\Logger;

/** Backblaze B2 storage (Phase D). Staging until SigV4/native API is wired. */
final class B2Storage
{
    private string $keyId;
    private string $appKey;
    private string $bucket;
    private string $endpoint;

    public function __construct()
    {
        $this->keyId = Env::get('B2_KEY_ID', '') ?? '';
        $this->appKey = Env::get('B2_APPLICATION_KEY', '') ?? '';
        $this->bucket = Env::get('B2_BUCKET', '') ?? '';
        $this->endpoint = rtrim(Env::get('B2_ENDPOINT', '') ?? '', '/');
    }

    public function isConfigured(): bool
    {
        return $this->keyId !== '' && $this->appKey !== ''
            && $this->bucket !== '' && $this->endpoint !== '';
    }

    /** @return array{object_key: string, b2_file_id: ?string, size: int} */
    public function upload(string $objectKey, string $binary, string $contentType): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('B2 is not configured');
        }
        $staging = sys_get_temp_dir() . '/medbiohim_b2_' . hash('sha256', $objectKey);
        file_put_contents($staging, $binary);
        Logger::info('b2_upload_staged', [
            'object_key' => $objectKey,
            'size' => strlen($binary),
            'note' => 'Replace with native B2 or SigV4 PUT in production',
        ]);
        return [
            'object_key' => $objectKey,
            'b2_file_id' => null,
            'size' => strlen($binary),
        ];
    }

    public function buildObjectKey(string $userId, string $originalName): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9._-]+/', '_', $originalName) ?: 'file';
        $uuid = bin2hex(random_bytes(8));
        return sprintf('uploads/%s/%s_%s', $userId, $uuid, $safe);
    }
}
