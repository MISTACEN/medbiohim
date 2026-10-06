<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\SupabaseRest;

final class SrsService
{
    public function summary(string $userId): array
    {
        $cards = $this->cardsForUser($userId, 2000);
        $now = time();
        $due = 0;
        $learning = 0;
        $subjects = [];
        foreach ($cards as $row) {
            $dueAt = strtotime((string) ($row['due_at'] ?? '')) ?: 0;
            if ($dueAt <= $now) $due++;
            if ((int) ($row['reps'] ?? 0) > 0 && (int) ($row['interval'] ?? 0) < 2) $learning++;
            $slug = (string) ($row['subject_slug'] ?? '');
            if ($slug !== '') {
                $key = $slug;
                if (!isset($subjects[$key])) {
                    $subjects[$key] = [
                        'subject' => (string) ($row['subject_name'] ?? $row['subject_slug']),
                        'subject_slug' => $slug,
                        'count' => 0,
                    ];
                }
                $subjects[$key]['count']++;
            }
        }

        $questionRows = SupabaseRest::select(
            'questions?is_published=eq.true&archived_at=is.null&select=id&limit=2000'
        );
        $existing = [];
        foreach ($cards as $row) {
            if (($row['source_type'] ?? '') === 'question' && !empty($row['source_id'])) {
                $existing[(string) $row['source_id']] = true;
            }
        }
        $newAvailable = 0;
        foreach ($questionRows as $q) {
            if (!isset($existing[(string) ($q['id'] ?? '')])) $newAvailable++;
        }

        return [
            'due' => $due,
            'learning' => $learning,
            'total' => count($cards),
            'new_available' => $newAvailable,
            'subjects' => array_values($subjects),
        ];
    }

    public function ensureDeck(string $userId, int $count = 20, ?string $subjectId = null, ?string $subjectSlug = null): array
    {
        $count = max(1, min(50, $count));
        $cards = $this->cardsForUser($userId, 5000);
        $existing = [];
        foreach ($cards as $row) {
            if (($row['source_type'] ?? '') === 'question' && !empty($row['source_id'])) {
                $existing[(string) $row['source_id']] = true;
            }
        }

        $subjectRows = SupabaseRest::select('subjects?is_active=eq.true&select=id,name,slug&limit=500');
        $subjects = [];
        foreach ($subjectRows as $subject) {
            $subjects[(string) $subject['id']] = $subject;
        }

        $path = 'questions?is_published=eq.true&archived_at=is.null&select=id,text,answer,subject_id,topic&order=created_at.asc&limit=2000';
        if ($subjectId === null && $subjectSlug !== null && $subjectSlug !== '') {
            $resolvedSubjectId = null;
            foreach ($subjects as $subject) {
                if ((string) ($subject['slug'] ?? '') === $subjectSlug) {
                    $resolvedSubjectId = (string) ($subject['id'] ?? '');
                    break;
                }
            }
            if ($resolvedSubjectId === null || $resolvedSubjectId === '') {
                return ['added' => 0, 'total' => count($cards)];
            }
            $path .= '&subject_id=eq.' . rawurlencode($subjectId ?? $resolvedSubjectId);
        }
        $questions = SupabaseRest::select($path);

        $added = 0;
        foreach ($questions as $question) {
            if ($added >= $count) break;
            $qid = (string) ($question['id'] ?? '');
            if ($qid === '' || isset($existing[$qid])) continue;
            $subject = $subjects[(string) ($question['subject_id'] ?? '')] ?? [];
            SupabaseRest::insert('srs_cards', [
                'user_id' => $userId,
                'source_type' => 'question',
                'source_id' => $qid,
                'front' => (string) ($question['text'] ?? ''),
                'back' => (string) ($question['answer'] ?? ''),
                'subject_id' => $question['subject_id'] ?? null,
                'subject_slug' => $subject['slug'] ?? $subjectSlug,
                'topic' => $question['topic'] ?? null,
                'ease' => 2.5,
                'interval' => 0,
                'reps' => 0,
                'due_at' => gmdate('c'),
            ], false);
            $added++;
        }

        return ['added' => $added, 'total' => count($cards) + $added];
    }

    public function dueCards(string $userId, int $limit = 20, ?string $subjectId = null, ?string $subjectSlug = null, ?string $scope = null): array
    {
        $rows = $this->cardsForUser($userId, 2000);
        $now = time();
        $out = [];
        foreach ($rows as $row) {
            if (($scope === 'shared' && ($row['source_type'] ?? '') !== 'question')
                || ($scope === 'personal' && ($row['source_type'] ?? '') !== 'personal')) {
                continue;
            }
            if ($subjectId !== null && $subjectId !== '' && (string) ($row['subject_id'] ?? '') !== $subjectId) continue;
            if ($subjectId === null && $subjectSlug !== null && $subjectSlug !== '' && (string) ($row['subject_slug'] ?? '') !== $subjectSlug) continue;
            $dueAt = strtotime((string) ($row['due_at'] ?? '')) ?: 0;
            if ($dueAt > $now) continue;
            $out[] = $this->formatCard($row, $now);
        }
        usort($out, static fn(array $a, array $b): int => ((int) $a['due_at'] <=> (int) $b['due_at']));
        return array_slice($out, 0, max(1, min(50, $limit)));
    }

    public function listCards(string $userId, int $limit = 100, ?string $subjectId = null, ?string $subjectSlug = null, ?string $scope = null): array
    {
        $rows = $this->cardsForUser($userId, 2000);
        $out = [];
        $now = time();
        foreach ($rows as $row) {
            if (($scope === 'shared' && ($row['source_type'] ?? '') !== 'question')
                || ($scope === 'personal' && ($row['source_type'] ?? '') !== 'personal')) continue;
            if ($subjectId !== null && $subjectId !== '' && (string) ($row['subject_id'] ?? '') !== $subjectId) continue;
            $out[] = $this->formatCard($row, $now);
        }
        usort($out, static fn(array $a, array $b): int => ((int) $a['due_at'] <=> (int) $b['due_at']));
        return array_slice($out, 0, max(1, min(200, $limit)));
    }

    public function addCard(string $userId, array $payload): array
    {
        $front = trim((string) ($payload['front'] ?? ''));
        $back = trim((string) ($payload['back'] ?? ''));
        if ($front === '') throw new InvalidArgumentException('front обязателен');
        $subjectId = trim((string) ($payload['subject_id'] ?? ''));
        $subjectSlug = trim((string) ($payload['subject_slug'] ?? ''));
        if ($subjectId === '') $subjectId = null;
        $subjectName = '';
        if ($subjectId !== null) {
            $subjects = SupabaseRest::select('subjects?id=eq.' . rawurlencode($subjectId) . '&is_active=eq.true&select=id,name,slug&limit=1');
        } elseif ($subjectSlug !== '') {
            $subjects = SupabaseRest::select('subjects?slug=eq.' . rawurlencode($subjectSlug) . '&is_active=eq.true&select=id,name,slug&limit=1');
            if ($subjects) {
                $subjectId = $subjects[0]['id'] ?? null;
                $subjectName = (string) ($subjects[0]['name'] ?? '');
            }
        }
        $row = SupabaseRest::insert('srs_cards', [
            'user_id' => $userId,
            'source_type' => 'personal',
            'front' => $front,
            'back' => $back,
            'subject_id' => $subjectId,
            'subject_slug' => $subjectSlug !== '' ? $subjectSlug : null,
            'topic' => trim((string) ($payload['topic'] ?? '')) ?: null,
            'ease' => 2.5,
            'interval' => 0,
            'reps' => 0,
            'due_at' => gmdate('c'),
        ], true);
        $card = $row[0] ?? [];
        $card['subject_name'] = $subjectName;
        return $this->formatCard($card, time());
    }

    public function review(string $userId, string $cardId, int $rating): array
    {
        if ($rating < 1 || $rating > 4) throw new InvalidArgumentException('rating должен быть от 1 до 4');
        $rows = SupabaseRest::select('srs_cards?id=eq.' . rawurlencode($cardId) . '&user_id=eq.' . rawurlencode($userId) . '&select=*');
        if (!$rows) throw new InvalidArgumentException('Карточка не найдена');
        $row = $rows[0];
        $ease = (float) ($row['ease'] ?? 2.5);
        $interval = (int) ($row['interval'] ?? 0);
        $reps = (int) ($row['reps'] ?? 0);

        if ($rating === 1) {
            $reps = 0;
            $interval = 1;
            $ease = max(1.3, $ease - 0.2);
        } elseif ($rating === 2) {
            $reps++;
            $interval = max(1, (int) ceil(max(1, $interval) * 1.4));
            $ease = max(1.3, $ease - 0.05);
        } elseif ($rating === 3) {
            $reps++;
            $interval = $interval > 0 ? max(1, (int) ceil($interval * $ease)) : 1;
        } else {
            $reps++;
            $interval = $interval > 0 ? max(1, (int) ceil($interval * $ease * 1.3)) : 2;
            $ease = min(3.2, $ease + 0.15);
        }

        $dueAt = gmdate('c', time() + $interval * 86400);
        $updated = SupabaseRest::patch(
            'srs_cards?id=eq.' . rawurlencode($cardId) . '&user_id=eq.' . rawurlencode($userId),
            [
                'ease' => $ease,
                'interval' => $interval,
                'reps' => $reps,
                'due_at' => $dueAt,
                'reviewed_at' => gmdate('c'),
                'updated_at' => gmdate('c'),
            ],
            true
        );
        return [
            'card' => $this->formatCard($updated[0] ?? array_merge($row, [
                'ease'=>$ease,'interval'=>$interval,'reps'=>$reps,'due_at'=>$dueAt,'reviewed_at'=>gmdate('c')
            ]), time()),
            'summary' => $this->summary($userId),
        ];
    }

    public function removeCard(string $userId, string $cardId): bool
    {
        $rows = SupabaseRest::select(
            'srs_cards?id=eq.' . rawurlencode($cardId)
            . '&user_id=eq.' . rawurlencode($userId)
            . '&select=id&limit=1'
        );
        if (!$rows) return false;
        SupabaseRest::deleteWhere(
            'srs_cards?id=eq.' . rawurlencode($cardId)
            . '&user_id=eq.' . rawurlencode($userId)
        );
        return true;
    }

    private function cardsForUser(string $userId, int $limit): array
    {
        $rows = SupabaseRest::select(
            'srs_cards?user_id=eq.' . rawurlencode($userId)
            . '&select=id,user_id,source_type,source_id,front,back,subject_id,subject_slug,topic,ease,interval,reps,due_at,reviewed_at,created_at,updated_at'
            . '&order=due_at.asc&limit=' . (int) $limit
        );
        if (!$rows) return [];
        $subjects = SupabaseRest::select('subjects?is_active=eq.true&select=id,name,slug&limit=500');
        $bySlug = [];
        foreach ($subjects as $subject) $bySlug[(string) ($subject['slug'] ?? '')] = (string) ($subject['name'] ?? '');
        foreach ($rows as &$row) {
            $row['subject_name'] = $bySlug[(string) ($row['subject_slug'] ?? '')] ?? (string) ($row['subject_slug'] ?? '');
        }
        unset($row);
        return $rows;
    }

    private function formatCard(array $row, int $now): array
    {
        $subjectSlug = (string) ($row['subject_slug'] ?? '');
        $subject = $subjectSlug;
        if (!empty($row['subject_name'])) $subject = (string) $row['subject_name'];
        return [
            'id' => (string) ($row['id'] ?? ''),
            'front' => (string) ($row['front'] ?? ''),
            'back' => (string) ($row['back'] ?? ''),
            'subject' => $subject,
            'subject_slug' => $subjectSlug,
            'topic' => (string) ($row['topic'] ?? ''),
            'source' => ($row['source_type'] ?? '') === 'personal' ? 'personal' : 'question',
            'ease' => (float) ($row['ease'] ?? 2.5),
            'interval' => (int) ($row['interval'] ?? 0),
            'reps' => (int) ($row['reps'] ?? 0),
            'due_at' => strtotime((string) ($row['due_at'] ?? '')) ?: $now,
            'due_in_hours' => round(((strtotime((string) ($row['due_at'] ?? '')) ?: $now) - $now) / 3600, 1),
            'reviewed_at' => $row['reviewed_at'] ?? null,
        ];
    }
}
