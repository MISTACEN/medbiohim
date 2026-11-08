/**
 * Unit-тесты для парсера импорта тестов из DOCX
 */

import { describe, expect, it } from "vitest";

import { parseTestFromText, formatQuestionsAsMarkdown } from "@/lib/documents/importTest";

describe("parseTestFromText", () => {
  it("должен разобрать вопрос с одним правильным ответом (@1)", () => {
    const text = `
      1. Любой факт, который может произойти или не произойти в результате опыта со случайным исходом в теории вероятностей называют:
      @1. элементарным событием
      #2. общим решением
      #3. частным решением
      #4. частотой
      #5. вероятностью
      
      2. Случайное выпадение числа при бросании игральной кости в теории вероятностей называют:
      @2. случаем
      #1. событием
      #3. исходом
    `;

    const questions = parseTestFromText(text);
    
    expect(questions.length).toBe(2);
    
    // Первый вопрос
    expect(questions[0].question).toBe("Любой факт, который может произойти или не произойти в результате опыта со случайным исходом в теории вероятностей называют:");
    expect(questions[0].options).toEqual([
      "элементарным событием",
      "общим решением",
      "частным решением",
      "частотой",
      "вероятностью"
    ]);
    expect(questions[0].correctIndex).toBe(0);
    
    // Второй вопрос: правильный ответ записан первым, индекс считается по порядку в файле
    expect(questions[1].question).toBe("Случайное выпадение числа при бросании игральной кости в теории вероятностей называют:");
    expect(questions[1].correctIndex).toBe(0);
  });

  it("должен обработать вопрос с правильным ответом @2 (второй вариант)", () => {
    const text = `
      1. Какой элемент используется для правильного ответа?
      #1. неправильный
      @2. правильный
      #3. тоже неправильный
    `;

    const questions = parseTestFromText(text);
    
    expect(questions[0].correctIndex).toBe(1);
  });

  it("должен пропустить пустые строки между вопросами", () => {
    const text = `
      1. Вопрос один?
      @1. Да
      
      
      2. Вопрос два?
      @2. Нет
    `;

    const questions = parseTestFromText(text);
    expect(questions.length).toBe(2);
  });

  it("должен игнорировать вопросы без правильного ответа", () => {
    const text = `
      1. Вопрос без правильного ответа?
      #1. Неправильный
      #2. Тоже неправильный
      
      2. Вопрос с правильным?
      @1. Правильно
    `;

    const questions = parseTestFromText(text);
    expect(questions.length).toBe(1);
    expect(questions[0].question).toContain("Вопрос с правильным");
  });

  it("должен обработать продолжение текста в варианте ответа", () => {
    const text = `
      1. Что такое белок?
      @1. Полимер аминокислот, 
         связанных пептидными связями
      #2. Углевод
    `;

    const questions = parseTestFromText(text);
    expect(questions[0].options[0]).toBe("Полимер аминокислот, связанных пептидными связями");
  });

  it("должен вернуть массив вопросов в соответствии с Markdown форматированием", () => {
    const questions = [
      { question: "Текст вопроса?", options: ["Да", "Нет"], correctIndex: 0 }
    ];
    
    const markdown = formatQuestionsAsMarkdown(questions);
    
    expect(markdown).toContain("@1. Да");
    expect(markdown).toContain("#2. Нет");
  });
});
