<?php
declare(strict_types=1);

/**
 * Static regression checks for homework SQL contracts.
 * These do not replace a live PostgreSQL integration test, but catch drift
 * between named placeholders and PDO parameter arrays without DB credentials.
 */
$path = dirname(__DIR__) . '/src/Repositories/HomeworkRepository.php';
$source = file_get_contents($path);
if (!is_string($source)) {
    fwrite(STDERR, "[FAIL] Cannot read HomeworkRepository.php\n");
    exit(1);
}

$checks = [
    'submission and progress use distinct placeholders' =>
        str_contains($source, 'sub.user_id = :uid_submission')
        && str_contains($source, 'hp.user_id = :uid_progress')
        && str_contains($source, "'uid_submission' => \$userId")
        && str_contains($source, "'uid_progress' => \$userId"),
    'attachment query has distinct nullable and match placeholders' =>
        str_contains($source, ':gid_null IS NULL OR group_id = :gid_match')
        && str_contains($source, "'gid_null' => \$groupId")
        && str_contains($source, "'gid_match' => \$groupId"),
    'homework list filters MBH histology by active MBH group' =>
        str_contains($source, 'COALESCE(s.slug')
        && str_contains($source, 'histology')
        && str_contains($source, 'g_mbh.specialty_slug')
        && str_contains($source, 'mbh'),
    'attachment upload requires active file owned by creator' =>
        str_contains($source, "status = 'active'")
        && str_contains($source, 'uploaded_by = :uid'),
];

$failed = false;
foreach ($checks as $label => $ok) {
    if ($ok) {
        echo "[PASS] {$label}\n";
    } else {
        fwrite(STDERR, "[FAIL] {$label}\n");
        $failed = true;
    }
}
if ($failed) exit(1);
echo "Homework SQL contract tests passed.\n";
