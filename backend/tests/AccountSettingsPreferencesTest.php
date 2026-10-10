<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/Support/Env.php';
require_once dirname(__DIR__) . '/src/Services/AccountSettingsService.php';

use Medbiohim\Services\AccountSettingsService;

function assertPreference(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "[FAIL] {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "[PASS] {$label}\n";
}

$service = new AccountSettingsService();
assertPreference(true, method_exists($service, 'getPreferences'), 'auth/me preferences method exists');
$prefs = $service->getPreferences('');
assertPreference('system', $prefs['theme'] ?? null, 'default theme is available without an account id');
assertPreference('ru', $prefs['locale'] ?? null, 'default locale is available without an account id');
assertPreference(true, $prefs['notify_email'] ?? null, 'email notification default is available');
assertPreference('top', $prefs['trainer_layout'] ?? null, 'trainer layout default is available');

echo "Account settings preferences tests passed.\n";
