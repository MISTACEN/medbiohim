/**
 * BRIDGE EXTENSION VERIFICATION — task-5.
 *
 * AUTHORSHIP / INDEPENDENCE DISCLOSURE: the Lead implemented task-4 (the Bridge
 * extension change) and also wrote this suite, because the teammate scheduled to
 * verify it (`fesmu-core`) failed before producing anything, as did `hub-ui` and
 * `verifier`. This is therefore *self*-verification: stronger than reading the
 * code, weaker than an independent author. Treat the results accordingly.
 *
 * What it actually does: it parses the REAL committed FESMU markup with a small
 * HTML parser + selector engine written here (no jsdom, no new dependency), and
 * executes the REAL `browser-extension/src/content/analyzer.js` inside that DOM.
 * So the assertions exercise the shipped analyzer, not a re-implementation.
 *
 * Run: node --test test/bridge-extension.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ANALYZER = new URL("../browser-extension/src/content/analyzer.js", import.meta.url);
const SOURCES = new URL("../browser-extension/src/content/sources.json", import.meta.url);
const FIXTURES = new URL("./fixtures/fesmu/", import.meta.url);
const NEW_URL = "https://www.fesmu.ru/press-center/news/";

/* ------------------------------------------------------------------ *
 * Tiny HTML parser + selector engine (only what the analyzer uses)
 * ------------------------------------------------------------------ */

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

const ENTITIES = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&laquo;": "«",
  "&raquo;": "»",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&minus;": "−",
};

function decodeEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&[a-z]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

function parseAttributes(raw) {
  const attributes = {};
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = re.exec(raw))) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[match[1].toLowerCase()] = decodeEntities(value);
  }
  return attributes;
}

function textNode(value, parent) {
  return {
    nodeType: 3,
    parentNode: parent,
    get textContent() {
      return value;
    },
  };
}

function element(tag, attributes, parent) {
  const node = {
    nodeType: 1,
    tag,
    attributes,
    childNodes: [],
    parentNode: parent,
    getAttribute(name) {
      const key = String(name).toLowerCase();
      return Object.prototype.hasOwnProperty.call(attributes, key) ? attributes[key] : null;
    },
    get textContent() {
      return collectText(node);
    },
    querySelector(selector) {
      return querySelectorAll(node, selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      return querySelectorAll(node, selector);
    },
    closest(selector) {
      for (let current = node; current && current.nodeType === 1; current = current.parentNode) {
        if (selector.split(",").some((part) => matches(current, part.trim()))) return current;
      }
      return null;
    },
    get nextElementSibling() {
      const siblings = parent ? parent.childNodes : [];
      const index = siblings.indexOf(node);
      for (let i = index + 1; i < siblings.length; i += 1) {
        if (siblings[i].nodeType === 1) return siblings[i];
      }
      return null;
    },
  };
  return node;
}

function collectText(node) {
  if (node.nodeType === 3) return node.textContent;
  return node.childNodes.map(collectText).join("");
}

function parseHtml(html) {
  const root = element("#document", {}, null);
  const stack = [root];
  // A raw `<` cannot occur inside an HTML attribute value (it is a parse error),
  // so excluding it keeps a truncated `class="` from swallowing the next tag —
  // which is exactly what the trimmed fixtures contain.
  const tokenRe = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"<>]*"|'[^'<>]*'|[^<>"'])*?)(\/?)>|([^<]+)/g;
  let match;
  while ((match = tokenRe.exec(html))) {
    const [token, closeTag, openTag, rawAttributes, selfClosing, textValue] = match;
    if (token.startsWith("<!--") || token.startsWith("<!")) continue;
    if (closeTag) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === closeTag.toLowerCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (openTag) {
      const node = element(openTag.toLowerCase(), parseAttributes(rawAttributes), stack[stack.length - 1]);
      stack[stack.length - 1].childNodes.push(node);
      if (!selfClosing && !VOID_TAGS.has(openTag.toLowerCase())) stack.push(node);
      continue;
    }
    if (textValue && textValue.trim()) {
      stack[stack.length - 1].childNodes.push(textNode(decodeEntities(textValue), stack[stack.length - 1]));
    }
  }
  return root;
}

function parseCompound(part) {
  const spec = { tag: null, id: null, classes: [], attributes: [] };
  const re = /\[([\w-]+)(?:([*^$~|]?)=(['"]?)([^'"\]]*)\3)?\]|([.#]?)([\w-]+)/g;
  let match;
  while ((match = re.exec(part))) {
    if (match[1]) {
      spec.attributes.push({ name: match[1].toLowerCase(), op: match[2] || null, value: match[4] ?? null });
      continue;
    }
    const prefix = match[5];
    const name = match[6];
    if (prefix === ".") spec.classes.push(name);
    else if (prefix === "#") spec.id = name;
    else spec.tag = name.toLowerCase();
  }
  return spec;
}

function matchesCompound(node, spec) {
  if (spec.tag && node.tag !== spec.tag) return false;
  if (spec.id && (node.attributes.id || "") !== spec.id) return false;
  const classList = (node.attributes.class || "").split(/\s+/).filter(Boolean);
  if (!spec.classes.every((name) => classList.includes(name))) return false;
  for (const { name, op, value } of spec.attributes) {
    const actual = node.attributes[name];
    if (actual === undefined) return false;
    if (op === null) continue;
    const expected = value ?? "";
    if (op === "*" && !actual.includes(expected)) return false;
    if (op === "^" && !actual.startsWith(expected)) return false;
    if (op === "$" && !actual.endsWith(expected)) return false;
    if (op === "=" && actual !== expected) return false;
  }
  return true;
}

function matches(node, complexSelector) {
  const parts = complexSelector.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  const last = parseCompound(parts[parts.length - 1]);
  if (!matchesCompound(node, last)) return false;
  let ancestor = node.parentNode;
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const spec = parseCompound(parts[i]);
    while (ancestor && ancestor.nodeType === 1 && !matchesCompound(ancestor, spec)) ancestor = ancestor.parentNode;
    if (!ancestor || ancestor.nodeType !== 1) return false;
    ancestor = ancestor.parentNode;
  }
  return true;
}

function querySelectorAll(root, selector) {
  const groups = selector.split(",").map((part) => part.trim()).filter(Boolean);
  const found = [];
  const seen = new Set();
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      if (groups.some((group) => matches(child, group)) && !seen.has(child)) {
        seen.add(child);
        found.push(child);
      }
      walk(child);
    }
  };
  walk(root);
  return found;
}

/* ------------------------------------------------------------------ *
 * Analyzer execution harness
 * ------------------------------------------------------------------ */

function runAnalyzer(html, { hostname = "www.fesmu.ru", title = "Новости" } = {}) {
  const href = `https://${hostname}/press-center/news/`;
  const document = parseHtml(html);
  document.title = title;
  const listeners = [];
  const chrome = {
    runtime: {
      onMessage: {
        addListener(fn) {
          listeners.push(fn);
        },
      },
    },
  };
  // The shipped analyzer imports its declarative source map; the browser gets
  // that through webpack. Here the module loader is substituted by the parsed
  // JSON from disk — the analyzer code itself stays exactly as shipped.
  const rawSource = readFileSync(ANALYZER, "utf8");
  const sourcesConfig = JSON.parse(readFileSync(SOURCES, "utf8"));
  const source = rawSource.replace(/^import sourcesConfig from "\.\/sources\.json";$/m, "");
  assert.notEqual(source, rawSource, "analyzer must import ./sources.json");
  const window = {
    location: { hostname, href },
    // Capture events are cross-world chatter: analysis must work without a page
    // listener registry, so both sides are inert in the harness.
    addEventListener() {},
    dispatchEvent() {},
  };
  // eslint-disable-next-line no-new-func
  new Function("window", "document", "chrome", "sourcesConfig", `${source}
`)(window, document, chrome, sourcesConfig);
  assert.equal(typeof listeners[0], "function", "analyzer must register a message listener");
  let response = null;
  listeners[0]({ action: "analyze_page" }, {}, (value) => {
    response = value;
  });
  assert.ok(response, "analyzer must answer analyze_page synchronously");
  return response;
}

const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");

function card({ title = "Тестовая карточка новости", date = "05.03.2026", anchorAttributes = "", href = "/press-center/news/for-students/testovaya-kartochka/" } = {}) {
  return `<section><div class="iblock-list-item-wrap h-100 d-flex w-100" area-label="${title}">
    <p class="t--1 c-text-secondary mb-2 d-inline-block mr-3"><i class="far fa-calendar-alt mr-2"></i> ${date}</p>
    <a class="sf-viewbox" href="${href}" ${anchorAttributes}></a>
  </div></section>`;
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test("Bridge: the public ДВГМУ site resolves to `fesmu`, ЕИОС stays `eios`", () => {
  const html = card();
  assert.equal(runAnalyzer(html, { hostname: "www.fesmu.ru" }).source, "fesmu");
  assert.equal(runAnalyzer(html, { hostname: "fesmu.ru" }).source, "fesmu");
  assert.equal(runAnalyzer(html, { hostname: "eios.fesmu.ru" }).source, "eios");
  assert.equal(runAnalyzer(html, { hostname: "lab.neofamily.ru" }).source, "neofamily");
  assert.equal(runAnalyzer(html, { hostname: "xn--80aafla1ahtef3a7eg.xn--p1ai" }).source, "sechenov");
  assert.equal(runAnalyzer(html, { hostname: "notfesmu.ru" }).source, "other");
  assert.equal(runAnalyzer(html, { hostname: "fesmu.ru.evil.com" }).source, "other");
  assert.equal(runAnalyzer(html, { hostname: "xn--80aafla1ahtef3a7eg.xn--p1ai.evil.com" }).source, "other");
});

test("Bridge: real FESMU cards with empty anchors yield their area-label titles", () => {
  const html = fixture("feeds-news.html");
  const expected = [...html.matchAll(/area-label="([^"]*)"/g)].map((m) => decodeEntities(m[1]).replace(/\s+/g, " ").trim());
  assert.equal(expected.length, 10, "the fixture must contain the 10 real cards");

  const result = runAnalyzer(html);
  assert.equal(result.source, "fesmu");
  assert.ok(result.items.length > 0, "at least one item must be found");

  const titles = result.items.map((item) => item.title);
  const matched = expected.filter((title) => titles.includes(title));
  assert.ok(matched.length >= 8, `most real card titles must be found (got ${matched.length}/10)`);
  for (const title of titles) {
    assert.ok(!title.includes("area-label"), `a raw attribute leaked as a title: ${title}`);
    assert.ok(!/[<>]/.test(title), `markup leaked as a title: ${title}`);
    assert.ok(title.length >= 6);
  }
  // The very first card of the news page must be present with its real title.
  assert.ok(titles.includes(expected[0]), `first card title missing: ${expected[0]}`);
  assert.ok(result.items.some((item) => /\/press-center\/news\//.test(item.url)), "news urls must be resolved absolutely");
  for (const item of result.items) assert.ok(/^https?:\/\//.test(item.url), `url must be absolute: ${item.url}`);
});

test("Bridge: published_at is a real calendar date, impossible dates are dropped", () => {
  const real = runAnalyzer(fixture("feeds-news.html"));
  const dated = real.items.filter((item) => item.published_at);
  assert.ok(dated.length > 0, "cards with a date must produce published_at");
  for (const item of dated) {
    assert.match(item.published_at, /^\d{4}-\d{2}-\d{2}$/);
    const [year, month, day] = item.published_at.split("-").map(Number);
    assert.ok(year >= 2000 && year <= 2100);
    assert.ok(month >= 1 && month <= 12);
    assert.ok(day >= 1 && day <= 31);
  }

  assert.equal(runAnalyzer(card({ date: "05.03.2026" })).items[0].published_at, "2026-03-05");
  assert.equal(runAnalyzer(card({ date: "29.02.2024" })).items[0].published_at, "2024-02-29");
  assert.equal(runAnalyzer(card({ date: "31.02.2026" })).items[0].published_at, null);
  assert.equal(runAnalyzer(card({ date: "29.02.2025" })).items[0].published_at, null);
  assert.equal(runAnalyzer(card({ date: "31.04.2026" })).items[0].published_at, null);
  assert.equal(runAnalyzer(card({ date: "нет даты" })).items[0].published_at, null);
});

test("Bridge: title fallback covers alt-only anchors, container headings and placeholders", () => {
  const viaAlt = runAnalyzer(card({ anchorAttributes: 'alt="Олимпиада по неонатологии"' }));
  assert.ok(viaAlt.items.some((item) => item.title === "Олимпиада по неонатологии"), "alt must be used");

  const viaDataTitle = runAnalyzer(card({ anchorAttributes: 'data-title="Заседание научного кружка"' }));
  assert.ok(viaDataTitle.items.some((item) => item.title === "Заседание научного кружка"), "data-title must be used");

  const viaHeading = runAnalyzer(`<section><h3>Расписание экзаменов</h3>
    <div class="iblock-list-item-wrap"><a href="/ucheba/raspisanie/ekz_1.pdf"></a></div></section>`);
  assert.ok(viaHeading.items.some((item) => item.title === "Расписание экзаменов"), "a container heading must be used");

  const placeholder = runAnalyzer(`<section><div class="iblock-list-item-wrap" area-label="heading">
    <a href="/press-center/news/for-students/x/" title="filename"></a></div>
    <div class="iblock-list-item-wrap" area-label="Читать далее"><a href="/press-center/news/for-students/y/" alt="link"></a></div></section>`);
  for (const item of placeholder.items) {
    assert.ok(!/^(heading|filename|link)$/i.test(item.title), `placeholder leaked: ${item.title}`);
  }
});

test("Bridge: analysis is local — no network, no logging, no credential access", () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  globalThis.fetch = (...args) => {
    calls.push(args);
    throw new Error("network use during analysis");
  };
  console.log = (...args) => calls.push(args);
  try {
    const result = runAnalyzer(fixture("feeds-news.html"));
    assert.ok(result.items.length > 0);
    assert.deepEqual(calls, [], "the analyzer must not fetch or log");
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
  const source = readFileSync(ANALYZER, "utf8");
  for (const forbidden of ["document.cookie", "localStorage", "chrome.storage", "Authorization", "fetch("]) {
    assert.ok(!source.includes(forbidden), `analyzer must not reference ${forbidden}`);
  }
});

test("Bridge: caps hold and a hostile page cannot exceed them", () => {
  const many = Array.from({ length: 120 }, (_v, index) =>
    card({ title: `Карточка номер ${index}`, href: `/press-center/news/for-students/kartochka-${index}/` }),
  ).join("");
  const result = runAnalyzer(`<main>${many}</main>`);
  assert.ok(result.items.length <= 50, `items must be capped at 50, got ${result.items.length}`);
  assert.ok(result.items.length > 0);
});
