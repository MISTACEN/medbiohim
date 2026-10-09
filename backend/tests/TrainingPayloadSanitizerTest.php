<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/Security/TrainingPayloadSanitizer.php';

use Medbiohim\Security\TrainingPayloadSanitizer;

function assertSameValue(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "[FAIL] {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "[PASS] {$label}\n";
}

$trainingPayload = [
    'questions' => [[
        'question' => [
            'text' => 'Which cell is shown?',
            'explanation' => 'private explanation',
            'metadata' => ['grading' => ['correctAnswer' => 'nested private answer']],
            'options' => [
                ['id' => 'a', 'text' => 'A', 'correct' => true],
                ['id' => 'b', 'text' => 'B', 'is_correct' => false],
            ],
        ],
        'preparation' => [
            'imageUrl' => '/content/histology/example.png',
            'name' => 'Hidden preparation label',
            'organ' => 'Hidden organ',
            'captions' => [['label' => 'Answer marker']],
        ],
    ]],
];

$protectedPost = TrainingPayloadSanitizer::protect($trainingPayload, 'POST', '/api/v1/trainings');
$question = $protectedPost['questions'][0]['question'];
$preparation = $protectedPost['questions'][0]['preparation'];

assertSameValue(false, array_key_exists('explanation', $question), 'POST training strips nested explanation');
assertSameValue(false, array_key_exists('correctAnswer', $question['metadata']['grading']), 'POST training strips deeply nested correctness fields');
assertSameValue(false, array_key_exists('correct', $question['options'][0]), 'POST training strips option correctness');
assertSameValue(false, array_key_exists('is_correct', $question['options'][1]), 'POST training strips alternate correctness flag');
assertSameValue(false, array_key_exists('name', $preparation), 'POST training strips preparation name');
assertSameValue(false, array_key_exists('organ', $preparation), 'POST training strips preparation organ');
assertSameValue(false, array_key_exists('captions', $preparation), 'POST training strips preparation captions');
assertSameValue('/content/histology/example.png', $preparation['imageUrl'], 'POST training preserves media path');

$standaloneQuestion = TrainingPayloadSanitizer::sanitizeQuestion(json_encode([
    'prompt' => 'Nested question',
    'metadata' => ['review' => ['answer' => 'private', 'correctAnswer' => 'private']],
], JSON_THROW_ON_ERROR));
assertSameValue(false, array_key_exists('answer', $standaloneQuestion['metadata']['review']), 'shared route sanitizer accepts JSON strings and strips nested answers');
assertSameValue(false, array_key_exists('correctAnswer', $standaloneQuestion['metadata']['review']), 'shared route sanitizer strips nested correctness fields');

$getPayload = [
    'answers' => [
        [
            'user_answer' => null,
            'is_skipped' => false,
            'question_snapshot' => [
                'answer' => 'private',
                'options' => [['id' => 'a', 'correct' => true]],
            ],
            'review_snapshot' => ['correctAnswer' => 'private'],
        ],
        [
            'user_answer' => 'a',
            'is_skipped' => false,
            'question_snapshot' => ['answer' => 'review after answer'],
            'review_snapshot' => ['explanation' => 'review after answer'],
        ],
    ],
];

$protectedGet = TrainingPayloadSanitizer::protect($getPayload, 'GET', '/api/v1/trainings/session-123');
assertSameValue(false, array_key_exists('answer', $protectedGet['answers'][0]['question_snapshot']), 'GET session hides unanswered answer key');
assertSameValue(false, array_key_exists('correct', $protectedGet['answers'][0]['question_snapshot']['options'][0]), 'GET session hides unanswered option key');
assertSameValue(false, array_key_exists('correctAnswer', $protectedGet['answers'][0]['review_snapshot']), 'GET session hides unanswered review key');
assertSameValue('review after answer', $protectedGet['answers'][1]['question_snapshot']['answer'], 'GET session preserves answered review data');

$unrelated = ['answers' => [['question_snapshot' => ['answer' => 'unchanged']]]];
assertSameValue(
    $unrelated,
    TrainingPayloadSanitizer::protect($unrelated, 'GET', '/api/v1/tests/attempt-123'),
    'non-training endpoint payload is unchanged'
);

echo "TrainingPayloadSanitizer tests passed.\n";
