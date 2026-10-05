<?php
declare(strict_types=1);

namespace Medbiohim;

use Medbiohim\Http\Cors;
use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Support\Env;
use Medbiohim\Support\Logger;

final class Bootstrap
{
    public static function run(): void
    {
        $root = dirname(__DIR__);

        spl_autoload_register(static function (string $class) use ($root): void {
            $prefix = 'Medbiohim\\';
            if (!str_starts_with($class, $prefix)) {
                return;
            }
            $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
            $file = $root . '/src/' . $relative . '.php';
            if (is_readable($file)) {
                require_once $file;
            }
        });

        Env::load($root . '/.env');
        Logger::init($root . '/logs/app.log');

        set_exception_handler(static function (\Throwable $e): void {
            $requestId = bin2hex(random_bytes(8));
            try {
                Logger::error('uncaught', [
                    'requestId' => $requestId,
                    'class' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            } catch (\Throwable $ignored) {
            }
            // Message always includes class/file/line (works with old Response::error without $details)
            $msg = $e::class . ': ' . $e->getMessage()
                . ' @' . basename((string)$e->getFile()) . ':' . $e->getLine();
            try {
                Response::error('INTERNAL_ERROR', $msg, $requestId, 500);
            } catch (\Throwable $ignored) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode([
                    'ok' => false,
                    'error' => ['code' => 'INTERNAL_ERROR', 'message' => $msg],
                    'requestId' => $requestId,
                ], JSON_UNESCAPED_UNICODE);
            }
            exit;
        });

        set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
            if (!(error_reporting() & $severity)) {
                return false;
            }
            // The self-contained compressed trainings route is decoded into a
            // temporary global-namespace file and may emit PHP's harmless
            // non-compound `use X;` warning on load. Keep this exception scoped
            // to that generated payload; do not hide the same warning elsewhere.
            if (
                $severity === E_WARNING
                && str_contains($message, 'The use statement with non-compound name')
                && str_starts_with(basename($file), 'mbh_tr_')
            ) {
                return true;
            }
            throw new \ErrorException($message, 0, $severity, $file, $line);
        });

        if (Cors::handlePreflight()) {
            return;
        }
        Cors::apply();

        $requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? bin2hex(random_bytes(8));
        header('X-Request-Id: ' . $requestId);

        $request = Request::fromGlobals($requestId);
        Logger::info('request', [
            'requestId' => $requestId,
            'method' => $request->method,
            'path' => $request->path,
        ]);

        $router = new Router();
        $register = require $root . '/config/routes.php';
        $register($router);
        $router->dispatch($request);
    }
}
