<?php
declare(strict_types=1);

namespace Medbiohim\Http;

use Medbiohim\Support\Env;

final class Cors
{
    public static function apply(): void
    {
        $origins = Env::get('CORS_ORIGINS', '*') ?? '*';
        $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($origins === '*') {
            header('Access-Control-Allow-Origin: *');
        } else {
            $allowed = array_map('trim', explode(',', $origins));
            if ($requestOrigin !== '' && in_array($requestOrigin, $allowed, true)) {
                header('Access-Control-Allow-Origin: ' . $requestOrigin);
                header('Vary: Origin');
            } elseif ($requestOrigin === '' && count($allowed) === 1) {
                header('Access-Control-Allow-Origin: ' . $allowed[0]);
            }
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id');
        header('Access-Control-Max-Age: 86400');
    }

    public static function handlePreflight(): bool
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            self::apply();
            Response::noContent();
            return true;
        }
        return false;
    }
}
