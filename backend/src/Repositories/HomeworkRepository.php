<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use Medbiohim\Services\B2Storage;
use PDO;

final class HomeworkRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function listForUser(string $userId, ?string $groupId = null): array
    {
        $stmt = $this->db->prepare(
            'SELECT h.id, h.title, h.description, h.due_at, COALESCE(h.due_date,(h.due_at AT TIME ZONE \'Asia/Vladivostok\')::date) AS due_date, h.subject_id, h.group_id, h.schedule_entry_id, h.created_by, h.created_by_role,
                    s.name AS subject_name, s.slug AS subject_slug, s.color_hex,
                    sub.id AS submission_id, sub.status AS submission_status,
                    sub.grade, sub.submitted_at,
                    hp.completed AS my_completed, hp.submitted_at AS completed_at,
                    CASE
                        WHEN sub.status IN ('graded','returned','submitted') THEN sub.status
                        WHEN COALESCE(hp.completed,false) = true THEN 'done'
                        ELSE 'pending'
                    END AS my_status,
                    CASE
                        WHEN sub.status IN ('graded','returned','submitted') THEN 'submission'
                        WHEN COALESCE(hp.completed,false) = true THEN 'progress'
                        ELSE 'none'
                    END AS my_status_source
             FROM public.homeworks h
             LEFT JOIN public.subjects s ON s.id = h.subject_id
             LEFT JOIN public.homework_submissions sub
               ON sub.homework_id = h.id AND sub.user_id = :uid
             LEFT JOIN public.homework_progress hp
               ON hp.homework_id = h.id AND hp.user_id = :uid
             WHERE (
                (:gid IS NULL AND (h.group_id IS NULL OR h.group_id IN (
                    SELECT group_id FROM public.group_memberships WHERE user_id = :uid2 AND is_active = true
                )))
                OR (:gid2 IS NOT NULL AND (h.group_id IS NULL OR h.group_id = :gid2))
             )
               AND (
                    (COALESCE(s.slug, \'\') <> \'histology\' AND COALESCE(s.specialty_slug, \'\') <> \'mbh\')
                    OR EXISTS (
                        SELECT 1 FROM public.groups g_mbh
                        WHERE g_mbh.id = :gid_mbh
                          AND g_mbh.is_active = true
                          AND g_mbh.specialty_slug = \'mbh\'
                    )
               )
             ORDER BY h.due_at NULLS LAST, h.created_at DESC'
        );
        $stmt->execute(['uid' => $userId, 'uid2' => $userId, 'uid3' => $userId, 'gid' => $groupId, 'gid2' => $groupId, 'gid_mbh' => $groupId]);
        $items = $stmt->fetchAll() ?: [];
        if ($items === []) return [];

        $ids = array_values(array_filter(array_map(static fn($row) => (string)($row['id'] ?? ''), $items)));
        $attachmentsByHomework = [];
        if ($ids) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $a = $this->db->prepare(
                "SELECT ha.homework_id, ha.file_id, ha.attachment_type, ha.caption, ha.sort_order,
                        ha.inline_view, f.original_name, f.mime_type, f.size_bytes, f.object_key
                 FROM public.homework_attachments ha
                 JOIN public.files f ON f.id = ha.file_id
                 WHERE ha.homework_id IN ($ph) AND f.status <> 'deleted'
                 ORDER BY ha.homework_id, ha.sort_order, ha.created_at"
            );
            $a->execute($ids);
            $b2 = new B2Storage();
            foreach (($a->fetchAll() ?: []) as $row) {
                $item = [
                    'file_id' => (string)$row['file_id'],
                    'name' => $row['original_name'],
                    'mime_type' => $row['mime_type'],
                    'size_bytes' => $row['size_bytes'] !== null ? (int)$row['size_bytes'] : null,
                    'attachment_type' => $row['attachment_type'],
                    'caption' => $row['caption'],
                    'inline_view' => (bool)$row['inline_view'],
                    'download_url' => null,
                ];
                if ($b2->isConfigured() && !empty($row['object_key'])) {
                    try {
                        $item['download_url'] = $b2->presignedDownloadUrl((string)$row['object_key'], 3600);
                    } catch (\Throwable $e) {}
                }
                $attachmentsByHomework[(string)$row['homework_id']][] = $item;
            }
        }
        foreach ($items as &$item) $item['attachments'] = $attachmentsByHomework[(string)$item['id']] ?? [];
        unset($item);
        return $items;
    }

    public function findAccessibleById(string $id, string $userId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT h.* FROM public.homeworks h
             WHERE h.id = :id AND (
                 h.group_id IS NULL OR EXISTS (
                     SELECT 1 FROM public.group_memberships gm
                     WHERE gm.group_id = h.group_id AND gm.user_id = :uid AND gm.is_active = true
                 )
             ) LIMIT 1"
        );
        $stmt->execute(['id' => $id, 'uid' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function assertSubmissionFileAccess(string $fileId, string $userId, string $homeworkId): void
    {
        $stmt = $this->db->prepare(
            "SELECT 1 FROM public.files f
             JOIN public.homeworks h ON h.id = :hid
             WHERE f.id = :fid AND f.status = 'active'
               AND (f.uploaded_by = :uid OR f.visibility = 'public'
                 OR (f.group_id IS NOT NULL AND EXISTS (
                     SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = f.group_id AND gm.user_id = :uid2 AND gm.is_active = true
                 )))
               AND (h.group_id IS NULL OR EXISTS (
                   SELECT 1 FROM public.group_memberships gm2 WHERE gm2.group_id = h.group_id AND gm2.user_id = :uid3 AND gm2.is_active = true
               )) LIMIT 1"
        );
        $stmt->execute(['fid'=>$fileId,'hid'=>$homeworkId,'uid'=>$userId,'uid2'=>$userId,'uid3'=>$userId]);
        if (!$stmt->fetchColumn()) throw new \RuntimeException('Submission file is not accessible in this homework context');
    }

    public function submit(string $homeworkId, string $userId, ?string $textAnswer, ?string $fileId): array
    {
        $this->db->beginTransaction();
        try {
            $lock=$this->db->prepare('SELECT * FROM public.homework_submissions WHERE homework_id=:hid AND user_id=:uid FOR UPDATE');
            $lock->execute(['hid'=>$homeworkId,'uid'=>$userId]);
            $existing=$lock->fetch();
            if($existing!==false){
                $status=(string)$existing['status'];
                if(in_array($status,['submitted','graded'],true)){
                    $sameText=(string)($existing['text_answer']??'') === (string)($textAnswer??'');
                    $sameFile=($fileId===null||$fileId==='') || (string)($existing['file_id']??'')===(string)$fileId;
                    if($sameText&&$sameFile) { $this->db->commit(); return $existing; }
                    throw new \RuntimeException('Работа уже сдана и ожидает проверки либо уже оценена; сначала дождитесь возврата на доработку');
                }
                $stmt=$this->db->prepare("UPDATE public.homework_submissions
                    SET text_answer=:text,file_id=COALESCE(:fid,file_id),status='submitted',submitted_at=now()
                    WHERE id=:id RETURNING *");
                $stmt->execute(['text'=>$textAnswer,'fid'=>$fileId,'id'=>$existing['id']]);
                $row=$stmt->fetch();
            } else {
                $stmt=$this->db->prepare("INSERT INTO public.homework_submissions
                    (homework_id,user_id,text_answer,file_id,status,submitted_at)
                    VALUES(:hid,:uid,:text,:fid,'submitted',now()) RETURNING *");
                $stmt->execute(['hid'=>$homeworkId,'uid'=>$userId,'text'=>$textAnswer,'fid'=>$fileId]);
                $row=$stmt->fetch();
            }
            if($row===false) throw new \RuntimeException('Submit failed');
            $this->db->commit();
            return $row;
        } catch(\Throwable $e){
            if($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    public function grade(string $submissionId, float $grade, ?string $comment): ?array
    {
        $stmt = $this->db->prepare(
            "UPDATE public.homework_submissions SET grade = :grade, teacher_comment = :comment, status = 'graded'
             WHERE id = :id RETURNING *"
        );
        $stmt->execute(['grade' => $grade, 'comment' => $comment, 'id' => $submissionId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function create(
        string $title,
        ?string $description,
        ?string $subjectId,
        ?string $groupId,
        ?string $dueAt,
        string $createdBy,
        string $createdByRole = 'staff',
        ?string $scheduleEntryId = null,
        ?string $dueDate = null,
        array $attachmentFileIds = []
    ): array {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO public.homeworks
                    (title, description, subject_id, group_id, schedule_entry_id, due_at, due_date, created_by, created_by_role)
                 VALUES
                    (:title, :descr, :sid, :gid, :lesson, :due, :due_date, :by, :role)
                 RETURNING *'
            );
            $stmt->execute([
                'title' => $title,
                'descr' => $description,
                'sid' => $subjectId,
                'gid' => $groupId,
                'lesson' => $scheduleEntryId,
                'due' => $dueAt,
                'due_date' => $dueDate !== null && trim($dueDate) !== '' ? trim($dueDate) : null,
                'by' => $createdBy,
                'role' => $createdByRole,
            ]);
            $row = $stmt->fetch();
            if ($row === false) throw new \RuntimeException('Create homework failed');

            $ids = array_values(array_unique(array_filter(array_map(
                static fn($id): string => trim((string)$id),
                $attachmentFileIds
            ))));
            if (count($ids) > 12) {
                throw new \InvalidArgumentException('Можно прикрепить не более 12 файлов');
            }

            $attachmentStmt = $this->db->prepare(
                'SELECT id, original_name, mime_type
                   FROM public.files
                  WHERE id = :fid
                    AND status = 'active'
                    AND uploaded_by = :uid
                    AND (:gid IS NULL OR group_id = :gid OR group_id IS NULL)
                  LIMIT 1'
            );
            $insertAttachment = $this->db->prepare(
                'INSERT INTO public.homework_attachments
                    (homework_id, file_id, attachment_type, caption, sort_order, inline_view)
                 VALUES (:hid, :fid, :type, NULL, :sort, true)
                 ON CONFLICT (homework_id, file_id) DO NOTHING'
            );

            foreach ($ids as $index => $fileId) {
                $attachmentStmt->execute([
                    'fid' => $fileId,
                    'uid' => $createdBy,
                    'gid' => $groupId,
                ]);
                $file = $attachmentStmt->fetch();
                if ($file === false) {
                    throw new \RuntimeException('Прикрепляемый файл недоступен в контексте этого ДЗ');
                }
                $mime = strtolower(trim((string)($file['mime_type'] ?? '')));
                $type = str_starts_with($mime, 'image/') ? 'image' : 'file';
                $insertAttachment->execute([
                    'hid' => $row['id'],
                    'fid' => $fileId,
                    'type' => $type,
                    'sort' => $index,
                ]);
            }

            $this->db->commit();
            return $row;
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }
}
