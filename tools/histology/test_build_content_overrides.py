"""Тесты применения восстановленных ключей (ANSWER_OVERRIDES) в build_content.py.

Прогон на РЕАЛЬНОМ JSON (public/content/histology/citologiya-embriologiya.json):
ключи должны ставиться по нормализованному тексту вопроса и держаться после
любой перенумерации/дедупликации пересборки. Запуск:
    python -m unittest tools/histology/test_build_content_overrides.py
"""

import json
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools" / "histology"))

import build_content as bc  # noqa: E402

REAL_JSON = REPO / "public" / "content" / "histology" / "citologiya-embriologiya.json"
BANK_TITLE = "Цитология: тесты закрытого типа"
EXPECTED = {
    "содержимое клетки отделено от внешней среды или соседних клеток": "4",
    "диаметр канальцев гладкой эндоплазматической сети составляет в среднем": "3",
    "диффузия является примером": "3",
    "половые клетки имеют набор хромосом": "1",
}
# Сопоставление в тестах — той же нормализацией, что и в overrides.
EXPECTED_NORM = {bc.norm_key(text): answer for text, answer in EXPECTED.items()}


def load_bank():
    data = json.loads(REAL_JSON.read_text(encoding="utf-8"))
    return next(b for b in data["banks"] if b["title"] == BANK_TITLE)


def clear_target_answers(bank):
    """Снимает эталон у целевых вопросов — как после пересборки без ключей."""
    target_keys = {bc.norm_key(t) for t in EXPECTED}
    cleared = 0
    for q in bank["questions"]:
        if bc.norm_key(q.get("text") or "") in target_keys:
            q["answer"] = None
            q.pop("restored", None)
            cleared += 1
    return cleared


class TestAnswerOverrides(unittest.TestCase):
    @unittest.skipUnless(REAL_JSON.exists(), "нет реального JSON — прогони сборку")
    def test_real_json_all_four_keys_applied(self):
        bank = load_bank()
        cleared = clear_target_answers(bank)
        self.assertEqual(cleared, 4, "не нашёл все 4 целевых вопроса в реальном JSON")
        unmatched = bc.apply_answer_overrides([bank], bc.ANSWER_OVERRIDES)
        self.assertEqual(unmatched, [], "все override-ключи должны покрыться текстами")
        target_keys = {bc.norm_key(t) for t in EXPECTED}
        hits = [q for q in bank["questions"] if bc.norm_key(q.get("text") or "") in target_keys]
        self.assertEqual(len(hits), 4)
        for q in hits:
            self.assertEqual(q["answer"], EXPECTED_NORM[bc.norm_key(q["text"])])
            self.assertTrue(q.get("restored"), "вопрос должен быть помечен restored=True")

    def test_keys_survive_renumber_and_dedup(self):
        """Симуляция пересборки: вопросы перемешаны, дубли удалены, номера сдвинуты."""
        bank = load_bank()
        questions = [dict(q) for q in bank["questions"] if q.get("options")]
        # дедупликация по norm_key (как в build()) — дубликаты с другими номерами
        seen, unique = set(), []
        for q in questions:
            key = bc.norm_key(q["text"])
            if key in seen:
                continue
            seen.add(key)
            unique.append(dict(q, answer=None))
        # перемешивание детерминированное + перенумерация
        unique.reverse()
        rebuilt = {"title": BANK_TITLE, "questions": unique}
        for i, q in enumerate(rebuilt["questions"], 1):
            q["number"] = i
        self.assertNotEqual(
            [q["number"] for q in rebuilt["questions"] if bc.norm_key(q["text"]) in {bc.norm_key(t) for t in EXPECTED}],
            [1, 55, 68, 81],
            "симуляция должна сдвинуть номера — иначе тест ничего не доказывает",
        )
        unmatched = bc.apply_answer_overrides([rebuilt], bc.ANSWER_OVERRIDES)
        self.assertEqual(unmatched, [])
        for q in rebuilt["questions"]:
            norm = bc.norm_key(q["text"])
            if norm in {bc.norm_key(t) for t in EXPECTED}:
                self.assertEqual(q["answer"], EXPECTED_NORM[norm])
                self.assertTrue(q.get("restored"))

    def test_idempotent(self):
        bank = load_bank()
        clear_target_answers(bank)
        bc.apply_answer_overrides([bank], bc.ANSWER_OVERRIDES)
        bc.apply_answer_overrides([bank], bc.ANSWER_OVERRIDES)
        for q in bank["questions"]:
            norm = bc.norm_key(q.get("text") or "")
            if norm in {bc.norm_key(t) for t in EXPECTED}:
                self.assertEqual(q["answer"], EXPECTED_NORM[norm])
            else:
                self.assertNotIn("restored", q)

    def test_unmatched_reported_when_text_changed(self):
        """Если формулировка в источнике изменилась — ключ не теряется молча."""
        bank = load_bank()
        clear_target_answers(bank)
        for q in bank["questions"]:
            if bc.norm_key(q["text"]) == bc.norm_key("диффузия является примером"):
                q["text"] = "Диффузия относится к: (переформулировка в новом издании)"
        unmatched = bc.apply_answer_overrides([bank], bc.ANSWER_OVERRIDES)
        self.assertTrue(any("диффузия является примером" in key for _, key in unmatched))


if __name__ == "__main__":
    unittest.main()
