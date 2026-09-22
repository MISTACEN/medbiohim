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

    /** Resolve only explicit active group memberships; never infer a group from course. */
    private function userGroupIds(string $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT group_id
               FROM public.group_memberships
              WHERE user_id = :user_id
                AND is_active = true'
        );
        $stmt->execute(['user_id' => $userId]);
        return array_values(array_unique(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [])));
    }

    public function calendarMeta(?int $course = null, ?int $semester = null): array
    {
        $params=[]; $where=[];
        if($course!==null){$where[]='course_number=:course_number';$params['course_number']=$course;}
        if($semester!==null){$where[]='semester=:semester';$params['semester']=$semester;}
        $sql='SELECT id,title,type,start_date,end_date,notes,is_current FROM public.academic_calendar_periods';
        if($where)$sql.=' WHERE '.implode(' AND ',$where);
        $sql.=' ORDER BY start_date,end_date NULLS LAST,title';
        $stmt=$this->db->prepare($sql);$stmt->execute($params);$periods=$stmt->fetchAll()?:[];
        $stmt=$this->db->prepare('SELECT id,subject_id,subject_name,academic_hours,notes FROM public.subject_schedule_rules WHERE (:course IS NULL OR course_number=:course) AND (:semester IS NULL OR semester=:semester) ORDER BY subject_name');
        $stmt->execute(['course'=>$course,'semester'=>$semester]);
        return ['periods'=>$periods,'duration_rules'=>$stmt->fetchAll()?:[]];
    }

    /** Latest active schedule version for groups the user belongs to. */
    public function listForUser(string $userId, ?string $from = null, ?string $to = null): array
    {
        $groupIds = $this->userGroupIds($userId);
        if (!$groupIds) {
            return [];
        }

        $placeholders = [];
        $params = ['user_id' => $userId];
        foreach ($groupIds as $i => $groupId) {
            $key = 'group_' . $i;
            $placeholders[] = ':' . $key;
            $params[$key] = $groupId;
        }

        $sql = <<<'SQL'
WITH latest AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
               PARTITION BY s.group_id, COALESCE(s.semester, 0)
               ORDER BY s.version DESC, s.created_at DESC
           ) AS rn
    FROM public.schedules s
    WHERE s.is_active = true
)
SELECT
    se.id,
    ls.id AS schedule_id,
    ls.group_id,
    g.name AS group_name,
    g.code AS group_code,
    g.course_number,
    ls.semester,
    ls.academic_year_id,
    ls.academic_year,
    ls.version,
    se.subject_id,
    COALESCE(se.subject_name, subj.name) AS subject_name,
    se.date,
    to_char(se.date, 'Dy') AS weekday_short,
    se.start_time,
    se.end_time,
    se.type::text AS type,
    se.room,
    se.building,
    se.notes,
    se.is_cancelled,
    se.teacher,
    se.academic_hours,
    se.week_parity,
    se.recurrence_group,
    se.parent_entry_id,
    se.source_detail,
    se.event_kind,
    se.is_makeup,
    se.session_id,
    se.source
FROM latest ls
JOIN public.schedule_entries se ON se.schedule_id = ls.id
JOIN public.groups g ON g.id = ls.group_id
LEFT JOIN public.subjects subj ON subj.id = se.subject_id
WHERE ls.rn = 1
  AND ls.group_id IN (
SQL;
        $sql .= implode(', ', $placeholders) . ")\n";

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

    /** Latest active schedules for admin/editor screens. */
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
    WHERE s.is_active = true
)
SELECT
    ls.id AS schedule_id,
    ls.group_id,
    g.name AS group_name,
    g.code AS group_code,
    ls.academic_year_id,
    COALESCE(ls.academic_year, ay.label) AS academic_year,
    ls.is_active,
    ls.semester,
    ls.version,
    se.id,
    se.subject_id,
    COALESCE(se.subject_name, subj.name) AS subject_name,
    se.date,
    se.start_time,
    se.end_time,
    se.type::text AS type,
    se.room,
    se.building,
    se.notes,
    se.is_cancelled,
    se.teacher,
    se.academic_hours,
    se.week_parity,
    se.recurrence_group,
    se.parent_entry_id,
    se.source_detail,
    se.event_kind,
    se.is_makeup,
    se.session_id,
    se.source
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

    /** Creates a new active immutable schedule version and deactivates the previous version. */
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

        $academicYear = trim((string) ($payload['academic_year'] ?? '2026/2027'));
        if ($academicYear === '') {
            $academicYear = '2026/2027';
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

            $deactivate = $this->db->prepare(
                'UPDATE public.schedules
                    SET is_active = false
                  WHERE group_id = :group_id
                    AND COALESCE(semester, 0) = COALESCE(CAST(:semester AS smallint), 0)'
            );
            $deactivate->execute(['group_id' => $groupId, 'semester' => $semester]);

            $stmt = $this->db->prepare(
                'INSERT INTO public.schedules (group_id, academic_year_id, academic_year, semester, version, is_active)
                 VALUES (:group_id, :academic_year_id, :academic_year, :semester, :version, true)
                 RETURNING id, version, created_at'
            );
            $stmt->execute([
                'group_id' => $groupId,
                'academic_year_id' => $payload['academic_year_id'] ?? null,
                'academic_year' => $academicYear,
                'semester' => $semester,
                'version' => $version,
            ]);
            $schedule = $stmt->fetch();
            if ($schedule === false) {
                throw new \RuntimeException('Could not create schedule');
            }

            $insert = $this->db->prepare(
                'INSERT INTO public.schedule_entries
                    (schedule_id, subject_id, subject_name, date, start_time, end_time, type, room, building, notes, is_cancelled, sort_order, teacher, academic_hours, week_parity, recurrence_group, parent_entry_id, source_detail, event_kind, is_makeup, session_id, source)
                 VALUES
                    (:schedule_id, :subject_id, :subject_name, :date, :start_time, :end_time,
                     CAST(:type AS public.schedule_type), :room, :building, :notes, :is_cancelled, :sort_order, :teacher, :academic_hours, :week_parity, :recurrence_group, :parent_entry_id, :source_detail, :event_kind, :is_makeup, :session_id, :source)
                 RETURNING id'
            );

            $saved = 0;
            foreach ($entries as $entry) {
                if (!is_array($entry)) continue;
                $date = trim((string) ($entry['date'] ?? ''));
                $start = trim((string) ($entry['start_time'] ?? $entry['startTime'] ?? ''));
                $end = trim((string) ($entry['end_time'] ?? $entry['endTime'] ?? ''));
                if ($date === '' || $start === '' || $end === '') {
                    throw new \InvalidArgumentException('Each schedule entry requires date, start_time and end_time');
                }

                $type = strtolower(trim((string) ($entry['type'] ?? 'other')));
                $allowed = ['lecture', 'practice', 'laboratory', 'seminar', 'exam', 'credit', 'consultation', 'retake', 'other'];
                if (!in_array($type, $allowed, true)) $type = 'other';

                $subjectName = trim((string) ($entry['subject_name'] ?? ''));
                if ($subjectName === '' && !empty($entry['subject_id'])) {
                    $subjectStmt = $this->db->prepare('SELECT name FROM public.subjects WHERE id = :id LIMIT 1');
                    $subjectStmt->execute(['id' => $entry['subject_id']]);
                    $subjectName = (string) ($subjectStmt->fetchColumn() ?: '');
                }

                $insert->execute([
                    'schedule_id' => $schedule['id'],
                    'subject_id' => ($entry['subject_id'] ?? null) ?: null,
                    'subject_name' => $subjectName !== '' ? $subjectName : null,
                    'date' => $date,
                    'start_time' => $start,
                    'end_time' => $end,
                    'type' => $type,
                    'room' => ($entry['room'] ?? null) !== '' ? ($entry['room'] ?? null) : null,
                    'building' => ($entry['building'] ?? null) !== '' ? ($entry['building'] ?? null) : null,
                    'notes' => ($entry['notes'] ?? null) !== '' ? ($entry['notes'] ?? null) : null,
                    'is_cancelled' => (bool) ($entry['is_cancelled'] ?? false),
                    'sort_order' => $saved,
                    'teacher' => ($entry['teacher'] ?? null) !== '' ? ($entry['teacher'] ?? null) : null,
                    'academic_hours' => isset($entry['academic_hours']) ? (int)$entry['academic_hours'] : null,
                    'week_parity' => ($entry['week_parity'] ?? null) !== '' ? ($entry['week_parity'] ?? null) : null,
                    'recurrence_group' => ($entry['recurrence_group'] ?? null) !== '' ? ($entry['recurrence_group'] ?? null) : null,
                    'parent_entry_id' => ($entry['parent_entry_id'] ?? null) ?: null,
                    'source_detail' => ($entry['source_detail'] ?? null) !== '' ? ($entry['source_detail'] ?? null) : null,
                    'event_kind' => ($entry['event_kind'] ?? 'class') ?: 'class',
                    'is_makeup' => (bool)($entry['is_makeup'] ?? false),
                    'session_id' => ($entry['session_id'] ?? null) ?: null,
                    'source' => ($entry['source'] ?? 'official') ?: 'official',
                ]);
                $saved++;
            }

            $this->db->commit();
            return [
                'schedule_id' => $schedule['id'],
                'group_id' => $groupId,
                'semester' => $semester,
                'academic_year' => $academicYear,
                'version' => $version,
                'entries_saved' => $saved,
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }
}
// synced 2026-09-17
