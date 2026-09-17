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
            'SELECT id, code, name, course_number, admission_year, is_active
             FROM public.groups
             WHERE COALESCE(is_active, true) = true
             ORDER BY course_number NULLS LAST, code'
        );
        return $stmt->fetchAll();
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, code, name, course_number, admission_year, is_active
             FROM public.groups WHERE id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function members(string $groupId): array
    {
        $stmt = $this->db->prepare(
            'SELECT gm.user_id, gm.role_in_group, u.email, u.full_name
             FROM public.group_memberships gm
             LEFT JOIN public.users u ON u.id = gm.user_id
             WHERE gm.group_id = :gid'
        );
        $stmt->execute(['gid' => $groupId]);
        return $stmt->fetchAll();
    }

    public function create(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') {
            throw new \InvalidArgumentException('Group name is required');
        }

        $requestedCode = trim((string) ($data['code'] ?? ''));
        $baseCode = $requestedCode !== '' ? $requestedCode : $this->makeCode($name);
        $code = $baseCode;

        for ($attempt = 0; $attempt < 8; $attempt++) {
            try {
                $stmt = $this->db->prepare(
                    'INSERT INTO public.groups (code, name, course_number, admission_year)
                     VALUES (:code, :name, :course, :year)
                     RETURNING *'
                );
                $stmt->execute([
                    'code' => $code,
                    'name' => $name,
                    'course' => $data['course_number'] ?? null,
                    'year' => $data['admission_year'] ?? null,
                ]);
                $row = $stmt->fetch();
                if ($row === false) {
                    throw new \RuntimeException('Create group failed');
                }
                return $row;
            } catch (\PDOException $e) {
                if ($e->getCode() !== '23505' || $attempt >= 7) {
                    throw $e;
                }
                $code = $baseCode . '-' . ($attempt + 2);
            }
        }

        throw new \RuntimeException('Create group failed');
    }

    private function makeCode(string $name): string
    {
        $map = [
            'а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'e','ж'=>'zh','з'=>'z',
            'и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s',
            'т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'c','ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'',
            'ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya',
        ];
        $value = mb_strtolower(trim($name), 'UTF-8');
        $value = strtr($value, $map);
        $value = preg_replace('/[^a-z0-9]+/u', '-', $value) ?? '';
        $value = trim($value, '-');
        if ($value === '') {
            $value = 'group';
        }
        return substr($value, 0, 80);
    }

    public function addMember(string $groupId, string $userId, string $roleInGroup = 'student'): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO public.group_memberships (user_id, group_id, role_in_group)
             VALUES (:uid, :gid, :role)
             RETURNING *'
        );
        $stmt->execute([
            'uid' => $userId,
            'gid' => $groupId,
            'role' => $roleInGroup,
        ]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new \RuntimeException('Add member failed');
        }
        return $row;
    }

    public function update(string $id, array $data): array
    {
        $fields = [];
        $params = ['id' => $id];
        foreach (['name' => 'name', 'code' => 'code', 'course_number' => 'course', 'admission_year' => 'year', 'is_active' => 'active'] as $col => $key) {
            if (array_key_exists($col, $data)) {
                $fields[] = "$col = :$key";
                $params[$key] = $data[$col];
            }
        }
        if (!$fields) {
            $row = $this->findById($id);
            if ($row === null) throw new \RuntimeException('Group not found');
            return $row;
        }
        $sql = 'UPDATE public.groups SET ' . implode(', ', $fields) . ' WHERE id = :id RETURNING *';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        if ($row === false) throw new \RuntimeException('Update group failed');
        return $row;
    }

    public function softDelete(string $id): bool
    {
        $stmt = $this->db->prepare('UPDATE public.groups SET is_active = false WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->rowCount() > 0;
    }

    public function hardDelete(string $id): bool
    {
        $this->db->prepare('DELETE FROM public.group_memberships WHERE group_id = :id')->execute(['id' => $id]);
        $stmt = $this->db->prepare('DELETE FROM public.groups WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->rowCount() > 0;
    }
}
