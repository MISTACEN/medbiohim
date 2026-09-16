<?php
declare(strict_types=1);

namespace Medbiohim\Support;

final class ContentStore
{
    private string $dir;

    public function __construct(?string $dir = null)
    {
        $this->dir = $dir ?: dirname(__DIR__, 2) . '/data';
        if (!is_dir($this->dir)) {
            @mkdir($this->dir, 0775, true);
        }
    }

    private function read(string $file, mixed $default): mixed
    {
        $p = $this->dir . '/' . $file;
        if (!is_file($p)) {
            return $default;
        }
        $raw = file_get_contents($p);
        if ($raw === false || trim($raw) === '') {
            return $default;
        }
        $v = json_decode($raw, true);
        return $v ?? $default;
    }

    private function write(string $file, mixed $data): mixed
    {
        $p = $this->dir . '/' . $file;
        $tmp = $p . '.tmp';
        $j = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($j === false || file_put_contents($tmp, $j . PHP_EOL, LOCK_EX) === false) {
            throw new \RuntimeException('Could not write content');
        }
        if (!@rename($tmp, $p)) {
            @unlink($tmp);
            throw new \RuntimeException('Could not replace content file');
        }
        return $data;
    }

    public function getSite(): array
    {
        $d = $this->read('site.json', []);
        return array_merge(
            ['title' => 'Медбиохим', 'subtitle' => 'Учебная платформа', 'description' => '', 'announcement_banner' => '', 'contacts' => []],
            isset($d['site']) && is_array($d['site']) ? $d['site'] : []
        );
    }

    public function updateSite(array $p): array
    {
        $s = $this->getSite();
        foreach ($p as $k => $v) {
            $s[$k] = $v;
        }
        $this->write('site.json', ['site' => $s, 'updated_at' => gmdate('c')]);
        return $s;
    }

    public function listAnnouncements(): array
    {
        $d = $this->read('announcements.json', []);
        return isset($d['items']) && is_array($d['items']) ? $d['items'] : (is_array($d) ? $d : []);
    }

    public function createAnnouncement(array $d): array
    {
        $a = $this->listAnnouncements();
        $r = array_merge(['id' => bin2hex(random_bytes(8)), 'created_at' => gmdate('c'), 'pinned' => false], $d);
        $a[] = $r;
        $this->write('announcements.json', ['items' => $a]);
        return $r;
    }

    public function updateAnnouncement(string $id, array $p): ?array
    {
        $a = $this->listAnnouncements();
        foreach ($a as $i => $r) {
            if ((string) ($r['id'] ?? '') === $id) {
                $a[$i] = array_merge($r, $p, ['updated_at' => gmdate('c')]);
                $this->write('announcements.json', ['items' => $a]);
                return $a[$i];
            }
        }
        return null;
    }

    public function deleteAnnouncement(string $id): bool
    {
        $a = $this->listAnnouncements();
        $b = array_values(array_filter($a, static fn($r) => (string) ($r['id'] ?? '') !== $id));
        if (count($a) === count($b)) {
            return false;
        }
        $this->write('announcements.json', ['items' => $b]);
        return true;
    }

    public function listCurriculum(): array
    {
        $master = $this->read('curriculum_master.json', []);
        if (isset($master['items']) && is_array($master['items'])) {
            return $master['items'];
        }
        $d = $this->read('curriculum.json', ['items' => []]);
        return isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
    }

    public function saveCurriculum(array $items): array
    {
        $this->write('curriculum_master.json', [
            'version' => 2,
            'source' => 'admin',
            'courses' => [1, 2, 3, 4, 5, 6],
            'items' => array_values($items),
            'updated_at' => gmdate('c'),
        ]);
        return array_values($items);
    }

    public function curriculumPlan(): array
    {
        $d = $this->read('curriculum_master.json', []);
        return is_array($d) && $d ? $d : $this->read('curriculum.json', []);
    }

    public function listTestsLocal(): array
    {
        $d = $this->read('tests.json', []);
        return isset($d['items']) && is_array($d['items']) ? $d['items'] : (is_array($d) ? $d : []);
    }

    public function saveTestsLocal(array $items): array
    {
        $this->write('tests.json', ['items' => array_values($items), 'updated_at' => gmdate('c')]);
        return array_values($items);
    }

    public function listSchedule(): array
    {
        $d = $this->read('schedule.json', []);
        return isset($d['items']) && is_array($d['items']) ? $d['items'] : (is_array($d) ? $d : []);
    }

    public function listCommunityPosts(): array
    {
        $d = $this->read('community.json', []);
        return isset($d['items']) && is_array($d['items']) ? $d['items'] : (is_array($d) ? $d : []);
    }

    public function createCommunityPost(array $d): array
    {
        $a = $this->listCommunityPosts();
        $r = array_merge(['id' => bin2hex(random_bytes(8)), 'created_at' => gmdate('c')], $d);
        $a[] = $r;
        $this->write('community.json', ['items' => $a]);
        return $r;
    }

    public function updateCommunityPost(string $id, array $p): ?array
    {
        $a = $this->listCommunityPosts();
        foreach ($a as $i => $r) {
            if ((string) ($r['id'] ?? '') === $id) {
                $a[$i] = array_merge($r, $p, ['updated_at' => gmdate('c')]);
                $this->write('community.json', ['items' => $a]);
                return $a[$i];
            }
        }
        return null;
    }

    public function deleteCommunityPost(string $id): bool
    {
        $a = $this->listCommunityPosts();
        $b = array_values(array_filter($a, static fn($r) => (string) ($r['id'] ?? '') !== $id));
        if (count($a) === count($b)) {
            return false;
        }
        $this->write('community.json', ['items' => $b]);
        return true;
    }

    public function listQuestionsBank(): array
    {
        $d = $this->read('questions_bank.json', []);
        return isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
    }

    public function saveQuestionsBank(array $items): array
    {
        $this->write('questions_bank.json', [
            'items' => array_values($items),
            'count' => count($items),
            'updated_at' => gmdate('c'),
            'source' => 'admin',
        ]);
        return array_values($items);
    }

    public function upsertQuestion(array $q): array
    {
        $items = $this->listQuestionsBank();
        $id = (string) ($q['id'] ?? '');
        if ($id === '') {
            $id = 'q-' . bin2hex(random_bytes(6));
            $q['id'] = $id;
        }
        $found = false;
        foreach ($items as $i => $row) {
            if ((string) ($row['id'] ?? '') === $id) {
                $items[$i] = array_merge($row, $q, ['updated_at' => gmdate('c')]);
                $found = true;
                $q = $items[$i];
                break;
            }
        }
        if (!$found) {
            $q['created_at'] = gmdate('c');
            $items[] = $q;
        }
        $this->saveQuestionsBank($items);
        return $q;
    }

    public function deleteQuestion(string $id): bool
    {
        $items = $this->listQuestionsBank();
        $b = array_values(array_filter($items, static fn($r) => (string) ($r['id'] ?? '') !== $id));
        if (count($items) === count($b)) {
            return false;
        }
        $this->saveQuestionsBank($b);
        return true;
    }

    public function listSessions(string $userId): array
    {
        $d = $this->read('sessions.json', ['items' => []]);
        $items = isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
        return array_values(array_filter($items, static fn($s) => (string) ($s['user_id'] ?? '') === $userId));
    }

    public function getSession(string $userId, string $id): ?array
    {
        foreach ($this->listSessions($userId) as $s) {
            if ((string) ($s['id'] ?? '') === $id) {
                return $s;
            }
        }
        return null;
    }

    public function saveSession(array $session): array
    {
        $d = $this->read('sessions.json', ['items' => []]);
        $items = isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
        $id = (string) ($session['id'] ?? '');
        if ($id === '') {
            $id = 'sess-' . bin2hex(random_bytes(6));
            $session['id'] = $id;
        }
        $found = false;
        foreach ($items as $i => $s) {
            if ((string) ($s['id'] ?? '') === $id) {
                $items[$i] = array_merge($s, $session, ['updated_at' => gmdate('c')]);
                $session = $items[$i];
                $found = true;
                break;
            }
        }
        if (!$found) {
            $session['created_at'] = gmdate('c');
            $session['updated_at'] = gmdate('c');
            $items[] = $session;
        }
        $this->write('sessions.json', ['items' => $items, 'updated_at' => gmdate('c')]);
        return $session;
    }

    public function listNotes(string $userId): array
    {
        $d = $this->read('notes.json', ['items' => []]);
        $items = isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
        return array_values(array_filter($items, static fn($n) => (string) ($n['user_id'] ?? '') === $userId));
    }

    public function upsertNote(array $note): array
    {
        $d = $this->read('notes.json', ['items' => []]);
        $items = isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
        $id = (string) ($note['id'] ?? '');
        if ($id === '') {
            $id = 'note-' . bin2hex(random_bytes(5));
            $note['id'] = $id;
        }
        $found = false;
        foreach ($items as $i => $n) {
            if ((string) ($n['id'] ?? '') === $id) {
                $items[$i] = array_merge($n, $note, ['updated_at' => gmdate('c')]);
                $note = $items[$i];
                $found = true;
                break;
            }
        }
        if (!$found) {
            $note['created_at'] = gmdate('c');
            $items[] = $note;
        }
        $this->write('notes.json', ['items' => $items, 'updated_at' => gmdate('c')]);
        return $note;
    }

    public function listFavorites(string $userId): array
    {
        $d = $this->read('favorites.json', ['items' => []]);
        $items = isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
        return array_values(array_filter($items, static fn($f) => (string) ($f['user_id'] ?? '') === $userId));
    }

    public function toggleFavorite(string $userId, string $targetType, string $targetId): array
    {
        $d = $this->read('favorites.json', ['items' => []]);
        $items = isset($d['items']) && is_array($d['items']) ? $d['items'] : [];
        foreach ($items as $i => $f) {
            if (
                (string) ($f['user_id'] ?? '') === $userId
                && (string) ($f['target_type'] ?? '') === $targetType
                && (string) ($f['target_id'] ?? '') === $targetId
            ) {
                array_splice($items, $i, 1);
                $this->write('favorites.json', ['items' => $items, 'updated_at' => gmdate('c')]);
                return ['favorited' => false];
            }
        }
        $items[] = [
            'id' => 'fav-' . bin2hex(random_bytes(4)),
            'user_id' => $userId,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'created_at' => gmdate('c'),
        ];
        $this->write('favorites.json', ['items' => $items, 'updated_at' => gmdate('c')]);
        return ['favorited' => true];
    }
}
