<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use PDO;

/**
 * Canonical academic context for all student-facing learning actions.
 *
 * Identity rules:
 * - group_id and subject_id are authoritative UUIDs;
 * - slugs/names are display/routing aliases only;
 * - a group is never inferred from membership order;
 * - an academic context never silently falls back to another semester/session.
 */
final class AcademicContextResolver
{
    private PDO $db;

    public function __construct(?PDO $db = null)
    {
        $this->db = $db ?? Connection::pdo();
    }

    public function memberships(string $userId): array
    {
        $q = $this->db->prepare(
            'SELECT gm.group_id, gm.role_in_group, g.name AS group_name, g.code AS group_code,
                    g.course_number, g.admission_year, g.academic_program_name,
                    g.specialty_slug, g.is_active
             FROM public.group_memberships gm
             JOIN public.groups g ON g.id = gm.group_id
             WHERE gm.user_id = :u AND gm.is_active = true AND g.is_active = true
             ORDER BY g.name ASC, gm.joined_at ASC'
        );
        $q->execute(['u' => $userId]);
        return $q->fetchAll() ?: [];
    }

    public function resolveGroup(string $userId, ?string $requestedGroupId = null): array
    {
        $memberships = $this->memberships($userId);
        if ($memberships === []) {
            throw new AcademicContextException('NO_GROUP', 'Для действия нужна активная учебная группа', 422);
        }

        $requested = trim((string)($requestedGroupId ?? ''));
        if ($requested !== '') {
            foreach ($memberships as $membership) {
                if ((string)$membership['group_id'] === $requested) {
                    return $membership;
                }
            }
            throw new AcademicContextException(
                'FORBIDDEN',
                'Вы не состоите в указанной учебной группе',
                403
            );
        }

        if (count($memberships) > 1) {
            throw new AcademicContextException(
                'GROUP_REQUIRED',
                'Выберите учебную группу для этого действия',
                409,
                ['groups' => array_map(static fn(array $m): array => [
                    'id' => $m['group_id'],
                    'name' => $m['group_name'],
                    'code' => $m['group_code'],
                    'course' => $m['course_number'] !== null ? (int)$m['course_number'] : null,
                ], $memberships)]
            );
        }

        return $memberships[0];
    }

    /** Backward-compatible alias used by existing services. */
    public function requireGroup(string $userId, ?string $requestedGroupId = null): array
    {
        return $this->resolveGroup($userId, $requestedGroupId);
    }

    public function assertGroupMember(string $userId, string $groupId): array
    {
        return $this->resolveGroup($userId, $groupId);
    }

    /** Resolve an active group without requiring the caller to be a member (staff/admin use). */
    public function assertActiveGroup(string $groupId): array
    {
        $groupId = trim($groupId);
        if ($groupId === '') {
            throw new AcademicContextException('NO_GROUP', 'Для действия нужна учебная группа', 422);
        }
        $q = $this->db->prepare(
            'SELECT id AS group_id, name AS group_name, code AS group_code,
                    course_number, admission_year, academic_program_name,
                    specialty_slug, is_active
             FROM public.groups
             WHERE id = :gid AND is_active = true
             LIMIT 1'
        );
        $q->execute(['gid' => $groupId]);
        $row = $q->fetch();
        if ($row === false) {
            throw new AcademicContextException('INVALID_GROUP', 'Учебная группа не найдена или отключена', 422);
        }
        return $row;
    }

    /**
     * Resolve a subject only by authoritative UUID. The group check uses schedule
     * membership first, then the group's academic course/specialty as a compatibility
     * guard for subjects not yet attached to a schedule entry.
     */
    public function resolveSubject(?string $subjectId, ?string $groupId = null, ?string $date = null): ?array
    {
        $subjectId = trim((string)($subjectId ?? ''));
        if ($subjectId === '') {
            return null;
        }

        $params = ['sid' => $subjectId];
        $sql = 'SELECT id,name,short_name,slug,course_number,semester,specialty_slug,color_hex,is_active
                FROM public.subjects
                WHERE id = :sid AND is_active = true';

        if ($groupId !== null && trim($groupId) !== '') {
            $groupId = trim($groupId);
            $sql .= ' AND (
                EXISTS (
                    SELECT 1
                    FROM public.schedule_entries se
                    JOIN public.schedules sch ON sch.id = se.schedule_id
                    WHERE se.subject_id = subjects.id
                      AND sch.group_id = :gid
                      AND sch.is_active = true
                      AND (:d IS NULL OR se.date = CAST(:d AS date))
                      AND (
                          subjects.slug <> 'histology'
                          OR EXISTS (
                              SELECT 1 FROM public.groups histology_group
                              WHERE histology_group.id = sch.group_id
                                AND histology_group.specialty_slug = 'mbh'
                          )
                      )
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.groups g
                    WHERE g.id = :gid2
                      AND (subjects.course_number IS NULL OR g.course_number IS NULL
                           OR subjects.course_number = g.course_number)
                      AND (subjects.specialty_slug IS NULL OR g.specialty_slug IS NULL
                           OR subjects.specialty_slug = g.specialty_slug)
                      AND (subjects.slug <> 'histology' OR g.specialty_slug = 'mbh')
                )
            )';
            $params['gid'] = $groupId;
            $params['gid2'] = $groupId;
            $params['d'] = ($date !== null && trim($date) !== '') ? trim($date) : null;
        }

        $q = $this->db->prepare($sql);
        $q->execute($params);
        $row = $q->fetch();

        if ($row === false) {
            throw new AcademicContextException(
                'INVALID_SUBJECT_CONTEXT',
                'Предмет не относится к выбранному учебному контексту',
                422
            );
        }

        return $row;
    }

    /**
     * Resolve the academic session for the selected course/semester.
     * Date-aware lookup is preferred; current session is used only when it matches
     * the requested semester/course. There is no cross-semester fallback.
     */
    public function resolveAcademicSession(
        ?int $course,
        ?int $semester,
        ?string $date = null
    ): ?array {
        if ($course === null && $semester === null && ($date === null || trim($date) === '')) {
            return null;
        }

        $conditions = ['is_current = true'];
        $params = [];

        if ($course !== null) {
            $conditions[] = '(course_number IS NULL OR course_number = :course)';
            $params['course'] = $course;
        }
        if ($semester !== null) {
            $conditions[] = '(semester IS NULL OR semester = :semester)';
            $params['semester'] = $semester;
        }
        if ($date !== null && trim($date) !== '') {
            $conditions[] = '(CAST(:date_value AS date) BETWEEN start_date AND end_date OR start_date IS NULL OR end_date IS NULL)';
            $params['date_value'] = trim($date);
        }

        $sql = 'SELECT s.id,s.title,s.type,s.start_date,s.end_date,s.course_number,s.semester,
                       s.academic_year_id, ay.label AS academic_year, s.notes
                FROM public.academic_sessions s
                LEFT JOIN public.academic_years ay ON ay.id = s.academic_year_id
                WHERE ' . implode(' AND ', $conditions) . '
                ORDER BY s.start_date DESC NULLS LAST, s.created_at DESC
                LIMIT 1';

        $q = $this->db->prepare($sql);
        $q->execute($params);
        $row = $q->fetch();

        if ($row === false) {
            return null;
        }

        return $row;
    }

    /**
     * Resolve the concrete lesson/pair belonging to the same group, subject and
     * academic context. A schedule entry id may be supplied when the caller already
     * knows the lesson; otherwise the nearest entry on the requested date is used.
     */
    public function resolveLesson(
        string $groupId,
        ?string $subjectId = null,
        ?string $date = null,
        ?string $scheduleId = null,
        ?string $lessonId = null
    ): ?array {
        $groupId = trim($groupId);
        if ($groupId === '') {
            throw new AcademicContextException('INVALID_LESSON_CONTEXT', 'group_id обязателен', 422);
        }

        $params = ['gid' => $groupId];
        $where = ['sch.group_id = :gid', 'sch.is_active = true', 'COALESCE(se.is_cancelled,false) = false'];

        if ($scheduleId !== null && trim($scheduleId) !== '') {
            $where[] = 'sch.id = :schedule_id';
            $params['schedule_id'] = trim($scheduleId);
        }
        if ($lessonId !== null && trim($lessonId) !== '') {
            $where[] = 'se.id = :lesson_id';
            $params['lesson_id'] = trim($lessonId);
        }
        if ($subjectId !== null && trim($subjectId) !== '') {
            $where[] = 'se.subject_id = :subject_id';
            $params['subject_id'] = trim($subjectId);
        }
        if ($date !== null && trim($date) !== '') {
            $where[] = 'se.date = CAST(:lesson_date AS date)';
            $params['lesson_date'] = trim($date);
        }

        $sql = 'SELECT se.id AS lesson_id, sch.id AS schedule_id, sch.group_id,
                       sch.academic_year_id, sch.academic_year, sch.semester, sch.version AS schedule_version,
                       se.subject_id, se.date, se.start_time, se.end_time, se.type,
                       se.event_kind, se.session_id, se.week_parity, se.recurrence_group,
                       se.parent_entry_id, se.source
                FROM public.schedule_entries se
                JOIN public.schedules sch ON sch.id = se.schedule_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY se.date, se.start_time, se.id
                LIMIT 1';

        $q = $this->db->prepare($sql);
        $q->execute($params);
        $row = $q->fetch();

        if ($row === false) {
            throw new AcademicContextException(
                'INVALID_LESSON_CONTEXT',
                'Занятие не относится к выбранному учебному контексту',
                422
            );
        }

        return $row;
    }

    public function resolveForRequest(
        string $userId,
        ?string $groupId = null,
        ?string $subjectId = null,
        ?string $date = null,
        ?string $scheduleId = null,
        ?string $lessonId = null
    ): array {
        $group = $this->resolveGroup($userId, $groupId);
        $subject = $this->resolveSubject($subjectId, (string)$group['group_id'], $date);

        $course = $group['course_number'] !== null ? (int)$group['course_number'] : null;
        $semester = $subject['semester'] !== null
            ? (int)$subject['semester']
            : null;

        $lesson = null;
        if ($scheduleId !== null || $lessonId !== null || $date !== null) {
            $lesson = $this->resolveLesson(
                (string)$group['group_id'],
                $subject['id'] ?? $subjectId,
                $date,
                $scheduleId,
                $lessonId
            );
        }

        if ($lesson !== null && $lesson['semester'] !== null) {
            $semester = (int)$lesson['semester'];
        }

        $session = $this->resolveAcademicSession($course, $semester, $date);
        $scheduleVersion = $lesson['schedule_version'] ?? null;
        $scheduleKey = $lesson['schedule_id'] ?? ($scheduleId !== null ? trim($scheduleId) : null);
        $sessionKey = $session['id'] ?? ($lesson['session_id'] ?? null);

        $contextVersion = implode(':', [
            (string)($sessionKey ?? '-'),
            (string)($scheduleKey ?? '-'),
            (string)($scheduleVersion ?? '-'),
            (string)($semester ?? '-'),
        ]);

        return [
            'user_id' => $userId,
            'group_id' => $group['group_id'],
            'group_name' => $group['group_name'],
            'group_code' => $group['group_code'],
            'course' => $course,
            'semester' => $semester,
            'specialty_slug' => $group['specialty_slug'],
            'academic_year' => $session['academic_year']
                ?? $lesson['academic_year']
                ?? null,
            'academic_year_id' => $session['academic_year_id']
                ?? $lesson['academic_year_id']
                ?? null,
            'session_id' => $session['id'] ?? ($lesson['session_id'] ?? null),
            'session' => $session,
            'subject_id' => $subject['id'] ?? null,
            'subject' => $subject,
            'schedule_id' => $lesson['schedule_id'] ?? ($scheduleId !== null ? trim($scheduleId) : null),
            'lesson_id' => $lesson['lesson_id'] ?? ($lessonId !== null ? trim($lessonId) : null),
            'lesson' => $lesson,
            'context_version' => $contextVersion,
            'context_key' => implode(':', [
                $userId,
                $group['group_id'],
                $subject['id'] ?? '-',
                $semester ?? '-',
                $session['id'] ?? ($lesson['session_id'] ?? '-'),
                $scheduleKey ?? '-',
            ]),
        ];
    }

    /** Backward-compatible entry point for existing services. */
    public function resolveForUser(
        string $userId,
        ?string $groupId = null,
        ?string $subjectId = null,
        ?string $date = null
    ): array {
        return $this->resolveForRequest($userId, $groupId, $subjectId, $date);
    }

    public function homeworkAccess(string $userId, array $homework): void
    {
        $groupId = isset($homework['group_id']) ? trim((string)$homework['group_id']) : '';
        if ($groupId === '') {
            return; // explicitly global homework
        }

        $this->assertGroupMember($userId, $groupId);
    }
}

final class AcademicContextException extends \RuntimeException
{
    public readonly string $errorCode;
    public readonly int $httpStatus;
    public readonly array $details;

    public function __construct(string $errorCode, string $message, int $httpStatus = 422, array $details = [])
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
        $this->httpStatus = $httpStatus;
        $this->details = $details;
    }
}
