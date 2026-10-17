<?php
declare(strict_types=1);

/**
 * One-way, resumable migration of SpaceWeb's local histology media to the
 * canonical private Upstash Blob bucket through the authenticated Worker API.
 *
 * Usage:
 *   MEDBIOHIM_CLOUDFLARE_API_URL=https://.../api/v1
 *   MEDBIOHIM_MIGRATION_BEARER_TOKEN=<admin Supabase access token>
 *   php backend/scripts/migrate-histology-to-upstash.php --dry-run
 *   php backend/scripts/migrate-histology-to-upstash.php
 *   php backend/scripts/migrate-histology-to-upstash.php --overwrite
 *
 * Local originals are never deleted. Run with --overwrite only when you intend
 * to replace existing objects at matching keys.
 */
require_once dirname(__DIR__) . '/src/Bootstrap.php';

use Medbiohim\Support\Env;

Env::load(dirname(__DIR__) . '/.env');
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit("Not found\n");
}
if (!extension_loaded('curl')) {
    fwrite(STDERR, "ERROR: PHP cURL extension is required.\n");
    exit(2);
}

$base = rtrim((string) Env::get('MEDBIOHIM_CLOUDFLARE_API_URL', ''), '/');
$token = (string) Env::get('MEDBIOHIM_MIGRATION_BEARER_TOKEN', '');
$root = rtrim((string) Env::get('HISTOLOGY_MEDIA_ROOT', dirname(__DIR__) . '/content/histology'), '/\\');
$dryRun = in_array('--dry-run', $argv, true);
$overwrite = in_array('--overwrite', $argv, true);

if ($base === '') {
    fwrite(STDERR, "ERROR: set MEDBIOHIM_CLOUDFLARE_API_URL to the Worker API base ending in /api/v1.\n");
    exit(2);
}
if (!$dryRun && $token === '') {
    fwrite(STDERR, "ERROR: set MEDBIOHIM_MIGRATION_BEARER_TOKEN to a current admin access token.\n");
    exit(2);
}
if (!is_dir($root)) {
    fwrite(STDERR, "ERROR: media directory not found: {$root}\n");
    exit(2);
}

$allowed = ['jpg','jpeg','png','gif','webp','bmp','pdf','doc','docx','txt','md','json'];
$total = 0;
$bytes = 0;
$uploaded = 0;
$skipped = 0;
$failed = 0;
$endpoint = $base . '/storage/histology-import';
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
);

foreach ($iterator as $fileInfo) {
    if (!$fileInfo->isFile()) continue;
    $path = $fileInfo->getPathname();
    $relative = str_replace('\\', '/', substr($path, strlen($root) + 1));
    if (str_starts_with($relative, '_cache/')) continue;
    $ext = strtolower(pathinfo($relative, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) continue;
    $size = (int) $fileInfo->getSize();
    $total++;
    $bytes += $size;
    $key = 'histology/' . $relative;
    if ($size < 1 || $size > 25 * 1024 * 1024) {
        $failed++;
        fwrite(STDOUT, "SKIP_SIZE\t{$relative}\t{$size}\n");
        continue;
    }
    if ($dryRun) {
        fwrite(STDOUT, "DRY_RUN\t{$key}\t{$size}\n");
        continue;
    }

    $mime = 'application/octet-stream';
    if (class_exists(\\finfo::class)) {
        $finfo = new \\finfo(FILEINFO_MIME_TYPE);
        $detected = $finfo->file($path);
        if (is_string($detected) && $detected !== '') $mime = $detected;
    }
    $curlFile = new CURLFile($path, $mime, basename($path));
    $post = ['key' => $key, 'file' => $curlFile, 'overwrite' => $overwrite ? '1' : '0'];
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $json = is_string($body) ? json_decode($body, true) : null;
    $state = $json['data']['status'] ?? $json['result']['status'] ?? null;
    if ($status >= 200 && $status < 300 && is_array($json)) {
        if ($state === 'already_exists') {
            $skipped++;
            fwrite(STDOUT, "EXISTS\t{$key}\t{$size}\n");
        } else {
            $uploaded++;
            fwrite(STDOUT, "UPLOADED\t{$key}\t{$size}\n");
        }
    } else {
        $failed++;
        fwrite(STDERR, "FAILED\t{$key}\tHTTP {$status}\t" . ($error ?: substr((string)$body, 0, 240)) . "\n");
    }
}

fwrite(STDOUT, sprintf(
    "SUMMARY\tmode=%s\ttotal=%d\tbytes=%d\tuploaded=%d\texists=%d\tfailed=%d\n",
    $dryRun ? 'dry-run' : ($overwrite ? 'overwrite' : 'skip-existing'),
    $total, $bytes, $uploaded, $skipped, $failed
));
exit($failed > 0 ? 1 : 0);
