<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use PDO;

final class ScheduleRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    /** Latest schedule version for groups the user belongs to. */
    public function listForUser(string $userId, ?string $from = null, ?string $to = null): array
    {
        $sql = <<<'SQL'
WITH latest AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
               PARTITION BY s.group_id, COALESCE(s.semester, 0)
               ORDER BY s.version DESC, s.created_at DESC
           ) AS rn
    FROM public.schedules s
    JOIN public.group_memberships gm
      ON gm.group_id = s.group_id
     AND gm.user_id = :user_id
)
SELECT
    se.id,
    ls.id AS schedule_id,
    ls.group_id,
    g.name AS group_name,
    g.code AS group_code,
    ls.semester,
    ls.version,
    se.subject_id,
    subj.name AS subject_name,
    se.date,
    to_char(se.date, 'Dy') AS weekday_short,
    se.start_time,
    se.end_time,
    se.type::text AS type,
    se.room,
    se.building,
    se.notes,
    se.is_cancelled
FROM latest ls
JOIN public.schedule_entries se ON se.schedule_id = ls.id
JOIN public.groups g ON g.id = ls.group_id
LEFT JOIN public.subjects subj ON subj.id = se.subject_id
WHERE ls.rn = 1
SQL;
        $params = ['user_id' => $userId];
        if ($from !== null) {
            $sql .= ' AND se.date >= :date_from';
            $params['date_from'] = $from;
        }
        if ($to !== null) {
            $sql .= ' AND se.date <= :date_to';
            $params['date_to'] = $to;
        }
        $sql .= ' ORDER BY se.date, se.start_time, g.name, subj.name NULLS LAST';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    }

    /** Latest schedules for admin/editor screens. */
    public function listAll(?string $groupId = null, ?int $semester = null): array
    {
        $sql = <<<'SQL'
WITH latest AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
               PARTITION BY s.group_id, COALESCE(s.semester, 0)
               ORDER BY s.version DESC, s.created_at DESC
           ) AS rn
    FROM public.schedules s
)
SELECT
    ls.id AS schedule_id,
    ls.group_id,
    g.name AS group_name,
    g.code AS group_code,
    ls.academic_year_id,
    ay.label AS academic_year,
    ls.semester,
    ls.version,
    se.id,
    se.subject_id,
    subj.name AS subject_name,
    se.date,
    se.start_time,
    se.end_time,
    se.type::text AS type,
    se.room,
    se.building,
    se.notes,
    se.is_cancelled
FROM latest ls
JOIN public.groups g ON g.id = ls.group_id
LEFT JOIN public.academic_years ay ON ay.id = ls.academic_year_id
LEFT JOIN public.schedule_entries se ON se.schedule_id = ls.id
LEFT JOIN public.subjects subj ON subj.id = se.subject_id
WHERE ls.rn = 1
SQL;
        $params = [];
        if ($groupId !== null && $groupId !== '') {
            $sql .= ' AND ls.group_id = :group_id';
            $params['group_id'] = $groupId;
        }
        if ($semester !== null) {
            $sql .= ' AND ls.semester = :semester';
            $params['semester'] = $semester;
        }
        $sql .= ' ORDER BY g.name, ls.semester NULLS LAST, se.date, se.start_time';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    }

    /** Creates a new immutable schedule version. */
    public function replace(array $payload): array
    {
        $groupId = trim((string) ($payload['group_id'] ?? ''));
        if ($groupId === '') {
            throw new \InvalidArgumentException('group_id is required');
        }

        $semester = isset($payload['semester']) && $payload['semester'] !== ''
            ? (int) $payload['semester']
            : null;
        if ($semester !== null && ($semester < 1 || $semester > 12)) {
            throw new \InvalidArgumentException('semester must be between 1 and 12');
        }

        $entries = $payload['entries'] ?? [];
        if (!is_array($entries)) {
            throw new \InvalidArgumentException('entries must be an array');
        }

        $this->db->beginTransaction();
        try {
            $check = $this->db->prepare('SELECT id FROM public.groups WHERE id = :id AND is_active = true');
            $check->execute(['id' => $groupId]);
            if ($check->fetchColumn() === false) {
                throw new \InvalidArgumentException('Group not found');
            }

            $q = $this->db->prepare(
                'SELECT COALESCE(MAX(version), 0) + 1
                   FROM public.schedules
                  WHERE group_id = :group_id
                    AND COALESCE(semester, 0) = COALESCE(CAST(:semester AS smallint), 0)'
            );
            $q->execute(['group_id' => $groupId, 'semester' => $semester]);
            $version = (int) $q->fetchColumn();

            $stmt = $this->db->prepare(
                'INSERT INTO public.schedules (group_id, academic_year_id, semester, version)
                 VALUES (:group_id, :academic_year_id, :semester, :version)
                 RETURNING id, version, created_at'
            );
            $stmt->execute([
                'group_id' => $groupId,
                'academic_year_id' => $payload['academic_year_id'] ?? null,
                'semester' => $semester,
                'version' => $version,
            ]);
            $schedule = $stmt->fetch();
            if ($schedule === false) {
                throw new \RuntimeException('Could not create schedule');
            }

            $insert = $this->db->prepare(
                'INSERT INTO public.schedule_entries
                    (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes, is_cancelled)
                 VALUES
                    (:schedule_id, :subject_id, :date, :start_time, :end_time,
                     CAST(:type AS public.schedule_type), :room, :building, :notes, :is_cancelled)
                 RETURNING id'
            );

            $saved = 0;
            foreach ($entries as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $date = trim((string) ($entry['date'] ?? ''));
                $start = trim((string) ($entry['start_time'] ?? $entry['startTime'] ?? ''));
                $end = trim((string) ($entry['end_time'] ?? $entry['endTime'] ?? ''));
                if ($date === '' || $start === '' || $end === '') {
                    throw new \InvalidArgumentException('Each schedule entry requires date, start_time and end_time');
                }

                $type = strtolower(trim((string) ($entry['type'] ?? 'other')));
                $allowed = ['lecture', 'practice', 'laboratory', 'seminar', 'exam', 'credit', 'consultation', 'other'];
                if (!in_array($type, $allowed, true)) {
                    $type = 'other';
                }

                $insert->execute([
                    'schedule_id' => $schedule['id'],
                    'subject_id' => ($entry['subject_id'] ?? null) ?: null,
                    'date' => $date,
                    'start_time' => $start,
                    'end_time' => $end,
                    'type' => $type,
                    'room' => ($entry['room'] ?? null) !== '' ? ($entry['room'] ?? null) : null,
                    'building' => ($entry['building'] ?? null) !== '' ? ($entry['building'] ?? null) : null,
                    'notes' => ($entry['notes'] ?? null) !== '' ? ($entry['notes'] ?? null) : null,
                    'is_cancelled' => (bool) ($entry['is_cancelled'] ?? false),
                ]);
                $saved++;
            }

            $this->db->commit();
            return [
                'schedule_id' => $schedule['id'],
                'group_id' => $groupId,
                'semester' => $semester,
                'version' => $version,
                'entries_saved' => $saved,
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }
}
// synced 2026-09-15
