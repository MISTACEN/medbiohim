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
        return [
            'user' => [
                'id' => $user['id'],
                'full_name' => $user['full_name'],
                'email' => $user['email'],
                'avatar_url' => $user['avatar_url'] ?? null,
            ],
            'roles' => $roles,
            'groups' => $groups,
        ];
    }
}
