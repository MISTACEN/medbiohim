<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use PDO;

final class GroupRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function listActive(): array
    {
        $stmt = $this->db->query(
            'SELECT id, code, name, course_number, admission_year, is_active, created_at
             FROM public.groups WHERE is_active = true
             ORDER BY course_number NULLS LAST, name'
        );
        return $stmt->fetchAll() ?: [];
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, code, name, course_number, admission_year, is_active, created_at
             FROM public.groups WHERE id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function members(string $groupId): array
    {
        $stmt = $this->db->prepare(
            'SELECT u.id, u.full_name, u.email, gm.role_in_group, gm.is_active
             FROM public.group_memberships gm
             JOIN public.users u ON u.id = gm.user_id
             WHERE gm.group_id = :gid AND gm.is_active = true
             ORDER BY gm.role_in_group DESC, u.full_name'
        );
        $stmt->execute(['gid' => $groupId]);
        return $stmt->fetchAll() ?: [];
    }
}
