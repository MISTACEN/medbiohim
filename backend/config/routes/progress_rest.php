<?php
declare(strict_types=1);

use Medbiohim\Http\Request;
use Medbiohim\Http\Response;
use Medbiohim\Http\Router;
use Medbiohim\Middleware\RequireAuth;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Repositories\TestRepository;
use Medbiohim\Services\SupabaseAcademic;

return static function (Router $r): void {
    $r->get('/api/v1/progress', static function (Request $q, array $p): void {
        if (!RequireAuth::handle($q)) {
            return;
        }
        $homeworks = [];
        $attempts = [];
        $subjectId = trim((string) ($q->query['subject_id'] ?? ''));
        try {
            try {
                $homeworks = (new HomeworkRepository())->listForUser($q->user->id);
                if ($subjectId !== '') {
                    $homeworks = array_values(array_filter($homeworks, static fn($h) => (string) ($h['subject_id'] ?? '') === $subjectId));
                }
            } catch (\Throwable $e) {
                try {
                    $homeworks = SupabaseAcademic::homeworksForUser($q->user->id);
                    if ($subjectId !== '') {
                        $homeworks = array_values(array_filter($homeworks, static fn($h) => (string) ($h['subject_id'] ?? '') === $subjectId));
                    }
                } catch (\Throwable $x) {
                    $homeworks = [];
                }
            }
            try {
                $attempts = (new TestRepository())->attemptsForUser($q->user->id, $subjectId !== '' ? $subjectId : null);
            } catch (\Throwable $e) {
                $attempts = [];
            }

            $hwTotal = count($homeworks);
            $hwDone = 0;
            foreach ($homeworks as $h) {
                $st = (string) ($h['my_status'] ?? $h['status'] ?? $h['submission_status'] ?? '');
                if (in_array(strtolower($st), ['submitted', 'graded', 'done', 'сдано', 'оценено'], true)) {
                    $hwDone++;
                }
            }
            $testCount = count($attempts);
            $scores = [];
            foreach ($attempts as $a) {
                if (isset($a['score']) && is_numeric($a['score'])) {
                    $scores[] = (float) $a['score'];
                }
            }
            $avgScore = $scores ? round(array_sum($scores) / count($scores), 1) : null;
            $hwPct = $hwTotal ? (int) round($hwDone / $hwTotal * 100) : 0;
            $testsFinished = 0;
            foreach ($attempts as $a) {
                if (in_array((string) ($a['status'] ?? ''), ['finished', 'completed'], true)) {
                    $testsFinished++;
                }
            }
            $overallParts = [$hwPct];
            if ($testCount) {
                $overallParts[] = (int) round($testsFinished / $testCount * 100);
            }
            $overall = (int) round(array_sum($overallParts) / count($overallParts));

            Response::success([
                'overall_pct' => $overall,
                'homework' => [
                    'total' => $hwTotal,
                    'done' => $hwDone,
                    'percent' => $hwPct,
                    'items' => $homeworks,
                ],
                'tests' => [
                    'attempts' => $testCount,
                    'finished' => $testsFinished,
                    'avg_score' => $avgScore,
                    'items' => $attempts,
                ],
            ], $q->requestId);
        } catch (\Throwable $e) {
            \Medbiohim\Support\Logger::error('progress_failed', [
                'requestId' => $q->requestId,
                'message' => $e->getMessage(),
            ]);
            Response::error('DB_UNAVAILABLE', 'Прогресс временно недоступен: база данных не отвечает.', $q->requestId, 503);
        }
    });
};
