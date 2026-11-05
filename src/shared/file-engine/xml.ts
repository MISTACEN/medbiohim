/**
 * Минимальный XML-разбор для Office-документов.
 *
 * DOMParser есть только в браузере, а разбор нужен и в тестах, и на сервере,
 * поэтому здесь небольшой линейный парсер: элементы, атрибуты, текст,
 * CDATA и комментарии. Полноценный XML (DTD, сущности схем) не нужен —
 * OOXML использует простой подмножество.
 */

export type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    try {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (body.startsWith("#")) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[body] ?? match;
    } catch {
      return match;
    }
  });
}

function findTagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function findNameEnd(body: string): number {
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === " " || char === "\t" || char === "\n" || char === "\r" || char === "/") return index;
  }
  return body.length;
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let index = 0;

  const pushText = (raw: string) => {
    if (!raw) return;
    const text = decodeXmlEntities(raw);
    if (text) stack[stack.length - 1].text += text;
  };

  while (index < source.length) {
    const lt = source.indexOf("<", index);
    if (lt === -1) {
      pushText(source.slice(index));
      break;
    }
    if (lt > index) pushText(source.slice(index, lt));

    const next = source[lt + 1];
    if (next === "!") {
      if (source.startsWith("<!--", lt)) {
        const end = source.indexOf("-->", lt + 4);
        index = end === -1 ? source.length : end + 3;
        continue;
      }
      if (source.startsWith("<![CDATA[", lt)) {
        const end = source.indexOf("]]>", lt + 9);
        const data = source.slice(lt + 9, end === -1 ? source.length : end);
        stack[stack.length - 1].text += data;
        index = end === -1 ? source.length : end + 3;
        continue;
      }
      const end = source.indexOf(">", lt);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (next === "?") {
      const end = source.indexOf("?>", lt + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    const gt = findTagEnd(source, lt + 1);
    if (gt === -1) {
      pushText(source.slice(lt));
      break;
    }
    const raw = source.slice(lt + 1, gt);
    index = gt + 1;

    if (raw.startsWith("/")) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameEnd = findNameEnd(body);
    const name = body.slice(0, nameEnd).trim();
    if (!name) continue;

    const node: XmlNode = {
      name,
      attrs: parseAttrs(body.slice(nameEnd)),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root;
}

/** Локальное имя без префикса пространства имён: `w:p` → `p`. */
export function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

export function isElement(node: XmlNode, name: string): boolean {
  return localName(node.name) === name;
}

export function findChild(node: XmlNode, name: string): XmlNode | null {
  return node.children.find((child) => isElement(child, name)) ?? null;
}

export function findChildren(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => isElement(child, name));
}

export function findDescendant(node: XmlNode, name: string): XmlNode | null {
  for (const child of node.children) {
    if (isElement(child, name)) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return null;
}

export function findDescendants(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (isElement(child, name)) out.push(child);
    findDescendants(child, name, out);
  }
  return out;
}

/** Атрибут по локальному имени: `w:val` находится и как `w:val`, и как `val`. */
export function getAttr(node: XmlNode, name: string): string | undefined {
  if (name in node.attrs) return node.attrs[name];
  for (const [key, value] of Object.entries(node.attrs)) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

export function textContent(node: XmlNode): string {
  let result = node.text;
  for (const child of node.children) result += textContent(child);
  return result;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
}
