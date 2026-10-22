const APP_ORIGIN = "https://medbiohim.vercel.app";
const $ = (id) => document.getElementById(id);
let subjectWasManuallySelected = false;
let currentPageUrl = "";
let currentPageTitle = "";
let testTitleWasAutoFilled = false;
let bundle = {
  schema: "medbiohim.test-bundle.v1",
  source: {
    system: "test.fesmu.ru",
    url: "",
    test_title: "",
    collected_at: new Date().toISOString(),
  },
  questions: [],
};

const SUBJECT_RULES = [
  { value: "histology", label: "Гистология, цитология и эмбриология", words: ["гистолог", "цитолог", "эмбриолог", "эпител", "соединительн ткан", "кровь и лимфа", "препарат"] },
  { value: "biochemistry", label: "Биохимия", words: ["биохими", "фермент", "аминокислот", "метабол", "гликолиз", "липид", "белков"] },
  { value: "anatomy", label: "Анатомия", words: ["анатом", "мышц", "нерв", "артери", "веноз", "скелет", "орган человека"] },
  { value: "physiology", label: "Физиология", words: ["физиолог", "рефлекс", "сердечн выброс", "мембранный потенциал", "дыхательн объём"] },
  { value: "microbiology", label: "Микробиология", words: ["микробиолог", "бактери", "вирус", "гриб", "культивирован", "окраска грам"] },
  { value: "chemistry", label: "Химия", words: ["хими", "реакци", "молярн", "окислен", "восстановлен", "органическ соединен"] },
];

function clean(value) {
  return String(value || "").replace(/[\t\r ]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function setFeedback(message, error = false) {
  $("feedback").textContent = message;
  $("feedback").style.color = error ? "#b42318" : "#69758b";
}

function setBundleFeedback(message, error = false) {
  $("bundle-feedback").textContent = message;
  $("bundle-feedback").style.color = error ? "#b42318" : "#69758b";
}

function inferSubject(text) {
  const source = String(text || "").toLocaleLowerCase("ru");
  let best = null;
  for (const rule of SUBJECT_RULES) {
    const score = rule.words.reduce((total, word) => total + (source.includes(word) ? 1 : 0), 0);
    if (!best || score > best.score) best = { ...rule, score };
  }
  return best && best.score > 0 ? { value: best.value, label: best.label, score: best.score } : null;
}

function fnv1a(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function questionKey(text, options, url) {
  return `fesmu-test-q-${fnv1a(`${text}|${options.map((option) => option.label).join("|")}|${url}`)}`.slice(0, 180);
}

function currentTestTitle() {
  return clean($("test-title").value) || currentPageTitle || "Тест из оригинальной системы";
}

function sourceUrl() {
  return currentPageUrl || $("page-url").textContent || "";
}

function splitOptions() {
  return $("options").value
    .split("\n")
    .map((line) => clean(line).replace(/^[-•*]\s+/, ""))
    .filter(Boolean);
}

function parseCorrectIndexes(count) {
  const raw = clean($("correct-answers").value);
  if (!raw) return [];
  const indexes = [];
  for (const part of raw.split(/[,\s;]+/).filter(Boolean)) {
    const numeric = Number(part);
    if (!Number.isInteger(numeric)) continue;
    const zeroBased = numeric >= 1 && numeric <= count ? numeric - 1 : numeric;
    if (zeroBased >= 0 && zeroBased < count && !indexes.includes(zeroBased)) indexes.push(zeroBased);
  }
  return indexes;
}

function buildQuestionFromForm() {
  const text = clean($("question").value);
  if (!text) throw new Error("Сначала считайте или введите текст вопроса.");
  const type = $("question-type").value === "open" ? "open" : "mcq";
  const options = splitOptions();
  const correctIndexes = parseCorrectIndexes(options.length);
  const openAnswer = clean($("open-answer").value);

  if (type === "mcq") {
    if (options.length < 2) throw new Error("Для закрытого вопроса нужно минимум два варианта.");
    if (!correctIndexes.length) throw new Error("Укажите правильные номера, например 1 или 1,3.");
    if (correctIndexes.some((index) => index >= options.length)) throw new Error("Номер правильного ответа выходит за пределы списка.");
  } else if (!openAnswer) {
    throw new Error("Для открытого вопроса заполните эталонный ответ.");
  }

  const optionObjects = type === "mcq"
    ? options.map((label, index) => ({ label, correct: correctIndexes.includes(index) }))
    : [];
  const answer = type === "open"
    ? openAnswer
    : optionObjects.filter((option) => option.correct).map((option) => option.label).join(" | ");
  const key = questionKey(text, optionObjects, sourceUrl() || "test.fesmu.ru");

  return {
    question_key: key,
    text,
    type,
    options: optionObjects,
    answer,
    source: {
      system: "test.fesmu.ru",
      url: sourceUrl(),
      test_title: currentTestTitle(),
      collected_at: new Date().toISOString(),
      method: "user-marked-correct",
    },
  };
}

function renderBundle() {
  const list = $("bundle-list");
  list.replaceChildren();
  $("bundle-count").textContent = String(bundle.questions.length);
  const hasQuestions = bundle.questions.length > 0;
  $("download-bundle").disabled = !hasQuestions;
  $("open-import").disabled = !hasQuestions;
  if (!hasQuestions) {
    const empty = document.createElement("p");
    empty.className = "muted small";
    empty.textContent = "Набор пуст. Считайте вопрос, отметьте ответ и нажмите «Добавить в набор».";
    list.append(empty);
    return;
  }

  bundle.questions.forEach((question, index) => {
    const row = document.createElement("article");
    row.className = "bundle-item";
    const heading = document.createElement("div");
    heading.className = "bundle-item-heading";
    const number = document.createElement("span");
    number.className = "bundle-number";
    number.textContent = String(index + 1);
    const title = document.createElement("strong");
    title.textContent = question.text.length > 90 ? `${question.text.slice(0, 90)}…` : question.text;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.title = "Удалить вопрос";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      bundle.questions = bundle.questions.filter((item) => item.question_key !== question.question_key);
      renderBundle();
      setBundleFeedback("Вопрос удалён из набора.");
    });
    heading.append(number, title, remove);
    const meta = document.createElement("div");
    meta.className = "bundle-meta";
    const correctCount = question.options.filter((option) => option.correct).length;
    meta.textContent = question.type === "open"
      ? `Открытый · эталон: ${question.answer || "не указан"}`
      : `${correctCount} правильн. · ${question.options.length} вариантов`;
    row.append(heading, meta);
    list.append(row);
  });
}

function resetBundle() {
  bundle = {
    schema: "medbiohim.test-bundle.v1",
    source: {
      system: "test.fesmu.ru",
      url: "",
      test_title: "",
      collected_at: new Date().toISOString(),
    },
    questions: [],
  };
  renderBundle();
}

async function extractFromActiveTab() {
  $("page-status").textContent = "Чтение…";
  setFeedback("Проверяю несколько распространённых структур теста на открытой странице.");
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error("Откройте обычную веб-страницу с тестом.");
    currentPageUrl = tab.url;
    currentPageTitle = tab.title || "Страница без заголовка";
    $("page-title").textContent = currentPageTitle;
    $("page-url").textContent = new URL(tab.url).hostname;
    if (!$("test-title").value.trim() || testTitleWasAutoFilled) {
      $("test-title").value = currentPageTitle;
      testTitleWasAutoFilled = true;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const clean = (value) => String(value || "").replace(/[\t\r ]+/g, " ").replace(/\n{2,}/g, "\n").trim();
        const visible = (element) => {
          if (!(element instanceof Element)) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };
        const text = (element) => clean(element?.innerText || element?.textContent || element?.getAttribute?.("aria-label") || "");
        const unique = (items) => [...new Set(items.map(clean).filter(Boolean))];
        const questionSelectors = [
          '[data-question-text]',
          '[data-testid*="question" i]',
          '[class*="question-text" i]',
          '[class*="question-title" i]',
          '[class*="question-content" i]',
          '[class*="question" i] legend',
          'fieldset legend',
          '[role="heading"]',
          'h1',
          'h2',
          'h3',
          'legend',
        ];
        const questionNodes = questionSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]).filter(visible);
        const questionCandidates = unique(questionNodes.map(text).filter((item) => item.length >= 12 && item.length <= 1800));
        const optionSelectors = [
          'input[type="radio"]',
          'input[type="checkbox"]',
          '[role="radio"]',
          '[role="checkbox"]',
          'label',
          '[class*="answer-option" i]',
          '[class*="option" i]',
          '[data-testid*="option" i]',
        ];
        const optionNodes = [...new Set(optionSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]))].filter(visible);
        const options = unique(optionNodes.map((element) => {
          const aria = element.getAttribute("aria-label") || element.getAttribute("title");
          const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)).map(text).filter(Boolean).join(" ");
          const linked = element.labels ? [...element.labels].map(text).join(" ") : "";
          const parent = element.closest("label") || element.closest('[role="radio"],[role="checkbox"]') || element.parentElement;
          let candidate = clean(aria || labelled || linked || text(parent) || element.value);
          if (element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type) && candidate === clean(element.value) && parent) candidate = text(parent);
          return candidate;
        }).filter((item) => item.length > 1 && item.length <= 450)).slice(0, 20);
        const roots = [...new Set([...document.querySelectorAll('[role="radiogroup"],fieldset,[data-question-id],[class*="question" i],[class*="quiz-question" i],[class*="test-item" i],article,main,[role="main"]')])].filter(visible);
        const scored = roots.map((element) => {
          const rootText = text(element).slice(0, 7000);
          const controls = element.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"],label').length;
          const questionCount = element.querySelectorAll(questionSelectors.join(",")).length;
          const score = Math.min(rootText.length, 1600) / 100 + Math.min(controls, 10) * 2.5 + Math.min(questionCount, 3) * 2;
          return { element, text: rootText, score };
        }).filter((item) => item.text.length > 20).sort((a, b) => b.score - a.score);
        const root = scored[0]?.element || document.querySelector("main,[role=main]") || document.body;
        const rootText = text(root).slice(0, 6000);
        let question = questionCandidates.find((candidate) => root.contains(questionNodes.find((node) => text(node) === candidate))) || "";
        if (!question) {
          const lines = rootText.split(/\n+/).map(clean).filter((item) => item.length >= 12 && item.length <= 1800);
          question = lines.find((item) => /[?？]$/.test(item)) || lines.find((item) => /^(вопрос|question)\s*\d*/i.test(item)) || lines[0] || "";
        }
        let rootOptions = unique(optionNodes.filter((element) => root.contains(element)).map((element) => {
          const parent = element.closest("label") || element.closest('[role="radio"],[role="checkbox"]') || element.parentElement;
          return text(element.getAttribute("aria-label") ? element : parent);
        }).filter((item) => item.length > 1 && item.length <= 450));
        if (rootOptions.length < 2) rootOptions = options;
        const mathNodes = [...new Set([...root.querySelectorAll('math, .katex, .katex-mathml, .MathJax, mjx-container, [data-math], [aria-label*="equation" i], [class*="formula" i], [class*="equation" i], pre code')])].filter(visible).slice(0, 30);
        const mathNotes = unique(mathNodes.map((element) => {
          const annotation = element.querySelector("annotation[encoding*='tex' i]");
          const aria = element.getAttribute("aria-label") || element.getAttribute("data-math");
          return clean(aria || annotation?.textContent || element.innerText || element.textContent || "");
        }).filter((item) => item.length > 0 && item.length < 1200)).slice(0, 30);
        const imageNodes = [...new Set([...root.querySelectorAll("img,svg[aria-label],canvas,[role=img],figure")])].filter(visible).slice(0, 12);
        const imageNotes = unique(imageNodes.map((element) => {
          const caption = element.closest("figure")?.querySelector("figcaption");
          return [
            element.getAttribute("alt"),
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("aria-describedby")?.split(/\s+/).map((id) => document.getElementById(id)).map(text).filter(Boolean).join(" "),
            caption ? text(caption) : "",
          ].filter(Boolean).join(" — ");
        }).filter(Boolean)).slice(0, 12);
        const context = clean([document.title, rootText, questionCandidates.join(" "), imageNotes.join(" ")].join(" ")).slice(0, 5000);
        return {
          title: document.title,
          url: location.href,
          question: question.slice(0, 3000),
          options: rootOptions.slice(0, 20),
          imageNotes,
          imageCount: imageNodes.length,
          mathNotes,
          mathCount: mathNodes.length,
          context,
          strategies: { questionSelectors: questionCandidates.length, optionNodes: optionNodes.length, roots: roots.length },
        };
      },
    });

    const data = results?.[0]?.result || {};
    const question = String(data.question || "").trim();
    const options = Array.isArray(data.options) ? data.options.map(String) : [];
    $("question").value = question;
    $("options").value = options.join("\n");
    $("image-context").value = Array.isArray(data.imageNotes) ? data.imageNotes.join("\n") : "";
    $("image-status").textContent = `${data.imageCount || 0} визуальных элементов; содержимое пикселей не распознаётся.`;
    $("formula-context").value = Array.isArray(data.mathNotes) ? data.mathNotes.join("\n") : "";
    $("formula-status").textContent = `${data.mathCount || 0} элементов математической/формульной разметки; проверьте индексы, заряды и стрелки реакций.`;
    const subject = inferSubject(`${currentPageTitle} ${question} ${data.context || ""} ${$("image-context").value}`);
    if (!subjectWasManuallySelected) {
      if (subject) {
        $("subject").value = subject.value;
        $("subject-confidence").textContent = "Предположение";
      } else {
        $("subject").value = "";
        $("subject-confidence").textContent = "Выберите вручную";
      }
    }
    $("page-status").textContent = question ? "Считано" : "Нужна помощь";
    setFeedback(
      question
        ? `Распознано вариантов: ${options.length}. Проверьте текст, отметьте правильные номера и добавьте вопрос в набор.`
        : "Автоматически вопрос не найден. Страница может использовать нестандартный интерфейс, iframe или защищённый/недоступный контент. Попробуйте выделить текст и вставить его вручную.",
      !question
    );
  } catch (error) {
    $("page-status").textContent = "Нет доступа";
    setFeedback(
      error?.message || "Не удалось прочитать страницу. Если сайт блокирует доступ или страница браузера служебная, расширение не обходит это ограничение.",
      true
    );
  }
}

function bundleJson() {
  return JSON.stringify({
    ...bundle,
    source: {
      ...bundle.source,
      system: "test.fesmu.ru",
      url: sourceUrl(),
      test_title: currentTestTitle(),
      collected_at: new Date().toISOString(),
    },
  }, null, 2);
}

$("extract").addEventListener("click", extractFromActiveTab);
$("refresh").addEventListener("click", extractFromActiveTab);
$("subject").addEventListener("change", () => {
  subjectWasManuallySelected = Boolean($("subject").value);
  $("subject-confidence").textContent = subjectWasManuallySelected ? "Выбрано вручную" : "Не определён";
});
$("test-title").addEventListener("input", () => {
  testTitleWasAutoFilled = false;
});
$("question-type").addEventListener("change", () => {
  const isOpen = $("question-type").value === "open";
  $("correct-answers").disabled = isOpen;
  $("open-answer").disabled = !isOpen;
});
$("copy").addEventListener("click", async () => {
  const question = $("question").value.trim();
  if (!question) return setFeedback("Сначала считайте или введите вопрос.", true);
  const subject = $("subject").selectedOptions[0]?.textContent || "Не определён";
  const payload = `Предмет: ${subject}\nТест: ${currentTestTitle()}\nВопрос: ${question}\nВарианты:\n${$("options").value.trim()}\nФормулы/уравнения:\n${$("formula-context").value.trim()}\nИзображения/подписи:\n${$("image-context").value.trim()}`;
  try {
    await navigator.clipboard.writeText(payload);
    setFeedback("Вопрос и варианты скопированы. В базу они пока не записываются.");
  } catch {
    setFeedback("Не удалось скопировать автоматически. Выделите текст и скопируйте вручную.", true);
  }
});
$("add-question").addEventListener("click", () => {
  try {
    const question = buildQuestionFromForm();
    const existing = bundle.questions.findIndex((item) => item.question_key === question.question_key);
    if (existing >= 0) {
      bundle.questions[existing] = question;
      setBundleFeedback("Этот вопрос уже был в наборе — обновлён.");
    } else {
      bundle.questions.push(question);
      setBundleFeedback(`Вопрос добавлен. Всего в наборе: ${bundle.questions.length}.`);
    }
    bundle.source = {
      system: "test.fesmu.ru",
      url: sourceUrl(),
      test_title: currentTestTitle(),
      collected_at: new Date().toISOString(),
    };
    renderBundle();
  } catch (error) {
    setBundleFeedback(error?.message || "Не удалось добавить вопрос.", true);
  }
});
$("download-bundle").addEventListener("click", () => {
  if (!bundle.questions.length) return setBundleFeedback("Набор пуст.", true);
  const blob = new Blob([bundleJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeTitle = currentTestTitle().toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "test";
  anchor.href = url;
  anchor.download = `medbiohim-test-${safeTitle}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setBundleFeedback("JSON скачан. Загрузите его на странице «Вуз → Импорт тестов».");
});
$("open-import").addEventListener("click", async () => {
  if (!bundle.questions.length) return setBundleFeedback("Набор пуст.", true);
  try {
    await navigator.clipboard.writeText(bundleJson());
    setBundleFeedback("JSON скопирован. На странице импорта вставьте его в поле или скачайте файл.");
  } catch {
    setBundleFeedback("Открываю импорт. Если JSON не вставится, используйте кнопку «Скачать JSON».");
  }
  chrome.tabs.create({ url: new URL("/university/import", APP_ORIGIN).toString() });
});
$("open-search").addEventListener("click", () => {
  const question = $("question").value.trim();
  if (!question) return setFeedback("Сначала считайте или введите вопрос.", true);
  const url = new URL("/search", APP_ORIGIN);
  const imageContext = $("image-context").value.trim();
  const formulaQuery = $("formula-context").value.trim();
  const searchQuery = question.length >= 12 ? question : formulaQuery.length >= 4 ? formulaQuery : imageContext.length >= 4 ? imageContext : question;
  url.searchParams.set("q", searchQuery);
  if ($("subject").value && $("subject").value !== "other") url.searchParams.set("subject_slug", $("subject").value);
  chrome.tabs.create({ url: url.toString() });
  setFeedback("Открыта платформа с запросом. Подтверждение ответа пока не выполняется.");
});
document.querySelectorAll("[data-path]").forEach((button) => button.addEventListener("click", () => {
  const path = button.getAttribute("data-path") || "/";
  if (path.startsWith("/") && !path.startsWith("//")) chrome.tabs.create({ url: new URL(path, APP_ORIGIN).toString() });
}));

$("question-type").dispatchEvent(new Event("change"));
resetBundle();
extractFromActiveTab();
