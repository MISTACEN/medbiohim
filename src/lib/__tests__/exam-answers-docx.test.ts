import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  buildDocumentBody,
  buildExamAnswersDocx,
  escapeXml,
  examAnswersFileName,
  type ExamAnswersDocument,
} from "@/lib/study/docx";

const doc: ExamAnswersDocument = {
  subject: "physiology",
  subjectTitle: "Физиология",
  generatedAt: "2026-11-14T10:00:00.000Z",
  groups: [
    {
      topic: "Кровь",
      items: [
        { n: 1, text: "Что такое гемолиз?", answer: "Разрушение эритроцитов с выходом гемоглобина." },
        { n: 2, text: "Функции тромбоцитов?", answer: null },
      ],
    },
    { topic: null, items: [{ n: 3, text: "Без темы вопрос?", answer: "Ответ из банка." }] },
  ],
};

async function documentXml(payload: ExamAnswersDocument): Promise<string> {
  const zip = await JSZip.loadAsync(await (await buildExamAnswersDocx(payload)).arrayBuffer());
  return zip.file("word/document.xml")!.async("string");
}

describe("exam answers .docx", () => {
  it("собирает минимальный OOXML-пакет из трёх частей", async () => {
    const blob = await buildExamAnswersDocx(doc);
    expect(blob.type).toContain("wordprocessingml.document");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    // JSZip добавляет записи каталогов — важны три части документа.
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]),
    );
    const types = await zip.file("[Content_Types].xml")!.async("string");
    expect(types).toContain("wordprocessingml.document.main+xml");
  });

  it("кладёт вопросы, ответы и темы в документ", async () => {
    const xml = await documentXml(doc);
    expect(xml).toContain("Ответы к экзамену");
    expect(xml).toContain("Физиология");
    expect(xml).toContain("Кровь");
    expect(xml).toContain("1. Что такое гемолиз?");
    expect(xml).toContain("Ответ: Разрушение эритроцитов");
    expect(xml).toContain("3. Без темы вопрос?");
  });

  it("не выдумывает ответ там, где его нет в банке", async () => {
    const xml = await documentXml(doc);
    expect(xml).toContain("Ответ не опубликован.");
    // Счётчик ответов честный: 2 из 3.
    expect(xml).toContain("Вопросов: 3 · с ответом: 2");
  });

  it("экранирует XML и вырезает управляющие символы", async () => {
    expect(escapeXml('a & b < c > "d" \'e\'')).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
    expect(escapeXml("bad\u0001char")).toBe("badchar");
    const xml = await documentXml({
      ...doc,
      groups: [{ topic: "A&B", items: [{ n: 1, text: "<script>alert(1)</script>", answer: "1 < 2 & 3 > 2" }] }],
    });
    expect(xml).toContain("A&amp;B");
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("1 &lt; 2 &amp; 3 &gt; 2");
  });

  it("предупреждает об обрезке банка и называет файл безопасно", async () => {
    const body = buildDocumentBody({ ...doc, truncated: true });
    expect(body).toContain("В документ вошли не все вопросы банка");
    expect(examAnswersFileName("physiology")).toBe("Ответы-к-экзамену-physiology.docx");
    expect(examAnswersFileName("../../etc/passwd")).toBe("Ответы-к-экзамену-etc-passwd.docx");
  });
});
