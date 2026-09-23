<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
use Medbiohim\Support\LlmGateway;
use Medbiohim\Support\Logger;
use Medbiohim\Support\Str;
use PDO;

final class TelegramHomeworkService
{
    private PDO $db;
    private string $token;
    private string $secret;
    private ?string $actorUserId;

    public function __construct()
    {
        $this->db = Connection::pdo();
        $this->token = trim((string) (Env::get('TELEGRAM_BOT_TOKEN', '') ?? ''));
        $this->secret = trim((string) (Env::get('TELEGRAM_WEBHOOK_SECRET', '') ?? ''));
        $this->actorUserId = trim((string) (Env::get('TELEGRAM_BOT_USER_ID', '') ?? '')) ?: null;
    }

    public function configured(): bool
    {
        return $this->token !== '' && $this->actorUserId !== null;
    }

    public function webhookSecretMatches(?string $value): bool
    {
        return $this->secret === '' || hash_equals($this->secret, (string) $value);
    }

    public function handleUpdate(array $update): array
    {
        $message = $update['message'] ?? $update['edited_message'] ?? null;
        if (!is_array($message) || !isset($message['chat']['id'], $message['message_id'])) {
            return ['status' => 'ignored', 'reason' => 'not_a_message'];
        }

        $chatId = (int) $message['chat']['id'];
        $messageId = (int) $message['message_id'];
        $stored = $this->storeMessage($message);

        if ($stored['duplicate']) {
            return ['status' => 'duplicate', 'message_id' => $stored['id']];
        }

        $chat = $this->resolveChat($message['chat']);
        if (!$chat || !$chat['group_id'] || !$chat['is_active']) {
            $this->markMessage((string) $stored['id'], 'ignored', 'unmapped_chat');
            return ['status' => 'ignored', 'reason' => 'chat_not_mapped'];
        }

        // A photo/document sent as a reply to an already imported homework
        // belongs to that homework even when the attachment itself has no caption.
        $replyHomework = $this->findHomeworkByReply($chat['telegram_chat_id'] ?? $message['chat']['id'], $message['reply_to_message']['message_id'] ?? null);
        $mediaGroupHomework = $this->findHomeworkByMediaGroup(
            (int) ($message['chat']['id'] ?? 0),
            isset($message['media_group_id']) ? (string) $message['media_group_id'] : null
        );
        $attachmentHomework = $replyHomework ?: $mediaGroupHomework;
        if ($attachmentHomework && (isset($message['photo']) || isset($message['document']))) {
            $attachments = $this->importAttachments(
                $message,
                $chat['group_id'],
                (string) $stored['id'],
                (string) $attachmentHomework['id']
            );
            $this->linkMessage((string) $stored['id'], (string) $attachmentHomework['id'], $replyHomework ? 0.99 : 0.97);
            $this->markMessage((string) $stored['id'], 'processed');
            return [
                'status' => 'processed',
                'created' => false,
                'attached_to_homework_id' => $attachmentHomework['id'],
                'attachments' => $attachments,
            ];
        }

        $classification = $this->classify($message);
        $this->updateClassification((string) $stored['id'], $classification);

        if ($classification['type'] !== 'homework' || $classification['confidence'] < 0.60) {
            $this->markMessage((string) $stored['id'], 'processed');
            return [
                'status' => 'processed',
                'classification' => $classification,
                'created' => false,
            ];
        }

        $subject = $this->resolveSubject($chat['group_id'], $message, $classification);
        $title = $this->buildTitle($message, $subject);
        $description = $this->buildDescription($message, $classification);

        $dueText = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        if (!empty($classification['due_hint'])) {
            $dueText .= ' ' . (string) $classification['due_hint'];
        }
        $homework = $this->findRecentHomework(
            $chat['group_id'],
            $subject['id'] ?? null,
            $title
        );

        if (!$homework) {
            $homework = (new HomeworkRepository())->create(
                $title,
                $description,
                $subject['id'] ?? null,
                $chat['group_id'],
                $this->extractDueAt($dueText),
                $this->actorUserId
            );
        } else {
            $this->appendDescription($homework['id'], $description);
        }

        $this->linkMessage((string) $stored['id'], (string) $homework['id'], $classification['confidence']);

        $attachments = $this->importAttachments(
            $message,
            $chat['group_id'],
            (string) $stored['id'],
            (string) $homework['id']
        );

        $this->markMessage((string) $stored['id'], 'processed');

        return [
            'status' => 'processed',
            'created' => true,
            'homework_id' => $homework['id'],
            'subject' => $subject,
            'classification' => $classification,
            'attachments' => $attachments,
        ];
    }

    private function storeMessage(array $message): array
    {
        $chatId = (int) $message['chat']['id'];
        $messageId = (int) $message['message_id'];

        $existing = $this->db->prepare(
            'SELECT id FROM public.telegram_messages
             WHERE telegram_chat_id = :chat AND telegram_message_id = :message LIMIT 1'
        );
        $existing->execute(['chat' => $chatId, 'message' => $messageId]);
        $id = $existing->fetchColumn();
        if ($id !== false) return ['id' => $id, 'duplicate' => true];

        $text = isset($message['text']) ? (string) $message['text'] : null;
        $caption = isset($message['caption']) ? (string) $message['caption'] : null;
        $date = isset($message['date']) ? gmdate('c', (int) $message['date']) : null;
        $userId = isset($message['from']['id']) ? (int) $message['from']['id'] : null;
        $replyId = isset($message['reply_to_message']['message_id'])
            ? (int) $message['reply_to_message']['message_id'] : null;
        $mediaGroupId = isset($message['media_group_id']) ? (string) $message['media_group_id'] : null;

        $stmt = $this->db->prepare(
            'INSERT INTO public.telegram_messages
             (telegram_chat_id, telegram_message_id, telegram_user_id, reply_to_message_id,
              message_text, caption, telegram_date, telegram_media_group_id, raw_payload)
             VALUES (:chat,:message,:user,:reply,:text,:caption,:date,:media_group,:raw)
             RETURNING id'
        );
        $stmt->execute([
            'chat' => $chatId,
            'message' => $messageId,
            'user' => $userId,
            'reply' => $replyId,
            'text' => $text,
            'caption' => $caption,
            'date' => $date,
            'media_group' => $mediaGroupId,
            'raw' => json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        return ['id' => $stmt->fetchColumn(), 'duplicate' => false];
    }

    private function resolveChat(array $chat): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM public.telegram_bot_chats
             WHERE telegram_chat_id = :id LIMIT 1'
        );
        $stmt->execute(['id' => (int) $chat['id']]);
        $row = $stmt->fetch();
        if ($row !== false) return $row;

        $title = (string) ($chat['title'] ?? $chat['username'] ?? '');
        $insert = $this->db->prepare(
            'INSERT INTO public.telegram_bot_chats
             (telegram_chat_id, telegram_chat_type, telegram_title)
             VALUES (:id,:type,:title)
             ON CONFLICT (telegram_chat_id) DO UPDATE SET telegram_title=EXCLUDED.telegram_title,
               telegram_chat_type=EXCLUDED.telegram_chat_type
             RETURNING *'
        );
        $insert->execute([
            'id' => (int) $chat['id'],
            'type' => (string) ($chat['type'] ?? 'group'),
            'title' => $title !== '' ? $title : null,
        ]);
        return $insert->fetch() ?: null;
    }

    private function findHomeworkByReply(int|string $chatId, mixed $replyMessageId): ?array
    {
        if ($replyMessageId === null || $replyMessageId === '') return null;
        $stmt = $this->db->prepare(
            'SELECT h.*
             FROM public.telegram_messages source
             JOIN public.telegram_homework_links l ON l.telegram_message_id = source.id
             JOIN public.homeworks h ON h.id = l.homework_id
             WHERE source.telegram_chat_id = :chat
               AND source.telegram_message_id = :message
             ORDER BY l.created_at DESC
             LIMIT 1'
        );
        $stmt->execute(['chat' => (int) $chatId, 'message' => (int) $replyMessageId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private function findHomeworkByMediaGroup(int $chatId, ?string $mediaGroupId): ?array
    {
        if ($chatId === 0 || $mediaGroupId === null || $mediaGroupId === '') return null;
        $stmt = $this->db->prepare(
            'SELECT h.*
             FROM public.telegram_messages source
             JOIN public.telegram_homework_links l ON l.telegram_message_id = source.id
             JOIN public.homeworks h ON h.id = l.homework_id
             WHERE source.telegram_chat_id = :chat
               AND source.telegram_media_group_id = :media_group
             ORDER BY l.created_at ASC
             LIMIT 1'
        );
        $stmt->execute(['chat' => $chatId, 'media_group' => $mediaGroupId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private function classify(array $message): array
    {
        $text = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        $lower = mb_strtolower($text);
        $hasAttachment = isset($message['photo']) || isset($message['document']);

        $positive = [
            'дз','домашн','задани','сделать','подготовить','выучить','решить',
            'прочитать','ответить','к следующ','к следующему','до завтра','до пятниц',
            'к семинар','к практик','к лаб','лаборатор','контрольн',
        ];
        $negative = [
            'кто знает','кто-нибудь знает','расписание','перенесли','отмена',
            'спасибо','кто идет','кто идёт','во сколько',
        ];

        $score = $hasAttachment ? 0.38 : 0.0;
        foreach ($positive as $word) if (mb_strpos($lower, $word) !== false) $score += 0.16;
        foreach ($negative as $word) if (mb_strpos($lower, $word) !== false) $score -= 0.25;
        $score = max(0.0, min(0.99, $score));

        $base = [
            'type' => $score >= 0.60 ? 'homework' : ($hasAttachment ? 'material_candidate' : 'other'),
            'confidence' => $score,
            'reason' => $hasAttachment ? 'attachment_and_homework_signals' : 'text_homework_signals',
            'subject_hint' => null,
            'due_hint' => null,
        ];

        // LLM is a second-pass semantic classifier, not the source of academic truth.
        // It may improve classification/subject/date extraction, but never invents a
        // curriculum event or a schedule date. If no provider is configured, heuristic
        // classification continues to work unchanged.
        if ($text !== '' && ($score >= 0.20 || $hasAttachment)) {
            $ai = $this->aiClassify($message, $base);
            if ($ai !== null) {
                $aiType = (string) ($ai['type'] ?? '');
                $aiConfidence = isset($ai['confidence']) ? (float) $ai['confidence'] : 0.0;
                if (in_array($aiType, ['homework', 'material_candidate', 'other'], true)
                    && $aiConfidence >= 0.0 && $aiConfidence <= 1.0) {
                    // Require a reasonably strong AI signal before overriding a
                    // deterministic homework classification with something else.
                    if ($aiType === 'homework' || $aiConfidence >= 0.72 || $base['type'] !== 'homework') {
                        $base['type'] = $aiType;
                        $base['confidence'] = $aiConfidence;
                        $base['reason'] = 'llm_' . Str::sub((string) ($ai['reason'] ?? 'semantic_classification'), 0, 80);
                    }
                }
                $base['subject_hint'] = trim((string) ($ai['subject_hint'] ?? '')) ?: null;
                $base['due_hint'] = trim((string) ($ai['due_hint'] ?? '')) ?: null;
            }
        }

        if ($text === '' && !$hasAttachment) {
            $base['type'] = 'other';
            $base['confidence'] = 0.10;
            $base['reason'] = 'empty';
        }

        return $base;
    }

    private function aiClassify(array $message, array $base): ?array
    {
        $text = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        $chatTitle = trim((string) ($message['chat']['title'] ?? ''));
        if ($text === '') return null;

        $system = <<<TXT
Ты классифицируешь сообщения учебной группы Telegram для образовательной системы MEDBIOHIM.
Верни ТОЛЬКО JSON без markdown:
{"type":"homework|material_candidate|other","confidence":0.0,"subject_hint":"","due_hint":"","reason":""}

homework = сообщение содержит конкретное задание студентам: что сделать/выучить/прочитать/решить/подготовить, включая задания к следующему занятию.
material_candidate = файл/фото/материал, который сам по себе не содержит понятного задания.
other = обсуждение, вопрос, расписание, перенос, отмена, благодарность и т.п.

subject_hint — только предмет, если он явно или достаточно однозначно следует из сообщения.
due_hint — только срок, если он явно указан словами или датой. НИКОГДА не придумывай дату.
confidence — уверенность именно в классификации.
TXT;

        $prompt = [
            'chat_title' => $chatTitle,
            'message' => $text,
            'has_attachment' => isset($message['photo']) || isset($message['document']),
            'heuristic' => $base,
        ];

        try {
            $result = LlmGateway::chatProvider('auto', [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => json_encode($prompt, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
            ], 0.1);
        } catch (\\Throwable $e) {
            Logger::error('telegram_ai_classification_failed', ['error' => $e->getMessage()]);
            return null;
        }

        $raw = trim((string) ($result['text'] ?? ''));
        if ($raw === '') return null;
        if (preg_match('/\{.*\}/s', $raw, $m)) $raw = $m[0];
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function resolveSubject(string $groupId, array $message, array $classification): array
    {
        $text = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        $hint = trim((string) ($classification['subject_hint'] ?? ''));
        $lower = mb_strtolower($text . ' ' . $hint);

        $messageDate = isset($message['date']) ? gmdate('Y-m-d', (int) $message['date']) : gmdate('Y-m-d');
        $stmt = $this->db->prepare(
            "SELECT DISTINCT s.id, s.name, s.semester, s.course_number,
                    MIN(ABS((se.date - CAST(:message_date AS date)))) AS date_distance
             FROM public.schedule_entries se
             JOIN public.schedules sch ON sch.id = se.schedule_id AND sch.is_active = true
             JOIN public.subjects s ON s.id = se.subject_id
             WHERE sch.group_id = :group
               AND se.date >= (CAST(:message_date AS date) - INTERVAL '21 days')
               AND se.date <= (CAST(:message_date AS date) + INTERVAL '42 days')
               AND COALESCE(se.is_cancelled, false) = false
             GROUP BY s.id, s.name, s.semester, s.course_number
             ORDER BY date_distance ASC, s.name"
        );
        $stmt->execute(['group' => $groupId, 'message_date' => $messageDate]);
        $subjects = $stmt->fetchAll() ?: [];

        $best = null;
        $bestScore = 0.0;
        foreach ($subjects as $subject) {
            $name = mb_strtolower(trim((string) $subject['name']));
            if ($name === '') continue;
            $score = 0.0;

            if (mb_strpos($lower, $name) !== false) {
                $score += 0.90;
            }

            $tokens = preg_split('/[^\\p{L}\\p{N}]+/u', $name, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $matched = 0;
            foreach ($tokens as $token) {
                if (mb_strlen($token) < 4) continue;
                if (mb_strpos($lower, $token) !== false) $matched++;
            }
            if ($tokens) $score += min(0.55, ($matched / max(1, count($tokens))) * 0.55);

            // Short academic abbreviations are common in group chats.
            $compact = preg_replace('/[^\\p{L}]/u', '', $name) ?: '';
            $compactHint = preg_replace('/[^\\p{L}]/u', '', $hint) ?: '';
            if ($compactHint !== '' && mb_strlen($compactHint) >= 5 && mb_strpos($compact, $compactHint) !== false) {
                $score += 0.65;
            }

            // Prefer a subject that actually occurs near the message date when
            // several subjects have similar textual matches.
            $distance = (int) ($subject['date_distance'] ?? 999);
            $score += max(0.0, 0.12 - min(0.12, $distance * 0.01));

            if ($score > $bestScore) {
                $bestScore = min(0.99, $score);
                $best = $subject;
            }
        }

        if ($best) return $best + ['match_confidence' => $bestScore];
        return ['id' => null, 'name' => null, 'match_confidence' => 0.0];
    }

    private function buildTitle(array $message, array $subject): string
    {
        $text = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        $clean = preg_replace('/\s+/u', ' ', $text) ?: 'Домашнее задание';
        $clean = mb_substr($clean, 0, 140);
        $subjectName = trim((string) ($subject['name'] ?? ''));
        return $subjectName !== '' ? $subjectName . ': ' . $clean : $clean;
    }

    private function buildDescription(array $message, array $classification): string
    {
        $text = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        return $text !== ''
            ? $text . "\n\nИсточник: Telegram"
            : 'Домашнее задание получено из Telegram.';
    }

    private function findRecentHomework(string $groupId, ?string $subjectId, string $title): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM public.homeworks
             WHERE group_id = :group
               AND (:subject IS NULL OR subject_id = :subject)
               AND created_at >= now() - INTERVAL '2 hours'
             ORDER BY created_at DESC LIMIT 1"
        );
        $stmt->execute(['group' => $groupId, 'subject' => $subjectId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private function appendDescription(string $homeworkId, string $description): void
    {
        if ($description === '') return;
        $stmt = $this->db->prepare(
            "UPDATE public.homeworks
             SET description = CASE WHEN description IS NULL OR description = ''
                                    THEN :d ELSE description || E'\\n' || :d END
             WHERE id = :id"
        );
        $stmt->execute(['id' => $homeworkId, 'd' => $description]);
    }

    private function linkMessage(string $messageId, string $homeworkId, float $confidence): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO public.telegram_homework_links
             (telegram_message_id, homework_id, confidence)
             VALUES (:message,:homework,:confidence)
             ON CONFLICT (telegram_message_id, homework_id) DO NOTHING'
        );
        $stmt->execute(['message' => $messageId, 'homework' => $homeworkId, 'confidence' => $confidence]);
    }

    private function importAttachments(array $message, string $groupId, string $telegramMessageId, string $homeworkId): array
    {
        $items = [];
        if (isset($message['photo']) && is_array($message['photo']) && $message['photo']) {
            $photos = $message['photo'];
            $photo = end($photos);
            if (is_array($photo) && !empty($photo['file_id'])) {
                $items[] = $this->downloadAndStore(
                    (string) $photo['file_id'],
                    'telegram-photo-' . ((int) ($photo['file_unique_id'] ?? 0)) . '.jpg',
                    'image/jpeg',
                    $groupId,
                    $telegramMessageId,
                    $homeworkId,
                    'image',
                    (string) ($message['caption'] ?? '')
                );
            }
        }

        if (isset($message['document']['file_id'])) {
            $doc = $message['document'];
            $items[] = $this->downloadAndStore(
                (string) $doc['file_id'],
                (string) ($doc['file_name'] ?? 'telegram-document'),
                (string) ($doc['mime_type'] ?? 'application/octet-stream'),
                $groupId,
                $telegramMessageId,
                $homeworkId,
                'file',
                (string) ($message['caption'] ?? '')
            );
        }

        return array_values(array_filter($items));
    }

    private function downloadAndStore(
        string $fileId,
        string $originalName,
        string $mime,
        string $groupId,
        string $telegramMessageId,
        string $homeworkId,
        string $attachmentType,
        string $caption
    ): ?array {
        if ($this->token === '') return null;

        $api = 'https://api.telegram.org/bot' . rawurlencode($this->token);
        $info = HttpClient::request('POST', $api . '/getFile', ['file_id' => $fileId], [], 20);
        $path = $info['json']['result']['file_path'] ?? null;
        if (!is_string($path) || $path === '') {
            Logger::error('telegram_get_file_failed', ['status' => $info['status'], 'file_id' => $fileId]);
            return null;
        }

        $url = 'https://api.telegram.org/file/bot' . $this->token . '/' . $path;
        $download = HttpClient::request('GET', $url, null, [], 60);
        $binary = $download['body'];
        if ($download['status'] < 200 || $download['status'] >= 300 || $binary === '') {
            Logger::error('telegram_file_download_failed', ['path' => $path]);
            return null;
        }

        $b2 = new B2Storage();
        $objectKey = $b2->buildObjectKey($this->actorUserId ?? 'telegram', $originalName);
        $uploaded = $b2->upload($objectKey, $binary, $mime);

        $file = (new FileRepository())->create([
            'original_name' => $originalName,
            'mime_type' => $mime,
            'size_bytes' => strlen($binary),
            'object_key' => $objectKey,
            'b2_file_id' => $uploaded['b2_file_id'] ?? null,
            'uploaded_by' => $this->actorUserId,
            'group_id' => $groupId,
            'visibility' => 'group',
        ]);

        $stmt = $this->db->prepare(
            'INSERT INTO public.homework_attachments
             (homework_id, file_id, telegram_message_id, attachment_type, caption, inline_view)
             VALUES (:homework,:file,:message,:type,:caption,:inline)
             ON CONFLICT (homework_id,file_id) DO NOTHING
             RETURNING *'
        );
        $stmt->execute([
            'homework' => $homeworkId,
            'file' => $file['id'],
            'message' => $telegramMessageId,
            'type' => $attachmentType,
            'caption' => $caption !== '' ? $caption : null,
            'inline' => $attachmentType === 'image',
        ]);

        return [
            'file_id' => $file['id'],
            'name' => $originalName,
            'mime_type' => $mime,
            'size' => strlen($binary),
            'inline_view' => str_starts_with($mime, 'image/'),
        ];
    }

    private function extractDueAt(string $text): ?string
    {
        if ($text === '') return null;
        $tz = new \DateTimeZone('Asia/Vladivostok');
        $now = new \DateTimeImmutable('now', $tz);

        if (preg_match('/\\bсегодня\\b/iu', $text)) return $now->setTime(23,59,59)->format('c');
        if (preg_match('/\\bзавтра\\b/iu', $text)) return $now->modify('+1 day')->setTime(23,59,59)->format('c');
        if (preg_match('/\\bпослезавтра\\b/iu', $text)) return $now->modify('+2 days')->setTime(23,59,59)->format('c');

        // Explicit numeric dates: 25.09, 25.09.2026, 25/09.
        if (preg_match('/\\b(\\d{1,2})[.\\/-](\\d{1,2})(?:[.\\/-](\\d{2,4}))?\\b/u', $text, $m)) {
            $year = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : (int) $now->format('Y');
            if ($year < 100) $year += 2000;
            try {
                $d = new \DateTimeImmutable(sprintf('%04d-%02d-%02d 23:59:59', $year, (int)$m[2], (int)$m[1]), $tz);
                if ($d < $now->modify('-1 day')) $d = $d->modify('+1 year');
                return $d->format('c');
            } catch (\Throwable $e) {}
        }

        $months = [
            'января'=>1,'февраля'=>2,'марта'=>3,'апреля'=>4,'мая'=>5,'июня'=>6,
            'июля'=>7,'августа'=>8,'сентября'=>9,'октября'=>10,'ноября'=>11,'декабря'=>12,
        ];
        foreach ($months as $name=>$month) {
            if (preg_match('/\\b(\\d{1,2})\\s+' . $name . '(?:\\s+(\\d{4}))?/iu', $text, $m)) {
                $year = isset($m[2]) && $m[2] !== '' ? (int)$m[2] : (int)$now->format('Y');
                try {
                    $d = new \DateTimeImmutable(sprintf('%04d-%02d-%02d 23:59:59', $year, $month, (int)$m[1]), $tz);
                    if ($d < $now->modify('-1 day')) $d = $d->modify('+1 year');
                    return $d->format('c');
                } catch (\Throwable $e) {}
            }
        }

        $days = ['понедельник'=>1,'вторник'=>2,'среда'=>3,'четверг'=>4,'пятница'=>5,'суббота'=>6,'воскресенье'=>7];
        foreach ($days as $name=>$n) {
            if (mb_stripos($text, $name) !== false) {
                $delta = ($n - (int)$now->format('N') + 7) % 7;
                if ($delta === 0) $delta = 7;
                return $now->modify('+' . $delta . ' days')->setTime(23,59,59)->format('c');
            }
        }

        return null;
    }

    private function updateClassification(string $id, array $classification): void
    {
        $stmt = $this->db->prepare(
            "UPDATE public.telegram_messages
             SET classification = :type,
                 classification_confidence = :confidence,
                 processing_status = 'processing',
                 ai_reason = :reason,
                 ai_subject_hint = :subject_hint,
                 ai_due_hint = :due_hint,
                 ai_processed_at = CASE WHEN :used_ai THEN now() ELSE ai_processed_at END
             WHERE id = :id"
        );
        $stmt->execute([
            'id' => $id,
            'type' => $classification['type'],
            'confidence' => $classification['confidence'],
            'reason' => $classification['reason'] ?? null,
            'subject_hint' => $classification['subject_hint'] ?? null,
            'due_hint' => $classification['due_hint'] ?? null,
            'used_ai' => str_starts_with((string)($classification['reason'] ?? ''), 'llm_'),
        ]);
    }

    private function markMessage(string $id, string $status, ?string $error = null): void
    {
        $stmt = $this->db->prepare(
            'UPDATE public.telegram_messages
             SET processing_status = :status, processed_at = now()
             WHERE id = :id'
        );
        $stmt->execute(['id'=>$id,'status'=>$status]);
        if ($error !== null) {
            Logger::error('telegram_message_processing', ['message_id'=>$id,'error'=>$error]);
        }
    }
}
