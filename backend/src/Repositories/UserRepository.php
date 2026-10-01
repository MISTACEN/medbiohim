<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use PDO;

final class UserRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function ensureProfile(string $userId, string $email, ?string $fullName = null): array
    {
        $existing = $this->findById($userId);
        if ($existing !== null) {
            return $existing;
        }

        $name = $fullName ?: (str_contains($email, '@') ? explode('@', $email)[0] : $email);
        $stmt = $this->db->prepare(
            'INSERT INTO public.users (id, full_name, email)
             VALUES (:id, :full_name, :email)
             ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
             RETURNING *'
        );
        $stmt->execute([
            'id' => $userId,
            'full_name' => $name,
            'email' => $email,
        ]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new \RuntimeException('Failed to ensure user profile');
        }

        $this->ensureDefaultStudentRole($userId);
        return $row;
    }

    public function findById(string $userId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM public.users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function roleCodesForUser(string $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT r.code FROM public.user_roles ur
             JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = :id'
        );
        $stmt->execute(['id' => $userId]);
        $codes = [];
        foreach ($stmt->fetchAll() as $row) {
            $codes[] = (string) $row['code'];
        }
        return $codes;
    }

    public function assignRole(string $userId, string $roleCode): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO public.user_roles (user_id, role_id)
             SELECT :uid, r.id FROM public.roles r WHERE r.code = :code
             ON CONFLICT DO NOTHING'
        );
        $stmt->execute(['uid' => $userId, 'code' => $roleCode]);
    }

    public function revokeRole(string $userId, string $roleCode): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM public.user_roles ur USING public.roles r
             WHERE ur.role_id = r.id AND ur.user_id = :uid AND r.code = :code'
        );
        $stmt->execute(['uid' => $userId, 'code' => $roleCode]);
    }

    public function countWithRole(string $roleCode): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*)::int AS c FROM public.user_roles ur
             JOIN public.roles r ON r.id = ur.role_id WHERE r.code = :code'
        );
        $stmt->execute(['code' => $roleCode]);
        $row = $stmt->fetch();
        return (int) ($row['c'] ?? 0);
    }

    public function listUsers(int $limit = 50): array
    {
        $stmt = $this->db->query(
            'SELECT u.id, u.email, u.full_name, u.course_number, u.semester,
                    gm.group_id, g.name AS group_name, g.code AS group_code,
                    g.course_number AS group_course_number
               FROM public.users u
               LEFT JOIN public.group_memberships gm
                 ON gm.user_id = u.id AND gm.is_active = true
               LEFT JOIN public.groups g
                 ON g.id = gm.group_id AND g.is_active = true
              ORDER BY u.created_at DESC NULLS LAST
              LIMIT ' . (int) $limit
        );
        $users = $stmt->fetchAll() ?: [];
        $out = [];
        foreach ($users as $u) {
            $out[] = [
                'id' => (string) $u['id'],
                'email' => $u['email'] ?? null,
                'full_name' => $u['full_name'] ?? null,
                'roles' => $this->roleCodesForUser((string) $u['id']),
                'group_id' => $u['group_id'] ?? null,
                'group_name' => $u['group_name'] ?? null,
                'group_code' => $u['group_code'] ?? null,
                'course_number' => $u['group_course_number'] ?? $u['course_number'] ?? null,
                'semester' => $u['semester'] !== null ? (int) $u['semester'] : null,
            ];
        }
        return $out;
    }

    /** Assign the user\'s active group; course is derived from that group, semester is user-specific. */
    public function setAcademicContext(string $userId, string $groupId, int $semester): array
    {
        if ($semester < 1 || $semester > 12) {
            throw new \InvalidArgumentException('semester must be between 1 and 12');
        }

        $groupStmt = $this->db->prepare(
            'SELECT id, name, code, course_number
               FROM public.groups
              WHERE id = :id AND is_active = true
              LIMIT 1'
        );
        $groupStmt->execute(['id' => $groupId]);
        $group = $groupStmt->fetch();
        if ($group === false) {
            throw new \InvalidArgumentException('Group not found');
        }

        $this->db->beginTransaction();
        try {
            $this->db->prepare(
                'UPDATE public.group_memberships
                    SET is_active = false
                  WHERE user_id = :uid AND is_active = true'
            )->execute(['uid' => $userId]);

            $existing = $this->db->prepare(
                'SELECT id FROM public.group_memberships
                  WHERE user_id = :uid AND group_id = :gid
                  LIMIT 1'
            );
            $existing->execute(['uid' => $userId, 'gid' => $groupId]);
            $membershipId = $existing->fetchColumn();

            if ($membershipId !== false) {
                $activate = $this->db->prepare(
                    'UPDATE public.group_memberships
                        SET is_active = true, role_in_group = \'student\'
                      WHERE id = :id'
                );
                $activate->execute(['id' => $membershipId]);
            } else {
                $insert = $this->db->prepare(
                    'INSERT INTO public.group_memberships (user_id, group_id, role_in_group, is_active)
                     VALUES (:uid, :gid, \'student\', true)'
                );
                $insert->execute(['uid' => $userId, 'gid' => $groupId]);
            }

            $user = $this->db->prepare(
                'UPDATE public.users
                    SET course_number = :course, semester = :semester, updated_at = now()
                  WHERE id = :uid
                  RETURNING id, course_number, semester'
            );
            $user->execute([
                'uid' => $userId,
                'course' => $group['course_number'] !== null ? (int) $group['course_number'] : null,
                'semester' => $semester,
            ]);
            $updated = $user->fetch();
            if ($updated === false) {
                throw new \RuntimeException('User not found');
            }

            $this->db->commit();
            return [
                'user_id' => $userId,
                'group_id' => $group['id'],
                'group_name' => $group['name'],
                'group_code' => $group['code'],
                'course_number' => $group['course_number'] !== null ? (int) $group['course_number'] : null,
                'semester' => $semester,
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    private function ensureDefaultStudentRole(string $userId): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO public.user_roles (user_id, role_id)
             SELECT :uid, r.id FROM public.roles r WHERE r.code = 'student'
             ON CONFLICT DO NOTHING"
        );
        $stmt->execute(['uid' => $userId]);
    }

    public function profileBundle(string $userId): array
    {
        $user = $this->findById($userId);
        if ($user === null) {
            throw new \RuntimeException('User profile not found');
        }
        $roles = $this->roleCodesForUser($userId);
        $stmt = $this->db->prepare(
            'SELECT g.id, g.code, g.name, g.course_number, g.admission_year,
                    gm.role_in_group, gm.is_active
             FROM public.group_memberships gm
             JOIN public.groups g ON g.id = gm.group_id
             WHERE gm.user_id = :uid AND gm.is_active = true AND g.is_active = true
             ORDER BY g.name'
        );
        $stmt->execute(['uid' => $userId]);
        $groups = $stmt->fetchAll() ?: [];
        $course = $user['course_number'] !== null ? (int) $user['course_number'] : null;
        $semester = $user['semester'] !== null ? (int) $user['semester'] : null;
        $currentGroup = null;
        if ($groups !== []) {
            // The active membership is the source of truth for the current group.
            // Prefer the group whose course matches the saved academic context.
            foreach ($groups as $group) {
                if ($course !== null && isset($group['course_number']) && (int) $group['course_number'] === $course) {
                    $currentGroup = $group;
                    break;
                }
            }
            $currentGroup ??= $groups[0];
        }
        return [
            'user' => [
                'id' => $user['id'],
                'full_name' => $user['full_name'],
                'email' => $user['email'],
                'avatar_url' => $user['avatar_url'] ?? null,
                'group_id' => $currentGroup['id'] ?? null,
                'group_name' => $currentGroup['name'] ?? null,
                'group_code' => $currentGroup['code'] ?? null,
                'course_number' => $course,
                'semester' => $semester,
            ],
            'roles' => $roles,
            'groups' => $groups,
            'current_group' => $currentGroup,
            'course' => $course,
            'semester' => $semester,
        ];
    }
}
