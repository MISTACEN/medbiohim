"use client";

/**
 * Импорт теста из .docx файла.
 * 
 * Поддерживаемый формат:
 * - Заголовок первого уровня (h1) или жирный крупный текст — название теста
 * - Вопросы начинаются с цифры и точки: "1. ", "2. ", "3. "
 * - Варианты ответов помечаются @N., #N., или просто N.:
 *   - @N. — правильный ответ
 *   - #N., N. — неправильные варианты
 * 
 * Пример вопроса:
 * 1. Вопрос текста
 * @1. Правильный ответ
 * #2. Неправильный
 * #3. Другой неправильный
 */

import JSZip from "jszip";
import { docxXmlToText } from "./docx";

export type ParsedTestQuestion = {
  question: string;
  options: string[];
  correctIndex: number; // индекс правильного ответа в массиве options (0-based)
};

export type ParsedTest = {
  title: string;
  sourceName: string;
  questions: ParsedTestQuestion[];
  rawMarkdown: string;
  parsedAt: string;
};

/** Разбирает один вопрос с вариантами ответов */
function parseQuestionBlock(lines: string[], startIndex: number): { question: ParsedTestQuestion | null; endIndex: number } {
  let i = startIndex;
  
  if (i >= lines.length) return { question: null, endIndex: i };

  const line = lines[i].trim();
  
  // Проверяем, начинается ли строка с номера вопроса "1. ", "2. ", etc.
  const questionNumMatch = line.match(/^(\d+)\.\s+(.+)$/);
  if (!questionNumMatch) {
    return { question: null, endIndex: i + 1 };
  }

  const questionText = questionNumMatch[2];
  const variants: { text: string; isCorrect: boolean }[] = [];
  
  i++;
  while (i < lines.length) {
    const variantLine = lines[i].trim();
    
    // Пустая строка — конец блока вопроса
    if (!variantLine) {
      break;
    }
    
    // Проверяем, не новый ли это вопрос
    if (variantLine.match(/^\d+\.\s+/)) {
      break;
    }
    
    // Вариант с маркером: "@1. текст" — правильный, "#1. текст" — неправильный
    const variantMatch = variantLine.match(/^([@#])\s*\d+\.\s+(.+)$/);
    if (variantMatch) {
      variants.push({ text: variantMatch[2].trim(), isCorrect: variantMatch[1] === "@" });
      i++;
      continue;
    }
    
    // Если нет маркировки, считаем это продолжением предыдущего варианта
    if (variants.length > 0) {
      variants[variants.length - 1].text += " " + variantLine;
      i++;
      continue;
    }
    
    // Строка без обработки — возможно, часть вопроса или мусор
    i++;
  }
  
  if (variants.length === 0) {
    return { question: null, endIndex: i };
  }
  
  const correctIndex = variants.findIndex(v => v.isCorrect);
  if (correctIndex === -1) {
    return { question: null, endIndex: i };
  }
  
  return {
    question: { question: questionText, options: variants.map(v => v.text), correctIndex },
    endIndex: i
  };
}

/** Парсит полный текст документа в вопросы теста (экспорт — для тестов) */
export function parseTestFromText(text: string): ParsedTestQuestion[] {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim());
  const questions: ParsedTestQuestion[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const block = parseQuestionBlock(lines, i);
    
    if (block.question) {
      questions.push(block.question);
      i = block.endIndex;
    } else {
      i = block.endIndex;
    }
  }
  
  return questions;
}

/** Загружает и разбирает тест из DOCX файла */
export async function importTestFromDocx(file: File): Promise<ParsedTest> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("word/document.xml");
  
  if (!entry) {
    throw new Error("В .docx не найден word/document.xml — пересохраните файл как .docx");
  }
  
  const xmlText = await entry.async("string");
  const fullText = docxXmlToText(xmlText);
  
  // Заголовок — первая непустая строка, которая не является вопросом
  const titleLine = fullText
    .split(/\r\n|\n/)
    .map((line) => line.trim())
    .find((line) => line && !/^\d+\.\s+/.test(line));
  const title = (titleLine || "Без названия").replace(/[.:]$/, "");

  // Собираем вопросы
  const questions = parseTestFromText(fullText);
  
  if (questions.length === 0) {
    throw new Error("В файле не найдено вопросов в поддерживаемом формате");
  }
  
  return {
    title,
    sourceName: file.name,
    questions,
    rawMarkdown: formatQuestionsAsMarkdown(questions),
    parsedAt: new Date().toISOString()
  };
}

/** Форматирует вопросы обратно в Markdown для предпросмотра */
export function formatQuestionsAsMarkdown(questions: ParsedTestQuestion[]): string {
  return questions.map((q, idx) => {
    const marker = q.correctIndex >= 0 && q.correctIndex < q.options.length ? `@${q.correctIndex + 1}.` : "•";
    return `${idx + 1}. ${q.question}\n` +
      q.options.map((opt, optIdx) => {
        if (optIdx === q.correctIndex) {
          return `${marker} ${opt}`;
        }
        return `#${optIdx + 1}. ${opt}`;
      }).join("\n") + "\n";
  }).join("\n");
}

