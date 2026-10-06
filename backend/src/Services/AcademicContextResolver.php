<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use PDO;

/**
 * Canonical student academic scope.
 *
 * A group is never inferred from membership order when a write targets
 * group-owned data. Multiple active memberships require an explicit group.
 * Subject IDs are authoritative; slugs are display/routing aliases only.
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

    public function requireGroup(string $userId, ?string $requestedGroupId = null): array
    {
        $memberships = $this->memberships($userId);
        if ($memberships === []) {
            throw new AcademicContextException('NO_GROUP', 'Для действия нужна активная учебная группа', 422);
        }

        if ($requestedGroupId !== null && trim($requestedGroupId) !== '') {
            foreach ($memberships as $membership) {
                if ((string)$membership['group_id'] === trim($requestedGroupId)) {
                    return $membership;
                }
            }
            throw new AcademicContextException('FORBIDDEN', 'Вы не состоите в указанной учебной группе', 403);
        }

        if (count($memberships) > 1) {
            throw new AcademicContextException('GROUP_REQUIRED', 'Выберите учебную группу для этого действия', 409, [
                'groups' => array_map(static fn(array $m): array => [
                    'id' => $m['group_id'],
                    'name' => $m['group_name'],
                    'code' => $m['group_code'],
                    'course' => $m['course_number'] !== null ? (int)$m['course_number'] : null,
                    'semester' => null,
                ], $memberships),
            ]);
        }

        return $memberships[0];
    }

    public function assertGroupMember(string $userId, string $groupId): array
    {
        return $this->requireGroup($userId, $groupId);
    }

    public function resolveSubject(?string $subjectId, ?string $groupId = null, ?string $date = null): ?array
    {
        if ($subjectId === null || trim($subjectId) === '') return null;

        $params = ['sid' => trim($subjectId)];
        $sql = 'SELECT id,name,short_name,slug,course_number,semester,specialty_slug,color_hex,is_active
                FROM public.subjects WHERE id = :sid AND is_active = true';

        if ($groupId !== null && trim($groupId) !== '') {
            $sql .= ' AND (
                EXISTS (
                    SELECT 1 FROM public.schedule_entries se
                    JOIN public.schedules sch ON sch.id = se.schedule_id
                    WHERE se.subject_id = subjects.id
                      AND sch.group_id = :gid
                      AND sch.is_active = true
                      AND (:d IS NULL OR se.date = :d::date)
                )
                OR EXISTS (
                    SELECT 1 FROM public.groups g
                    WHERE g.id = :gid2
                      AND (subjects.course_number IS NULL OR g.course_number IS NULL OR subjects.course_number = g.course_number)
                      AND (subjects.specialty_slug IS NULL OR g.specialty_slug IS NULL OR subjects.specialty_slug = g.specialty_slug)
                )
            )';
            $params['gid'] = trim($groupId);
            $params['gid2'] = trim($groupId);
            $params['d'] = ($date !== null && trim($date) !== '') ? trim($date) : null;
        }

        $sql .= ' LIMIT 1';
        $q = $this->db->prepare($sql);
        $q->execute($params);
        $row = $q->fetch();
        if ($row === false) {
            throw new AcademicContextException('INVALID_SUBJECT_CONTEXT', 'Предмет не относится к выбранному учебному контексту', 422);
        }
        return $row;
    }

    public function homeworkAccess(string $userId, array $homework): void
    {
        $groupId = isset($homework['group_id']) ? trim((string)$homework['group_id']) : '';
        if ($groupId === '') return; // explicitly global homework

        $this->assertGroupMember($userId, $groupId);
    }

    public function resolveForUser(string $userId, ?string $groupId = null, ?string $subjectId = null, ?string $date = null): array
    {
        $group = $this->requireGroup($userId, $groupId);
        $subject = $this->resolveSubject($subjectId, (string)$group['group_id'], $date);
        return [
            'user_id' => $userId,
            'group_id' => $group['group_id'],
            'group_name' => $group['group_name'],
            'group_code' => $group['group_code'],
            'course' => $group['course_number'] !== null ? (int)$group['course_number'] : null,
            'specialty_slug' => $group['specialty_slug'],
            'subject_id' => $subject['id'] ?? null,
            'subject' => $subject,
            'context_key' => implode(':', [$userId, $group['group_id'], $subject['id'] ?? '-']),
        ];
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
