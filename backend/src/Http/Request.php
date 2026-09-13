<?php
declare(strict_types=1);

namespace Medbiohim\Http;

use Medbiohim\Auth\AuthUser;

final class Request
{
    public ?AuthUser $user = null;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly string $requestId,
        public readonly array $query,
        public readonly array $headers,
        public readonly ?array $jsonBody,
        public readonly string $rawBody,
    ) {
    }

    public static function fromGlobals(string $requestId): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($k, 5)))));
                $headers[$name] = (string) $v;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['Content-Type'] = (string) $_SERVER['CONTENT_TYPE'];
        }

        $raw = file_get_contents('php://input') ?: '';
        $json = null;
        $ct = $headers['Content-Type'] ?? '';
        if ($raw !== '' && str_contains(strtolower($ct), 'application/json')) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $json = $decoded;
            }
        }

        return new self(
            method: $method,
            path: $path,
            requestId: $requestId,
            query: $_GET,
            headers: $headers,
            jsonBody: $json,
            rawBody: $raw,
        );
    }

    public function bearerToken(): ?string
    {
        $auth = $this->headers['Authorization'] ?? '';
        if (preg_match('/^Bearer\s+(\S+)$/i', $auth, $m)) {
            return $m[1];
        }
        return null;
    }

    public function json(string $key, mixed $default = null): mixed
    {
        if ($this->jsonBody === null) {
            return $default;
        }
        return $this->jsonBody[$key] ?? $default;
    }
}
