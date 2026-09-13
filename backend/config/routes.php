<?php
declare(strict_types=1);

use Medbiohim\Http\Router;

return static function (Router $router): void {
    $dir = __DIR__ . '/routes';
    foreach (['health.php', 'auth.php', 'domain.php', 'tests.php', 'homework.php', 'files.php'] as $file) {
        $path = $dir . '/' . $file;
        if (is_readable($path)) {
            $register = require $path;
            $register($router);
        }
    }
};
