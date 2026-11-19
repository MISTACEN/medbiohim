"use client";

import { useEffect, useMemo, useState } from "react";
import { aiNotesFromFile, cardPackAiGenerate, cardPackCreate } from "@/lib/features-api";
import { listSubjectsCatalog } from "@/lib/api";
import { createMyLecture } from "@/lib/api/myLectures";
import { describeApiError } from "@/lib/errors";

import { MAX_AUDIO_BYTES, MAX_FILE_BYTES, fileToBase64, isAudioFile } from "./model";

/**
 * Данные страницы «Конспект из файла»: выбор файла с проверкой размера,
 * генерация конспекта ИИ, сохранение как личной лекции и сборка пак карточек.
 */
export function useNotesImport() {
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState("");
  const [cardsBusy, setCardsBusy] = useState(false);
  const [cardsNote, setCardsNote] = useState("");
  const [title, setTitle] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [subjects, setSubjects] = useState<Array<{ name: string; slug: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await listSubjectsCatalog();
      if (r.ok) {
        const items = (r.data?.items || []) as any[];
        setSubjects(items.map((s) => ({ name: String(s.name || ""), slug: String(s.slug || "") })).filter((s) => s.slug));
      }
    })();
  }, []);

  const inferredTitle = useMemo(() => {
    if (title) return title;
    if (file) return file.name.replace(/\.[^.]+$/, "").slice(0, 120);
    return "";
  }, [title, file]);

  async function pickFile(next: File | null) {
    setSavedId(null);
    setNotes("");
    setError(null);
    if (!next) { setFile(null); return; }
    const limit = isAudioFile(next) ? MAX_AUDIO_BYTES : MAX_FILE_BYTES;
    if (next.size > limit) {
      setError(isAudioFile(next)
        ? "Аудио больше 4 МБ — сожмите запись (mp3 64 кбит/с вмещает ~8 минут речи в 4 МБ) и попробуйте снова."
        : "Файл больше 8 МБ — уменьшите фото или разберите PDF по частям.");
      return;
    }
    setFile(next);
  }

  async function generate() {
    if (!file || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const response = await aiNotesFromFile({
        content_base64: contentBase64,
        mime: file.type || "application/octet-stream",
        filename: file.name,
      });
      if (!response.ok) {
        setError(describeApiError(response.error));
        return;
      }
      setNotes(response.data.notes_markdown);
    } catch {
      setError("Не удалось прочитать файл — попробуйте другой формат.");
    } finally {
      setGenerating(false);
    }
  }

  async function makeCards() {
    const slug = subjectSlug || (subjects[0]?.slug || "");
    if (!notes.trim() || cardsBusy) return;
    setCardsBusy(true);
    setError("");
    setCardsNote("");
    const draft = await cardPackAiGenerate({
      topic: (inferredTitle || "Конспект").trim().slice(0, 300),
      subject_slug: slug || undefined,
      source_text: notes.slice(0, 12000),
    });
    if (!draft.ok) {
      setCardsBusy(false);
      setError(describeApiError(draft.error));
      return;
    }
    const items = (draft.data?.cards || [])
      .map((card) => ({ front: String(card.front || "").trim(), back: String(card.back || "").trim() }))
      .filter((card) => card.front && card.back);
    if (!items.length) {
      setCardsBusy(false);
      setError("ИИ не нашёл в конспекте фактов для карточек");
      return;
    }
    const pack = await cardPackCreate({
      title: `Из конспекта: ${(inferredTitle || "без названия").slice(0, 150)}`,
      description: "Карточки собраны ИИ из конспекта, сделанного по фото/PDF/аудио.",
      subject_slug: slug || null,
      source: "ai",
      items,
    });
    setCardsBusy(false);
    if (pack.ok) setCardsNote(`Готово: ${pack.data.card_count} карточек в паках карточек.`);
    else setError(describeApiError(pack.error));
  }

  async function save() {
    const slug = subjectSlug || (subjects[0]?.slug || "");
    if (!inferredTitle.trim() || !slug || !notes.trim() || saving) return;
    setSaving(true);
    setError(null);
    const response = await createMyLecture({
      title: inferredTitle.trim().slice(0, 200),
      subject_slug: slug,
      body_md: notes,
      lesson_type: "lecture",
    });
    setSaving(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    const lectureId = String(response.data?.lecture?.id || "");
    if (lectureId) setSavedId(lectureId);
  }

  return {
    file, generating, notes, setNotes,
    cardsBusy, cardsNote, title, setTitle,
    subjectSlug, setSubjectSlug, subjects,
    saving, savedId, error,
    inferredTitle, pickFile, generate, makeCards, save,
  };
}

export type NotesImportView = ReturnType<typeof useNotesImport>;
