<?php
declare(strict_types=1);

namespace Medbiohim\Repositories;

use Medbiohim\Database\Connection;
use PDO;

final class SubjectRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function listActive(?int $course = null, ?int $semester = null): array
    {
        $sql = 'SELECT * FROM public.subjects WHERE is_active = true';
        $params = [];
        if ($course !== null) {
            $sql .= ' AND course_number = :course';
            $params['course'] = $course;
        }
        if ($semester !== null) {
            $sql .= ' AND semester = :sem';
            $params['sem'] = $semester;
        }
        $sql .= ' ORDER BY course_number NULLS LAST, name';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM public.subjects WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function detailWithModules(string $id): ?array
    {
        $subject = $this->findById($id);
        if ($subject === null) {
            return null;
        }
        $modules = [];
        $stmt = $this->db->prepare(
            'SELECT id, title, sort_order FROM public.modules WHERE subject_id = :id ORDER BY sort_order NULLS LAST, title'
        );
        $stmt->execute(['id' => $id]);
        $modules = $stmt->fetchAll();
        return ['subject' => $subject, 'modules' => $modules];
    }

    public function create(array $data): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO public.subjects (name, course_number, semester, control_type, lecture_hours, practice_hours)
             VALUES (:name, :course, :sem, :ctrl, :lec, :prac) RETURNING *'
        );
        $stmt->execute([
            'name' => $data['name'],
            'course' => $data['course_number'] ?? null,
            'sem' => $data['semester'] ?? null,
            'ctrl' => $data['control_type'] ?? null,
            'lec' => $data['lecture_hours'] ?? null,
            'prac' => $data['practice_hours'] ?? null,
        ]);
        $row = $stmt->fetch();
        if ($row === false) throw new \RuntimeException('Create subject failed');
        return $row;
    }

    public function update(string $id, array $data): array
    {
        $map = [
            'name' => 'name',
            'course_number' => 'course',
            'semester' => 'sem',
            'control_type' => 'ctrl',
            'lecture_hours' => 'lec',
            'practice_hours' => 'prac',
        ];
        $fields = [];
        $params = ['id' => $id];
        foreach ($map as $col => $key) {
            if (array_key_exists($col, $data)) {
                $fields[] = "$col = :$key";
                $params[$key] = $data[$col];
            }
        }
        if (!$fields) {
            $row = $this->findById($id);
            if ($row === null) throw new \RuntimeException('Subject not found');
            return $row;
        }
        $sql = 'UPDATE public.subjects SET ' . implode(', ', $fields) . ' WHERE id = :id RETURNING *';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        if ($row === false) throw new \RuntimeException('Update subject failed');
        return $row;
    }

    public function delete(string $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM public.subjects WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->rowCount() > 0;
    }
}
