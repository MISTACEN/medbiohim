import { describe, expect, it } from "vitest";
import {
  USER_FILES_KEY, addUserFile, collectionNames, filesByCollection, formatFileSize,
  parseUserFiles, readUserFiles, removeUserFile, summarizeUserFiles, updateUserFile,
  type StorageLike, type UserFile,
} from "@/lib/libraryFiles";

function memoryStorage(initial?: string): StorageLike & { value: string | null } {
  const store = {
    value: initial ?? null,
    getItem(key: string) { return key === USER_FILES_KEY ? store.value : null; },
    setItem(key: string, value: string) { if (key === USER_FILES_KEY) store.value = value; },
  };
  return store;
}

function file(overrides: Partial<UserFile> = {}): UserFile {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Методичка.pdf",
    mime: "application/pdf",
    size: 1024,
    subjectSlug: "histology",
    collection: "К зачёту",
    addedAt: "2026-11-04T10:00:00.000Z",
    progressPercent: 0,
    bookmarks: [],
    notes: "",
    ...overrides,
  };
}

describe("parseUserFiles", () => {
  it("возвращает пустой список на мусор", () => {
    expect(parseUserFiles(null)).toEqual([]);
    expect(parseUserFiles("не json")).toEqual([]);
    expect(parseUserFiles('{"a":1}')).toEqual([]);
    expect(parseUserFiles('[{"name":"без id"}]')).toEqual([]);
  });

  it("нормализует прогресс, заметки и закладки", () => {
    const parsed = parseUserFiles(JSON.stringify([
      { id: "a", name: "x", progressPercent: 240, notes: "n", bookmarks: [{ label: "митоз" }, { label: "" }] },
      { id: "b", name: "y", progressPercent: -10 },
    ]));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].progressPercent).toBe(100);
    expect(parsed[0].bookmarks).toHaveLength(1);
    expect(parsed[0].bookmarks[0].label).toBe("митоз");
    expect(parsed[1].progressPercent).toBe(0);
  });
});

describe("личная библиотека", () => {
  it("добавляет файл и обновляет запись по id", () => {
    const storage = memoryStorage();
    addUserFile(file(), storage);
    expect(readUserFiles(storage)).toHaveLength(1);

    updateUserFile(file().id, { progressPercent: 55, notes: "повторить эпителий" }, storage);
    const [stored] = readUserFiles(storage);
    expect(stored.progressPercent).toBe(55);
    expect(stored.notes).toBe("повторить эпителий");
  });

  it("не дублирует файл при повторном добавлении", () => {
    const storage = memoryStorage();
    addUserFile(file(), storage);
    addUserFile(file({ name: "Переименован.pdf" }), storage);
    const files = readUserFiles(storage);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("Переименован.pdf");
  });

  it("ограничивает прогресс диапазоном 0–100", () => {
    const storage = memoryStorage();
    addUserFile(file({ progressPercent: 0 }), storage);
    updateUserFile(file().id, { progressPercent: 999 }, storage);
    expect(readUserFiles(storage)[0].progressPercent).toBe(100);
    updateUserFile(file().id, { progressPercent: -5 }, storage);
    expect(readUserFiles(storage)[0].progressPercent).toBe(0);
  });

  it("удаляет запись и пересчитывает коллекции", () => {
    const storage = memoryStorage();
    addUserFile(file(), storage);
    addUserFile(file({ id: "22222222-2222-4222-8222-222222222222", name: "Лекция.pdf", collection: "Лекции" }), storage);
    expect(collectionNames(readUserFiles(storage))).toEqual(["К зачёту", "Лекции"]);
    expect(filesByCollection(readUserFiles(storage), "Лекции")).toHaveLength(1);

    removeUserFile(file().id, storage);
    const files = readUserFiles(storage);
    expect(files).toHaveLength(1);
    expect(collectionNames(files)).toEqual(["Лекции"]);
  });

  it("считает сводку по файлам", () => {
    expect(summarizeUserFiles([])).toEqual({ total: 0, collections: 0, read: 0, averageProgress: null });
    const summary = summarizeUserFiles([
      file({ progressPercent: 100 }),
      file({ id: "b", name: "b", progressPercent: 50, collection: "" }),
    ]);
    expect(summary).toEqual({ total: 2, collections: 1, read: 1, averageProgress: 75 });
  });

  it("форматирует размер", () => {
    expect(formatFileSize(0)).toBe("—");
    expect(formatFileSize(900)).toBe("900 Б");
    expect(formatFileSize(2048)).toBe("2.0 КБ");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 МБ");
  });
});
