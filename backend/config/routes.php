<?php
declare(strict_types=1);

use Medbiohim\Http\Router;

/**
 * Aggregate route registrars (Phase A–D + platform).
 */
return static function (Router $router): void {
    $dir = __DIR__ . '/routes';
    foreach (['health.php', 'auth.php', 'domain.php', 'tests.php', 'homework.php', 'files.php', 'admin.php', 'platform.php'] as $file) {
        $path = $dir . '/' . $file;
        if (is_readable($path)) {
            $register = require $path;
            $register($router);
        }
    }
};
// synced 2026-09-15
