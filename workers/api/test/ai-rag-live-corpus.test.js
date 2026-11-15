import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

import { MIN_RELEVANCE, selectLectureExcerpts } from "../src/lib/lecture-rag.ts";

/**
 * Живая проверка на настоящих лекциях проекта: корпус читается из
 * `public/content/lectures/<предмет>/*.md`, вопросы — те, что студент задаёт
 * тьютору по теме занятия.
 */
const LECTURES = new URL("../../../public/content/lectures/", import.meta.url);

async function loadSubject(subject) {
  const dir = new URL(`${subject}/`, LECTURES);
  const files = (await readdir(dir)).filter((file) => file.endsWith(".md")).sort();
  const docs = [];
  for (const file of files) {
    const raw = await readFile(new URL(file, dir), "utf8");
    const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    const title = (front?.[1].match(/^title:\s*(.+)$/m) || [])[1] || file;
    docs.push({
      id: file.replace(/\.md$/, ""),
      title: title.trim(),
      body: front ? raw.slice(front[0].length) : raw,
      subjectSlug: subject,
    });
  }
  return docs;
}

const physiology = await loadSubject("physiology");
const histology = await loadSubject("histology");

const ids = (picked) => picked.map((entry) => entry.id);

test("корпус лекций действительно загружен", () => {
  assert.ok(physiology.length >= 20, `физиология: ${physiology.length} лекций`);
  assert.ok(histology.length >= 18, `гистология: ${histology.length} лекций`);
});

test("физиология: гемолиз — только лекции о крови", () => {
  const picked = selectLectureExcerpts(physiology, "Объясни механизм гемолиза эритроцитов");
  const blood = new Set(["krov-01", "lec-6fb509db7efb4fbd", "lec-6940f5d6a7884a58"]);
  assert.ok(ids(picked).includes("lec-6fb509db7efb4fbd"), `нет лекции о форменных элементах: ${ids(picked).join(", ")}`);
  for (const id of ids(picked)) {
    assert.ok(blood.has(id), `в источниках о гемолизе лишняя лекция: ${id} (${picked.find((entry) => entry.id === id).title})`);
  }
  for (const entry of picked) assert.ok(entry.relevance >= MIN_RELEVANCE);
});

test("физиология: разговорный вопрос про гипотонию остаётся про кровь", () => {
  const picked = selectLectureExcerpts(physiology, "Почему при гипотонии эритроциты набухают и разрушаются?");
  assert.ok(ids(picked).includes("krov-01"), `ожидалась лекция о свойствах крови: ${ids(picked).join(", ")}`);
  assert.ok(!ids(picked).includes("lec-f032784e3caf4e67"), "мышечное сокращение — не источник");
  assert.ok(!ids(picked).includes("lec-75da7a3c6a354eed"), "рефлекс — не источник");
});

test("физиология: вопрос с редким словом не вытаскивает чужие лекции", () => {
  const picked = selectLectureExcerpts(physiology, "Что происходит с пищей в желудке?");
  assert.deepEqual(ids(picked), ["digest-02"], "должна остаться только лекция о пищеварении в желудке");
});

test("физиология: название темы задаёт ответ", () => {
  assert.deepEqual(
    ids(selectLectureExcerpts(physiology, "Что такое группы крови и резус-фактор?")),
    ["lec-6940f5d6a7884a58"],
  );
  assert.equal(ids(selectLectureExcerpts(physiology, "Как регулируется дыхание?"))[0], "resp-02");
  assert.equal(ids(selectLectureExcerpts(physiology, "Как почки образуют мочу?"))[0], "resp-03");
  assert.deepEqual(
    ids(selectLectureExcerpts(physiology, "Как работает вегетативная нервная система?")),
    ["lec-7a1a41c1be12466b"],
  );
});

test("физиология: без темы вопроса источников нет", () => {
  assert.deepEqual(selectLectureExcerpts(physiology, "Объясни подробнее"), []);
  assert.deepEqual(selectLectureExcerpts(physiology, "Как настроить принтер в Windows?"), []);
});

test("гистология: тема в названии лекции ведёт список", () => {
  assert.equal(ids(selectLectureExcerpts(histology, "Строение эритроцита и лейкоцита"))[0], "hist-05-krov");
  assert.equal(ids(selectLectureExcerpts(histology, "Какие органеллы есть в клетке?"))[0], "hist-01-citologiya-organelly");
  assert.equal(ids(selectLectureExcerpts(histology, "Строение красного костного мозга"))[0], "hist-16-krovetvorenie");
  assert.equal(ids(selectLectureExcerpts(histology, "Строение хрящевой ткани"))[0], "hist-07-hryaschevye-kostnye");
  assert.equal(ids(selectLectureExcerpts(histology, "Строение лимфатического узла"))[0], "hist-17-limfoidnye-organy");
});

test("гистология: точная тема оставляет один источник", () => {
  assert.deepEqual(
    ids(selectLectureExcerpts(histology, "Что такое синапс и какие бывают нервные окончания?")),
    ["hist-09-nervnaya-tkan"],
  );
  assert.deepEqual(
    ids(selectLectureExcerpts(histology, "Чем покровный эпителий отличается от железистого?")),
    ["hist-04-epitelialnye-tkani"],
  );
  assert.deepEqual(
    ids(selectLectureExcerpts(histology, "Как устроен спинной мозг?")),
    ["hist-10-nervnaya-sistema"],
  );
});

test("гистология: миелин — только лекции о нервной ткани", () => {
  const picked = selectLectureExcerpts(histology, "Чем миелиновое нервное волокно отличается от безмиелинового?");
  const nervous = new Set(["hist-09-nervnaya-tkan", "hist-10-nervnaya-sistema", "hist-11-kora-mozzhechok-vns"]);
  assert.ok(ids(picked).includes("hist-09-nervnaya-tkan"), `нет лекции о нервной ткани: ${ids(picked).join(", ")}`);
  for (const id of ids(picked)) assert.ok(nervous.has(id), `лишняя лекция о миелине: ${id}`);
});

test("гистология: вопрос не по теме не даёт источников", () => {
  assert.deepEqual(selectLectureExcerpts(histology, "Объясни подробнее"), []);
});
