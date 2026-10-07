<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
use Medbiohim\Support\Logger;

final class B2Storage
{
    private string $keyId;
    private string $appKey;
    private string $bucketName;

    private static ?array $authCache = null;
    private static ?string $bucketIdCache = null;

    public function __construct()
    {
        $this->keyId = Env::get('B2_KEY_ID', '') ?? '';
        $this->appKey = Env::get('B2_APPLICATION_KEY', '') ?? '';
        $this->bucketName = Env::get('B2_BUCKET', '') ?? '';
    }

    public function isConfigured(): bool
    {
        return $this->keyId !== '' && $this->appKey !== '' && $this->bucketName !== '';
    }

    public function upload(string $objectKey, string $binary, string $contentType): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('B2 is not configured');
        }
        $auth = $this->authorize();
        $bucketId = $this->resolveBucketId($auth);
        $upload = $this->getUploadUrl($auth, $bucketId);
        $sha1 = sha1($binary);
        $headers = [
            'Authorization: ' . $upload['authorizationToken'],
            'X-Bz-File-Name: ' . $this->b2EncodeFileName($objectKey),
            'Content-Type: ' . ($contentType !== '' ? $contentType : 'b2/x-auto'),
            'Content-Length: ' . (string) strlen($binary),
            'X-Bz-Content-Sha1: ' . $sha1,
        ];
        $res = $this->rawRequest('POST', $upload['uploadUrl'], $binary, $headers);
        if ($res['status'] < 200 || $res['status'] >= 300 || $res['json'] === null) {
            Logger::error('b2_upload_failed', ['status' => $res['status'], 'body' => substr($res['body'], 0, 300)]);
            throw new \RuntimeException('B2 upload failed');
        }
        return [
            'object_key' => $objectKey,
            'b2_file_id' => isset($res['json']['fileId']) ? (string) $res['json']['fileId'] : null,
            'size' => strlen($binary),
        ];
    }

    public function presignedDownloadUrl(string $objectKey, int $validSeconds = 3600): string
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('B2 is not configured');
        }
        $auth = $this->authorize();
        $url = rtrim($auth['apiUrl'], '/') . '/b2api/v2/b2_get_download_authorization';
        $res = HttpClient::request('POST', $url, [
            'bucketId' => $this->resolveBucketId($auth),
            'fileNamePrefix' => $objectKey,
            'validDurationInSeconds' => max(60, min($validSeconds, 604800)),
        ], ['Authorization: ' . $auth['authorizationToken']]);

        $token = $auth['authorizationToken'];
        if ($res['status'] >= 200 && $res['status'] < 300 && !empty($res['json']['authorizationToken'])) {
            $token = (string) $res['json']['authorizationToken'];
        }
        return sprintf(
            '%s/file/%s/%s?Authorization=%s',
            rtrim($auth['downloadUrl'], '/'),
            rawurlencode($this->bucketName),
            $this->b2EncodeFileName($objectKey),
            rawurlencode($token)
        );
    }

    /** @return array{files:list<array<string,mixed>>,nextFileName:?string} */
    public function listObjects(?string $prefix = null, int $max = 1000, ?string $startFileName = null): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('B2 is not configured');
        }
        $auth = $this->authorize();
        $body = [
            'bucketId' => $this->resolveBucketId($auth),
            'maxFileCount' => max(1, min($max, 10000)),
        ];
        if ($prefix !== null && $prefix !== '') $body['prefix'] = $prefix;
        if ($startFileName !== null && $startFileName !== '') $body['startFileName'] = $startFileName;

        $res = HttpClient::request(
            'POST',
            rtrim($auth['apiUrl'], '/') . '/b2api/v2/b2_list_file_names',
            $body,
            ['Authorization: ' . $auth['authorizationToken']]
        );
        if ($res['status'] < 200 || $res['status'] >= 300 || !is_array($res['json'])) {
            throw new \RuntimeException('B2 list_file_names failed');
        }

        $files = [];
        foreach (($res['json']['files'] ?? []) as $file) {
            if (!is_array($file)) continue;
            $files[] = [
                'file_id' => isset($file['fileId']) ? (string)$file['fileId'] : null,
                'file_name' => isset($file['fileName']) ? (string)$file['fileName'] : null,
                'content_type' => isset($file['contentType']) ? (string)$file['contentType'] : null,
                'size' => isset($file['contentLength']) ? (int)$file['contentLength'] : null,
                'sha1' => isset($file['contentSha1']) ? (string)$file['contentSha1'] : null,
                'uploaded_at' => isset($file['uploadTimestamp']) ? (int)$file['uploadTimestamp'] : null,
            ];
        }

        return [
            'files' => $files,
            'nextFileName' => isset($res['json']['nextFileName']) ? (string)$res['json']['nextFileName'] : null,
        ];
    }

    /** @return array<string,mixed> */
    public function getFileInfo(string $fileId): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('B2 is not configured');
        }
        $auth = $this->authorize();
        $res = HttpClient::request(
            'POST',
            rtrim($auth['apiUrl'], '/') . '/b2api/v2/b2_get_file_info',
            ['fileId' => trim($fileId)],
            ['Authorization: ' . $auth['authorizationToken']]
        );
        if ($res['status'] < 200 || $res['status'] >= 300 || !is_array($res['json'])) {
            throw new \RuntimeException('B2 get_file_info failed');
        }
        return $res['json'];
    }

    public function buildObjectKey(string $userId, string $originalName): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9._-]+/', '_', $originalName) ?: 'file';
        return sprintf('uploads/%s/%s_%s', $userId, bin2hex(random_bytes(8)), $safe);
    }

    private function authorize(): array
    {
        if (self::$authCache !== null) {
            return self::$authCache;
        }
        $res = HttpClient::request('GET', 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account', null, [
            'Authorization: Basic ' . base64_encode($this->keyId . ':' . $this->appKey),
        ]);
        if ($res['status'] !== 200 || $res['json'] === null) {
            throw new \RuntimeException('B2 authorize failed');
        }
        $j = $res['json'];
        self::$authCache = [
            'apiUrl' => (string) ($j['apiUrl'] ?? ''),
            'downloadUrl' => (string) ($j['downloadUrl'] ?? ''),
            'authorizationToken' => (string) ($j['authorizationToken'] ?? ''),
            'accountId' => (string) ($j['accountId'] ?? ''),
        ];
        return self::$authCache;
    }

    private function resolveBucketId(array $auth): string
    {
        if (self::$bucketIdCache !== null) {
            return self::$bucketIdCache;
        }
        $explicit = Env::get('B2_BUCKET_ID');
        if ($explicit) {
            return self::$bucketIdCache = $explicit;
        }
        $res = HttpClient::request('POST', rtrim($auth['apiUrl'], '/') . '/b2api/v2/b2_list_buckets', [
            'accountId' => $auth['accountId'],
            'bucketName' => $this->bucketName,
        ], ['Authorization: ' . $auth['authorizationToken']]);
        if ($res['status'] !== 200 || empty($res['json']['buckets'][0]['bucketId'])) {
            throw new \RuntimeException('B2 bucket not found');
        }
        return self::$bucketIdCache = (string) $res['json']['buckets'][0]['bucketId'];
    }

    private function getUploadUrl(array $auth, string $bucketId): array
    {
        $res = HttpClient::request('POST', rtrim($auth['apiUrl'], '/') . '/b2api/v2/b2_get_upload_url', [
            'bucketId' => $bucketId,
        ], ['Authorization: ' . $auth['authorizationToken']]);
        if ($res['status'] !== 200 || empty($res['json']['uploadUrl'])) {
            throw new \RuntimeException('B2 get_upload_url failed');
        }
        return [
            'uploadUrl' => (string) $res['json']['uploadUrl'],
            'authorizationToken' => (string) $res['json']['authorizationToken'],
        ];
    }

    private function b2EncodeFileName(string $name): string
    {
        return implode('/', array_map('rawurlencode', explode('/', $name)));
    }

    private function rawRequest(string $method, string $url, string $body, array $headers): array
    {
        if (!extension_loaded('curl')) {
            throw new \RuntimeException('curl required for B2 upload');
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_TIMEOUT => 120,
        ]);
        $resp = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp === false) {
            return ['status' => 0, 'body' => '', 'json' => null];
        }
        $json = json_decode($resp, true);
        return ['status' => $status, 'body' => $resp, 'json' => is_array($json) ? $json : null];
    }
}
