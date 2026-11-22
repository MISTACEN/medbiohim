import { describe, expect, it } from "vitest";
import { mdToHtml } from "./../lectures/markdown";

const one = (md: string) => mdToHtml(md).replace(/\n/g, "|");

describe("mdToHtml — регрессии ответов ИИ", () => {
  it("делает заголовок из ### в строке с текстом", () => {
    const html = one("Вступление\n### Механизм влияния\nдальше текст");
    expect(html).toContain("<h3>Механизм влияния</h3>");
    expect(html).not.toContain("<p>Вступление <h3>");
  });

  it("не ломает теги формулами (было «3>Заголовок3>»)", () => {
    const html = one("### Механизм влияния альбумина на СОЭ");
    expect(html).not.toMatch(/<h<sub>3<\/sub>>/);
    expect(html).toContain("<h3>");
  });

  it("курсив одиночными звёздочками", () => {
    expect(one("*Однако правильный ответ — уменьшение*")).toContain("<em>");
  });

  it("не считает цены формулами", () => {
    expect(one("стоит $10 и $20")).toContain("$10 и $20");
    expect(one("стоит $10 и $20")).not.toContain("lec-math");
  });

  it("схлопывает повторённый абзац", () => {
    const html = one("Повтор. Повтор.\n\nПовтор. Повтор.");
    expect(html.match(/Повтор/g)?.length).toBe(2);
  });
});
