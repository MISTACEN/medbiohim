<?php
declare(strict_types=1);

use Medbiohim\Http\Router;

return static function (Router $router): void {
    $dir = __DIR__ . '/routes';
    $files = [
        'health.php',
        'auth.php',
        'admin_rest.php',
        'profile_rest.php',
        'domain_rest.php',
        'community_rest.php',
        'progress_rest.php',
        'questions_rest.php',
        'admin_questions.php',
        'sessions_rest.php',
        'plans_rest.php',
        'import_rest.php',
        'domain.php',
        'tests.php',
        'preparation.php',
        'question_reports.php',
        'homework.php',
        'files.php',
        '00_admin_import_atomic.php',
        'admin.php',
        'platform.php',
        'tutor_rest.php',
        'calculators_rest.php',
        'lectures_rest.php',
        'search_rest.php',
        'settings_rest.php',
        'srs_rest.php',
    ];
    foreach ($files as $file) {
        $path = $dir . '/' . $file;
        if (is_readable($path)) {
            $register = require $path;
            if (is_callable($register)) {
                $register($router);
            }
        }
    }
};
