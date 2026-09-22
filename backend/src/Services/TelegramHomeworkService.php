<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use Medbiohim\Repositories\FileRepository;
use Medbiohim\Repositories\HomeworkRepository;
use Medbiohim\Support\Env;
use Medbiohim\Support\HttpClient;
use Medbiohim\Support\Logger;
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
                $this->extractDueAt($message['text'] ?? $message['caption'] ?? ''),
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

        $stmt = $this->db->prepare(
            'INSERT INTO public.telegram_messages
             (telegram_chat_id, telegram_message_id, telegram_user_id, reply_to_message_id,
              message_text, caption, telegram_date, raw_payload)
             VALUES (:chat,:message,:user,:reply,:text,:caption,:date,:raw)
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

    private function classify(array $message): array
    {
        $text = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        $lower = mb_strtolower($text);
        $hasAttachment = isset($message['photo']) || isset($message['document']);
        $positive = [
            'дз','домашн','задани','сделать','подготовить','выучить','решить',
            'прочитать','ответить','к следующ','к следующему','до завтра','до пятниц',
        ];
        $negative = ['кто знает','кто-нибудь знает','расписание','перенесли','отмена','спасибо'];
        $score = $hasAttachment ? 0.38 : 0.0;
        foreach ($positive as $word) if (mb_strpos($lower, $word) !== false) $score += 0.16;
        foreach ($negative as $word) if (mb_strpos($lower, $word) !== false) $score -= 0.25;

        if ($text === '' && !$hasAttachment) {
            return ['type' => 'other', 'confidence' => 0.10, 'reason' => 'empty'];
        }

        $score = max(0.0, min(0.99, $score));
        $type = $score >= 0.60 ? 'homework' : ($hasAttachment ? 'material_candidate' : 'other');

        return [
            'type' => $type,
            'confidence' => $score,
            'reason' => $hasAttachment ? 'attachment_and_homework_signals' : 'text_homework_signals',
        ];
    }

    private function resolveSubject(string $groupId, array $message, array $classification): array
    {
        $text = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        $lower = mb_strtolower($text);

        $stmt = $this->db->prepare(
            "SELECT DISTINCT s.id, s.name, s.semester, s.course_number
             FROM public.schedule_entries se
             JOIN public.schedules sch ON sch.id = se.schedule_id AND sch.is_active = true
             JOIN public.subjects s ON s.id = se.subject_id
             WHERE sch.group_id = :group
               AND se.date >= CURRENT_DATE - INTERVAL '14 days'
               AND se.date <= CURRENT_DATE + INTERVAL '30 days'
             ORDER BY se.date"
        );
        $stmt->execute(['group' => $groupId]);
        $subjects = $stmt->fetchAll() ?: [];

        $best = null;
        $bestScore = 0.0;
        foreach ($subjects as $subject) {
            $name = mb_strtolower((string) $subject['name']);
            $score = 0.0;
            if ($name !== '' && mb_strpos($lower, $name) !== false) $score += 0.80;

            foreach (preg_split('/[\s,;:()\-]+/u', $name, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $token) {
                if (mb_strlen($token) >= 5 && mb_strpos($lower, $token) !== false) $score += 0.08;
            }

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
             (homework_id, file_id, telegram_message_id, attachment_type, caption)
             VALUES (:homework,:file,:message,:type,:caption)
             ON CONFLICT (homework_id,file_id) DO NOTHING
             RETURNING *'
        );
        $stmt->execute([
            'homework' => $homeworkId,
            'file' => $file['id'],
            'message' => $telegramMessageId,
            'type' => $attachmentType,
            'caption' => $caption !== '' ? $caption : null,
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

        if (preg_match('/\bзавтра\b/iu', $text)) return $now->modify('+1 day')->setTime(23,59,59)->format('c');
        if (preg_match('/\bсегодня\b/iu', $text)) return $now->setTime(23,59,59)->format('c');

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
             SET classification = :type, classification_confidence = :confidence,
                 processing_status = 'processing'
             WHERE id = :id"
        );
        $stmt->execute(['id'=>$id,'type'=>$classification['type'],'confidence'=>$classification['confidence']]);
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
