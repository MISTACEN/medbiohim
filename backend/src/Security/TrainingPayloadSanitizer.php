<?php
declare(strict_types=1);

namespace Medbiohim\Security;

final class TrainingPayloadSanitizer
{
    private static function removeKeys(mixed $value): mixed
    {
        if (!is_array($value)) return $value;
        foreach (['correct', 'isCorrect', 'is_correct', 'explanation', 'answer', 'correctAnswer', 'correct_answer', 'correctOption', 'correct_option', 'correctOptionId', 'correct_option_id'] as $key) {
            unset($value[$key]);
        }
        foreach ($value as &$child) {
            if (is_array($child)) $child = self::removeKeys($child);
        }
        unset($child);
        return $value;
    }

    public static function protect(mixed $data, string $method, string $path): mixed
    {
        if (!is_array($data) || !preg_match('#/trainings(?:/|$)#', $path)) return $data;

        if (strtoupper($method) === 'POST' && preg_match('#/trainings/?$#', $path) && is_array($data['questions'] ?? null)) {
            foreach ($data['questions'] as &$question) $question = self::removeKeys($question);
            unset($question);
            return $data;
        }

        if (strtoupper($method) === 'GET' && preg_match('#/trainings/[^/]+/?$#', $path) && is_array($data['answers'] ?? null)) {
            foreach ($data['answers'] as &$answer) {
                if (!is_array($answer)) continue;
                $answered = ($answer['user_answer'] ?? null) !== null || !empty($answer['is_skipped']);
                if ($answered) continue;
                foreach (['options', 'question_snapshot', 'review_snapshot'] as $key) {
                    if (isset($answer[$key])) $answer[$key] = self::removeKeys($answer[$key]);
                }
            }
            unset($answer);
        }

        return $data;
    }
}
