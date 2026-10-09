<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/Services/SupabaseAuth.php';

use Medbiohim\Services\SupabaseAuth;

function assertRole(?string $expected, ?string $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "[FAIL] {$label}: expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "[PASS] {$label}\n";
}

assertRole(
    null,
    SupabaseAuth::trustedRoleFromUserPayload(['user_metadata' => ['role' => 'admin']]),
    'user-editable metadata cannot grant admin'
);
assertRole(
    null,
    SupabaseAuth::trustedRoleFromUserPayload(['role' => 'admin']),
    'top-level role field cannot grant admin'
);
assertRole(
    'student',
    SupabaseAuth::trustedRoleFromUserPayload([
        'user_metadata' => ['role' => 'admin'],
        'app_metadata' => ['role' => 'student'],
    ]),
    'server-controlled app_metadata overrides editable metadata'
);
assertRole(
    'admin',
    SupabaseAuth::trustedRoleFromUserPayload(['app_metadata' => ['role' => 'admin']]),
    'server-controlled admin role is preserved'
);
assertRole(
    null,
    SupabaseAuth::trustedRoleFromUserPayload(['app_metadata' => ['role' => ['admin']]]),
    'malformed role claims are rejected'
);

echo "SupabaseAuth role tests passed.\n";
