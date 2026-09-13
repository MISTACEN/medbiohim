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
        $sql = 'SELECT id, name, course_number, semester, control_type, lecture_hours, practice_hours, is_active FROM public.subjects WHERE is_active = true';
        $params = [];
        if ($course !== null) { $sql .= ' AND course_number = :course'; $params['course'] = $course; }
        if ($semester !== null) { $sql .= ' AND semester = :semester'; $params['semester'] = $semester; }
        $sql .= ' ORDER BY course_number NULLS LAST, semester NULLS LAST, name';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT id, name, course_number, semester, control_type, lecture_hours, practice_hours, is_active FROM public.subjects WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function detailWithModules(string $id): ?array
    {
        $subject = $this->findById($id);
        if ($subject === null) return null;
        $stmt = $this->db->prepare(
            'SELECT m.id AS module_id, m.title AS module_title, m.order_index AS module_order,
                    t.id AS topic_id, t.title AS topic_title, t.order_index AS topic_order
             FROM public.modules m LEFT JOIN public.topics t ON t.module_id = m.id
             WHERE m.subject_id = :sid ORDER BY m.order_index, t.order_index NULLS LAST'
        );
        $stmt->execute(['sid' => $id]);
        $modules = [];
        foreach ($stmt->fetchAll() ?: [] as $row) {
            $mid = $row['module_id'];
            if (!isset($modules[$mid])) {
                $modules[$mid] = ['id' => $mid, 'title' => $row['module_title'], 'order_index' => (int)$row['module_order'], 'topics' => []];
            }
            if ($row['topic_id'] !== null) {
                $modules[$mid]['topics'][] = ['id' => $row['topic_id'], 'title' => $row['topic_title'], 'order_index' => (int)$row['topic_order']];
            }
        }
        return ['subject' => $subject, 'modules' => array_values($modules)];
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
}
