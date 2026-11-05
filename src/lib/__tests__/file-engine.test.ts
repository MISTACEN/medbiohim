import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  DEFAULT_LIMITS,
  buildSheetGrid,
  checkArchiveBudget,
  checkPreviewSafety,
  detectFile,
  formatBytes,
  getFormatById,
  inlineMarkdown,
  listZip,
  parseCsv,
  parseDocx,
  parseMarkdown,
  sanitizeArchiveEntries,
  sanitizeFileName,
  sniffSignature,
} from "@/shared/file-engine";
import {
  canEnterAdminConsole,
  canManageGlobalCatalog,
  canManageGroups,
  capabilitiesFor,
  hasCapability,
  isScopeActive,
  normalizeRoles,
  scopeCoversStudent,
} from "@/shared/permissions";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function buildDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Тема лекции</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Первый пункт</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Жирный вывод</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ячейка</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("File Engine: определение формата", () => {
  it("узнаёт DOCX по расширению, MIME и ZIP-сигнатуре", () => {
    const detection = detectFile({
      name: "lecture.docx",
      mime: DOCX_MIME,
      head: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
    });
    expect(detection.format.id).toBe("docx");
    expect(detection.signature).toBe("zip");
    expect(detection.signatureMatches).toBe(true);
    expect(detection.mimeMismatch).toBe(false);
    expect(detection.canPreviewInline).toBe(true);
  });

  it("не открывает PDF, замаскированный под PNG", () => {
    const head = new TextEncoder().encode("%PDF-1.7\n%\u00e2\u00e3\n");
    expect(sniffSignature(head)).toBe("pdf");
    const detection = detectFile({ name: "scan.png", mime: "image/png", head });
    expect(detection.signatureMatches).toBe(false);
    expect(detection.canPreviewInline).toBe(false);
    expect(detection.reasons.join(" ")).toContain("Сигнатура: PDF");
  });

  it("старые форматы Office требуют конвертации и не открываются как inline", () => {
    expect(getFormatById("doc")?.conversion).toBe("server");
    expect(getFormatById("doc")?.viewer).toBe("fallback");
  });

  it("неизвестный формат получает fallback, а не исключение", () => {
    const detection = detectFile({ name: "dataset.xyz", mime: "application/octet-stream" });
    expect(detection.format.id).toBe("unknown");
    expect(detection.canPreviewInline).toBe(false);
  });

  it("размер форматируется без потери единиц", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(2048)).toBe("2.0 КБ");
  });
});

describe("File Engine: безопасность", () => {
  it("отказывает в просмотре слишком большого файла", () => {
    const verdict = checkPreviewSafety({
      format: getFormatById("docx")!,
      size: DEFAULT_LIMITS.maxOfficeBytes + 1,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("too_large");
  });

  it("блокирует просмотр при несовпадении содержимого и расширения", () => {
    const verdict = checkPreviewSafety({
      format: getFormatById("png")!,
      signatureMatches: false,
      signature: "pdf",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("mime_mismatch");
  });

  it("отбрасывает path traversal, абсолютные пути и слишком глубокие вложения", () => {
    const result = sanitizeArchiveEntries(
      [
        "notes/file.txt",
        "../secret.txt",
        "/etc/passwd",
        "C:/Windows/system32.txt",
        "a/b/c/d/e/f/g/h/i/j/k/l/m/n.txt",
        "bad\u0000name.txt",
      ],
      DEFAULT_LIMITS,
    );
    expect(result.entries.map((entry) => entry.path)).toEqual(["notes/file.txt"]);
    expect(result.rejected).toHaveLength(5);
  });

  it("видит zip-бомбу по коэффициенту сжатия", () => {
    const verdict = checkArchiveBudget([{ compressedSize: 10, uncompressedSize: 10_000_000 }]);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("archive_bomb");
  });

  it("чистит имя файла для заголовка скачивания", () => {
    expect(sanitizeFileName("../../etc/паспорт.pdf")).toBe("паспорт.pdf");
    expect(sanitizeFileName("", "file")).toBe("file");
  });

  it("перечисляет архив без распаковки и не показывает опасные пути", async () => {
    const zip = new JSZip();
    zip.file("docs/lecture.txt", "текст");
    zip.folder("images");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const listing = await listZip(buffer);
    expect(listing.totalEntries).toBeGreaterThanOrEqual(2);
    expect(listing.entries.map((entry) => entry.path)).toContain("docs/lecture.txt");
    expect(listing.rejected).toHaveLength(0);
  });
});

describe("File Engine: текст и таблицы", () => {
  it("разбирает CSV с кавычками и точкой с запятой", () => {
    const table = parseCsv('a;b\n"1;2";3');
    expect(table.delimiter).toBe(";");
    expect(table.rows).toEqual([
      ["a", "b"],
      ["1;2", "3"],
    ]);
  });

  it("ограничивает CSV по строкам", () => {
    const input = Array.from({ length: 10 }, (_, index) => `row${index}`).join("\n");
    const table = parseCsv(input, { ...DEFAULT_LIMITS, maxCsvRows: 3 });
    expect(table.rows).toHaveLength(3);
    expect(table.truncated).toBe(true);
  });

  it("Markdown разбирается в блоки, а не в HTML", () => {
    const blocks = parseMarkdown("# Заголовок\n\n- один\n- два\n\n```js\nconst a = 1;\n```");
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "Заголовок" });
    expect(blocks[1]).toEqual({ type: "list", ordered: false, items: ["один", "два"] });
    expect(blocks[2]).toEqual({ type: "code", language: "js", text: "const a = 1;" });
  });

  it("не превращает javascript-ссылку в ссылку", () => {
    const tokens = inlineMarkdown("[клик](javascript:alert(1))");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe("text");
  });

  it("сохраняет http-ссылку и форматирование", () => {
    const tokens = inlineMarkdown("**жирный** и [сайт](https://example.org) и `код`");
    expect(tokens.map((token) => token.type)).toEqual(["bold", "text", "link", "text", "code"]);
    expect(tokens[2].href).toBe("https://example.org");
  });

  it("строит сетку листа с объединёнными ячейками", () => {
    const grid = buildSheetGrid(
      [
        ["A", "B", "C"],
        ["D", "E", "F"],
      ],
      [{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }],
    );
    expect(grid.rows[0][0].colSpan).toBe(2);
    expect(grid.rows[0][0].value).toBe("A");
    expect(grid.rows[0][1].covered).toBe(true);
    expect(grid.rows[1][0].covered).toBe(false);
    expect(grid.colCount).toBe(3);
  });
});

describe("File Engine: разбор DOCX", () => {
  it("читает заголовок, список, жирный текст и таблицу", async () => {
    const buffer = await buildDocx();
    const document = await parseDocx(buffer);

    expect(document.blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect((document.blocks[0] as { runs: Array<{ text: string }> }).runs[0].text).toBe("Тема лекции");

    expect(document.blocks[1]).toMatchObject({ type: "paragraph", list: { level: 0 } });

    expect(document.blocks[2]).toMatchObject({ type: "paragraph" });
    expect((document.blocks[2] as { runs: Array<{ bold?: boolean }> }).runs[0].bold).toBe(true);

    expect(document.blocks[3]).toMatchObject({ type: "table", rows: [["Ячейка"]] });
    expect(document.truncated).toBe(false);
  });

  it("объясняет, что файл не DOCX", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "не документ");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    await expect(parseDocx(buffer)).rejects.toThrow(/word\/document.xml/);
  });
});

describe("Полномочия: роль → capability → scope", () => {
  it("teacher не входит в Admin-консоль и не управляет группами", () => {
    expect(canEnterAdminConsole(["teacher"])).toBe(false);
    expect(canManageGroups(["teacher"])).toBe(false);
    expect(canManageGlobalCatalog(["teacher"])).toBe(false);
  });

  it("только admin получает административные capabilities", () => {
    expect(canEnterAdminConsole(["admin"])).toBe(true);
    expect(canManageGroups(["admin"])).toBe(true);
    expect(capabilitiesFor(["student"]).has("admin.users.manage")).toBe(false);
  });

  it("teacher имеет учебные capabilities, но не административные", () => {
    expect(hasCapability(["teacher"], "teacher.tests.publish")).toBe(true);
    expect(hasCapability(["teacher"], "teacher.results.view")).toBe(true);
    expect(hasCapability(["teacher"], "admin.roles.manage")).toBe(false);
  });

  it("moderator не получает Admin автоматически", () => {
    expect(canEnterAdminConsole(["moderator"])).toBe(false);
    expect(hasCapability(["moderator"], "workshop.moderate")).toBe(true);
    expect(hasCapability(["moderator"], "admin.settings.manage")).toBe(false);
  });

  it("нормализует роли и отбрасывает мусор", () => {
    expect(normalizeRoles(["Admin", " teacher ", "unknown", null])).toEqual(["admin", "teacher"]);
    expect(normalizeRoles(null)).toEqual([]);
  });

  it("проверяет активность и срок действия назначения преподавателя", () => {
    const now = new Date("2026-11-05T10:00:00Z");
    expect(isScopeActive({ groupIds: [], studentIds: [], active: true }, now)).toBe(true);
    expect(
      isScopeActive(
        { groupIds: [], studentIds: [], active: true, expiresAt: "2026-01-01T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("объект доступен только в назначенной группе или конкретному студенту", () => {
    const scope = { groupIds: ["g1"], studentIds: ["s9"], active: true };
    expect(scopeCoversStudent(scope, "s1", ["g1"])).toBe(true);
    expect(scopeCoversStudent(scope, "s9", [])).toBe(true);
    expect(scopeCoversStudent(scope, "s2", ["g2"])).toBe(false);
    expect(scopeCoversStudent({ ...scope, active: false }, "s9", ["g1"])).toBe(false);
  });
});
