<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class Multipart
{
    public static function firstFile(string $field = 'file'): ?array
    {
        if (empty($_FILES[$field]) || !is_array($_FILES[$field])) {
            return null;
        }
        $f = $_FILES[$field];
        if (!isset($f['error']) || (int) $f['error'] !== UPLOAD_ERR_OK) {
            return null;
        }
        $tmp = $f['tmp_name'] ?? '';
        if (!is_string($tmp) || $tmp === '' || !is_uploaded_file($tmp)) {
            return null;
        }
        $binary = file_get_contents($tmp);
        if ($binary === false) {
            return null;
        }
        return [
            'name' => (string) ($f['name'] ?? 'upload.bin'),
            'type' => (string) ($f['type'] ?? 'application/octet-stream'),
            'size' => (int) ($f['size'] ?? strlen($binary)),
            'binary' => $binary,
        ];
    }
}
