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

        $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        $scriptDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
        if ($scriptDir !== '' && $scriptDir !== '/' && str_starts_with($path, $scriptDir)) {
            $path = substr($path, strlen($scriptDir)) ?: '/';
        }
        if (str_ends_with($path, '/index.php')) {
            $path = substr($path, 0, -strlen('/index.php')) ?: '/';
        }
        if ($path === 'index.php' || $path === '/index.php') {
            $path = '/';
        }
        if (($path === '/' || $path === '') && !empty($_SERVER['PATH_INFO'])) {
            $path = (string) $_SERVER['PATH_INFO'];
        }
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }
        if ($path === '' || !str_starts_with($path, '/')) {
            $path = '/' . ltrim($path, '/');
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

        $authCandidates = [
            $_SERVER['HTTP_AUTHORIZATION'] ?? null,
            $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
            $_SERVER['Authorization'] ?? null,
        ];
        foreach ($authCandidates as $cand) {
            if (is_string($cand) && $cand !== '') {
                $headers['Authorization'] = $cand;
                break;
            }
        }
        if (empty($headers['Authorization']) && function_exists('getallheaders')) {
            foreach (getallheaders() as $hk => $hv) {
                if (strcasecmp((string) $hk, 'Authorization') === 0 && is_string($hv) && $hv !== '') {
                    $headers['Authorization'] = $hv;
                    break;
                }
            }
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
        $auth = '';
        foreach ($this->headers as $k => $v) {
            if (strcasecmp((string) $k, 'Authorization') === 0) {
                $auth = (string) $v;
                break;
            }
        }
        // Access tokens must not be accepted from query parameters: URLs leak into logs and referrers.
        if (preg_match('/^Bearer\s+(\S+)/i', $auth, $m)) {
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
