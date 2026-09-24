<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;

/** Lecture pages JSON store. Status: draft | pending_review | published | rejected | archived. */
final class LectureService
{
    private string $path;

    public function __construct(?string $dataDir = null)
    {
        $dir = $dataDir ?: dirname(__DIR__, 2) . '/data';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $this->path = $dir . '/lectures.json';
        if (!is_file($this->path)) {
            $this->write(['items' => [], 'updated_at' => gmdate('c')]);
        }
    }

    /** @return list<array<string,mixed>> */
    public function listAll(?string $status = null, ?string $subjectSlug = null): array
    {
        $items = $this->readItems();
        if ($status !== null && $status !== '') {
            $items = array_values(array_filter($items, static fn($x) => ($x['status'] ?? '') === $status));
        }
        if ($subjectSlug !== null && $subjectSlug !== '') {
            $items = array_values(array_filter($items, static fn($x) => ($x['subject_slug'] ?? '') === $subjectSlug));
        }
        usort($items, static function ($a, $b) {
            return strcmp((string) ($b['updated_at'] ?? ''), (string) ($a['updated_at'] ?? ''));
        });
        return $items;
    }

    /** @return list<array<string,mixed>> */
    public function listPublished(?string $subjectSlug = null): array
    {
        $items = $this->listAll('published', $subjectSlug);
        if ($subjectSlug !== 'histology') {
            return $items;
        }

        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT id, title, subject_slug, kind, prep_names, linked_prep_ids, body_markdown,
                        description_algorithm_ref, is_published, created_at, updated_at
                 FROM public.histology_lectures
                 WHERE subject_slug = :subject_slug AND is_published = true
                 ORDER BY title'
            );
            $stmt->execute(['subject_slug' => 'histology']);
            $legacy = $stmt->fetchAll() ?: [];
            foreach ($legacy as $row) {
                $items[] = [
                    'id' => 'histology-' . (string) $row['id'],
                    'title' => (string) ($row['title'] ?? ''),
                    'subject' => 'Гистология, цитология',
                    'subject_slug' => 'histology',
                    'topic' => (string) ($row['kind'] ?? 'Гистология'),
                    'body_md' => (string) ($row['body_markdown'] ?? ''),
                    'summary' => !empty($row['prep_names'])
                        ? 'Связанные препараты: ' . implode(', ', (array) $row['prep_names'])
                        : '',
                    'media' => [],
                    'sources' => [],
                    'status' => 'published',
                    'published_at' => $row['created_at'] ?? null,
                    'created_at' => $row['created_at'] ?? null,
                    'updated_at' => $row['updated_at'] ?? null,
                    'legacy_histology_id' => $row['id'],
                    'linked_prep_ids' => $row['linked_prep_ids'] ?? [],
                    'description_algorithm_ref' => $row['description_algorithm_ref'] ?? null,
                ];
            }
        } catch (\Throwable $e) {
            // Keep the normal lecture store available if the legacy table is unavailable.
        }

        return $items;
    }

    public function get(string $id): ?array
    {
        foreach ($this->readItems() as $row) {
            if ((string) ($row['id'] ?? '') === $id) {
                return $row;
            }
        }
        return null;
    }

    public function getPublished(string $id): ?array
    {
        $row = $this->get($id);
        if ($row !== null && ($row['status'] ?? '') === 'published') {
            return $row;
        }
        if (!str_starts_with($id, 'histology-')) {
            return null;
        }

        $legacyId = substr($id, strlen('histology-'));
        try {
            $stmt = Connection::pdo()->prepare(
                'SELECT id, title, subject_slug, kind, prep_names, linked_prep_ids, body_markdown,
                        description_algorithm_ref, is_published, created_at, updated_at
                 FROM public.histology_lectures
                 WHERE id = :id AND subject_slug = :subject_slug AND is_published = true
                 LIMIT 1'
            );
            $stmt->execute(['id' => $legacyId, 'subject_slug' => 'histology']);
            $r = $stmt->fetch();
            if ($r === false) return null;
            return [
                'id' => $id,
                'title' => (string) ($r['title'] ?? ''),
                'subject' => 'Гистология, цитология',
                'subject_slug' => 'histology',
                'topic' => (string) ($r['kind'] ?? 'Гистология'),
                'body_md' => (string) ($r['body_markdown'] ?? ''),
                'summary' => !empty($r['prep_names'])
                    ? 'Связанные препараты: ' . implode(', ', (array) $r['prep_names'])
                    : '',
                'media' => [],
                'sources' => [],
                'status' => 'published',
                'published_at' => $r['created_at'] ?? null,
                'created_at' => $r['created_at'] ?? null,
                'updated_at' => $r['updated_at'] ?? null,
                'linked_prep_ids' => $r['linked_prep_ids'] ?? [],
                'description_algorithm_ref' => $r['description_algorithm_ref'] ?? null,
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }

    /** @param array<string,mixed> $data */
    public function create(array $data): array
    {
        $items = $this->readItems();
        $id = (string) ($data['id'] ?? ('lec-' . bin2hex(random_bytes(6))));
        $now = gmdate('c');
        $row = array_merge([
            'id' => $id,
            'status' => 'pending_review',
            'title' => '',
            'subject' => '',
            'subject_slug' => '',
            'topic' => '',
            'body_md' => '',
            'summary' => '',
            'media' => [],
            'sources' => [],
            'generation' => [],
            'created_by' => null,
            'reviewed_by' => null,
            'published_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ], $data, ['id' => $id, 'updated_at' => $now]);
        $items[] = $row;
        $this->write(['items' => $items, 'updated_at' => $now]);
        return $row;
    }

    /** @param array<string,mixed> $patch */
    public function update(string $id, array $patch): ?array
    {
        $items = $this->readItems();
        foreach ($items as $i => $row) {
            if ((string) ($row['id'] ?? '') !== $id) {
                continue;
            }
            $now = gmdate('c');
            unset($patch['id'], $patch['created_at']);
            $items[$i] = array_merge($row, $patch, ['updated_at' => $now]);
            $this->write(['items' => $items, 'updated_at' => $now]);
            return $items[$i];
        }
        return null;
    }

    public function setStatus(string $id, string $status, ?string $reviewerId = null): ?array
    {
        $allowed = ['draft', 'pending_review', 'published', 'rejected', 'archived'];
        if (!in_array($status, $allowed, true)) {
            throw new \InvalidArgumentException('Недопустимый статус');
        }
        $patch = ['status' => $status];
        if ($reviewerId) {
            $patch['reviewed_by'] = $reviewerId;
        }
        if ($status === 'published') {
            $patch['published_at'] = gmdate('c');
        }
        if ($status === 'rejected' || $status === 'archived') {
            $patch['published_at'] = null;
        }
        return $this->update($id, $patch);
    }

    public function delete(string $id): bool
    {
        $items = $this->readItems();
        $n = count($items);
        $items = array_values(array_filter($items, static fn($x) => (string) ($x['id'] ?? '') !== $id));
        if (count($items) === $n) {
            return false;
        }
        $this->write(['items' => $items, 'updated_at' => gmdate('c')]);
        return true;
    }

    /** @return list<array<string,mixed>> */
    private function readItems(): array
    {
        if (!is_file($this->path)) {
            return [];
        }
        $raw = file_get_contents($this->path);
        $j = $raw ? json_decode($raw, true) : null;
        if (!is_array($j)) {
            return [];
        }
        return isset($j['items']) && is_array($j['items']) ? $j['items'] : [];
    }

    /** @param array{items:list,updated_at:?string} $payload */
    private function write(array $payload): void
    {
        $tmp = $this->path . '.tmp';
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($json === false || file_put_contents($tmp, $json . PHP_EOL, LOCK_EX) === false) {
            throw new \RuntimeException('Не удалось сохранить лекции');
        }
        if (!@rename($tmp, $this->path)) {
            @unlink($tmp);
            throw new \RuntimeException('Не удалось заменить файл лекций');
        }
    }
}
