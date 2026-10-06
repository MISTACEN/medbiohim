<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Support\LlmGateway;

final class AnswerGradingService
{
    public static function grade(array $question, ?string $studentAnswer): array
    {
        $type = strtolower(trim((string)($question["type"] ?? "open")));
        $student = trim((string)($studentAnswer ?? ""));
        $reference = trim((string)($question["answer"] ?? ""));
        if ($student === "") return self::result(false, 0.0, "deterministic", 1.0, "Ответ не указан.");
        if ($type === "mcq") {
            $correct = self::gradeMcq($studentAnswer, $question["options"] ?? []);
            return self::result($correct, $correct ? 1.0 : 0.0, "deterministic", 1.0, null);
        }
        if ($reference !== "" && self::normalize($student) === self::normalize($reference)) {
            return self::result(true, 1.0, "deterministic", 1.0, "Ответ совпадает с эталоном.");
        }
        if ($reference === "") return self::result(null, 0.0, "pending", null, "Для этого вопроса не задан эталонный ответ.");
        $messages = [
            ["role" => "system", "content" => "Ты строгий учебный проверяющий. Сравни ответ студента с эталонным ответом на один учебный вопрос. Оцени смысл, а не буквальное совпадение. Синонимы, нормальные сокращения, другой порядок слов и грамматические формы допускаются. Нельзя засчитывать ответ, если в нем есть существенная фактическая ошибка, пропущена ключевая часть ответа или утверждение противоречит эталону. Не требуй дословного совпадения. Верни ТОЛЬКО JSON: {\"correct\":true|false,\"confidence\":0..1,\"feedback\":\"кратко\"}"],
            ["role" => "user", "content" => json_encode(["question" => (string)($question["text"] ?? $question["body"] ?? ""), "reference_answer" => $reference, "student_answer" => $student, "question_type" => $type], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
        ];
        try {
            $llm = LlmGateway::chat($messages, LlmGateway::TASK_CHAT, 0.0);
            $parsed = self::parseJson((string)($llm["text"] ?? ""));
            if (!is_array($parsed) || !array_key_exists("correct", $parsed)) throw new \RuntimeException("AI grading returned invalid JSON");
            $confidence = max(0.0, min(1.0, (float)($parsed["confidence"] ?? 0)));
            $aiCorrect = filter_var($parsed["correct"], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($aiCorrect === null) throw new \RuntimeException("AI grading returned invalid correctness");
            if ($confidence < 0.65) return ["is_correct" => null, "score" => 0.0, "grading_status" => "pending", "grading_source" => "ai", "confidence" => $confidence, "feedback" => (string)($parsed["feedback"] ?? "AI не смог уверенно определить корректность ответа."), "model" => (string)($llm["model"] ?? "")];
            return ["is_correct" => $aiCorrect, "score" => $aiCorrect ? 1.0 : 0.0, "grading_status" => "ai", "grading_source" => "ai", "confidence" => $confidence, "feedback" => self::cleanFeedback($parsed["feedback"] ?? null), "model" => (string)($llm["model"] ?? "")];
        } catch (\Throwable $e) {
            return ["is_correct" => null, "score" => 0.0, "grading_status" => "error", "grading_source" => "ai", "confidence" => null, "feedback" => "Автоматическая проверка ответа временно недоступна. Ответ сохранён и будет проверен повторно.", "model" => null];
        }
    }
    private static function gradeMcq(?string $given, mixed $options): bool {
        $items = is_array($options) ? $options : []; $correct = [];
        foreach ($items as $item) if (is_array($item) && !empty($item["correct"])) $correct[] = (string)($item["label"] ?? "");
        return self::normalizeList($given) !== [] && self::normalizeList($given) === self::normalizeList($correct);
    }
    private static function normalizeList(mixed $value): array {
        if (is_array($value)) $items = $value; elseif (is_string($value)) { $decoded = json_decode($value, true); $items = is_array($decoded) ? $decoded : [$value]; } else $items = [];
        $out = []; foreach ($items as $item) { if (is_array($item)) $item = $item["label"] ?? ""; $v = self::normalize((string)$item); if ($v !== "") $out[] = $v; }
        $out = array_values(array_unique($out)); sort($out); return $out;
    }
    private static function normalize(string $value): string {
        $value = mb_strtolower(trim($value)); $value = str_replace(["ё","—","–","−"],["е","-","-","-"],$value);
        $value = preg_replace("/\\s+/u"," ",$value) ?: $value; $value = preg_replace("/[[:punct:]«»„“”]/u"," ",$value) ?: $value;
        return trim(preg_replace("/\\s+/u"," ",$value) ?: $value);
    }
    private static function parseJson(string $text): ?array {
        $text = trim($text); $text = preg_replace("/^```(?:json)?\\s*|\\s*```$/iu","",$text) ?? $text;
        $decoded = json_decode($text,true); if (is_array($decoded)) return $decoded;
        if (preg_match("/\\{.*\\}/s",$text,$m)) { $decoded=json_decode($m[0],true); return is_array($decoded)?$decoded:null; } return null;
    }
    private static function cleanFeedback(mixed $value): ?string { $text=trim((string)($value ?? "")); return $text===""?null:mb_substr($text,0,500); }
    private static function result(?bool $correct,float $score,string $source,?float $confidence,?string $feedback): array { return ["is_correct"=>$correct,"score"=>$score,"grading_status"=>"deterministic","grading_source"=>$source,"confidence"=>$confidence,"feedback"=>$feedback,"model"=>null]; }
}
