<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use PDO;

final class SpecialtyAccess
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function userHasSpecialty(string $userId, string $specialtySlug): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1
             FROM public.group_memberships gm
             JOIN public.groups g ON g.id = gm.group_id
             WHERE gm.user_id = :user_id
               AND gm.is_active = true
               AND g.is_active = true
               AND g.specialty_slug = :slug
             LIMIT 1'
        );
        $stmt->execute(['user_id' => $userId, 'slug' => $specialtySlug]);
        return $stmt->fetchColumn() !== false;
    }

    public function canAccessSubject(string $userId, string $subjectId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT specialty_slug
             FROM public.subjects
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $subjectId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return false;
        }

        $slug = trim((string) ($row['specialty_slug'] ?? ''));
        if ($slug === '') {
            return true;
        }

        return $this->userHasSpecialty($userId, $slug);
    }
}
