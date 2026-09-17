<?php
declare(strict_types=1);

namespace Medbiohim\Http;

final class Response
{
    public static function json(array $payload, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success(mixed $data, string $requestId, int $status = 200): void
    {
        self::json([
            'ok' => true,
            'data' => $data,
            'requestId' => $requestId,
        ], $status);
    }

    public static function error(
        string $code,
        string $message,
        string $requestId,
        int $status = 400,
        ?array $details = null
    ): void {
        $error = [
            'code' => $code,
            'message' => $message,
        ];
        if ($details !== null) {
            $error['details'] = $details;
        }
        self::json([
            'ok' => false,
            'error' => $error,
            'requestId' => $requestId,
        ], $status);
    }

    public static function noContent(): void
    {
        http_response_code(204);
        exit;
    }
}
