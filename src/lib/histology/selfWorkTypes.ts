/** Типы для интерактивных блоков «Подготовка к самостоятельной» и «Режим экзамена».
 *
 *  Контент (вопросы, эталонные ответы, разбор ошибок) живёт в git рядом с кодом
 *  и подключается в лекцию фенсед-блоками ```selfwork / ```exam (см. LectureRenderer).
 *  Здесь только контракт: компоненты, проверка ответа и контент-модуль обязаны
 *  совпадать по этим типам.
 */

/** Один проверяемый пункт эталонного ответа. */
export type SelfWorkKeyPoint = {
  /** Стабильный id внутри вопроса — используется в отчёте и в прогрессе. */
  id: string;
  /** Формулировка пункта для студента: что именно должно быть в ответе. */
  label: string;
  /** Принимаемые варианты/фрагменты (словоформы, синонимы, числовые формы). */
  anyOf: string[];
  /** Вес пункта при подсчёте (по умолчанию 1). */
  weight?: number;
};

/** Результат проверки письменного ответа. */
export type SelfWorkCheckResult = {
  /** Все пункты эталона. */
  total: number;
  /** Заработанные баллы (с учётом weight). */
  score: number;
  /** Максимум баллов. */
  max: number;
  percent: number;
  /** Найденные пункты. */
  hits: SelfWorkKeyPoint[];
  /** Ненайденные пункты — по ним предлагается повторить. */
  misses: SelfWorkKeyPoint[];
  /** Зачёт по мягкому порогу (>= 70%): ответ в целом верный. */
  passed: boolean;
  /** Все пункты эталона найдены — «выполнено правильно» (для шкалы экзамена). */
  complete: boolean;
  /** Объяснения по каждому ненайденному пункту. */
  feedback: string[];
};

/** Открытый вопрос с эталоном на максимальную оценку. */
export type SelfWorkOpenQuestion = {
  /** Стабильный id, например "emb-oq-01". */
  id: string;
  /** Подтема для группировки в интерфейсе. */
  topic: string;
  /** Текст открытого вопроса (без вариантов ответа). */
  prompt: string;
  keyPoints: SelfWorkKeyPoint[];
  /** Образцовый ответ на «5» — показывается после проверки. */
  model: string;
  /** Разбор ошибок: что обычно путают и почему пункт не засчитан. */
  explanation?: string;
  /** Источник (сборник/методичка/лекция). */
  source?: string;
};

/** Задание экзаменационного режима (письменный ответ). */
export type SelfWorkExamTask = {
  id: string;
  prompt: string;
  /** Минимум «правильно выполненного» задания — база для оценки «3». */
  keyPoints: SelfWorkKeyPoint[];
  model: string;
  explanation?: string;
  /**
   * Углублённые пункты «максимально подробного» ответа. Для задания 3 они
   * открывают оценку «5» (шкала: 5 — максимально подробно ответить на
   * последний теоретический вопрос). Если не заданы — углублённый уровень
   * совпадает с базовым.
   */
  detailKeyPoints?: SelfWorkKeyPoint[];
  /** Образцовый развёрнутый ответ на «5». */
  detailModel?: string;
};

/** Задание 1 — осевые органы. Вариант отличается формулировкой/акцентом. */
export type SelfWorkExamVariant = {
  /** "v1"…"v4" — ровно 4 варианта по требованиям преподавателя. */
  id: string;
  title: string;
  /** Подпись/акцент варианта (что именно рисуем и подписываем). */
  focus: string;
  task1: SelfWorkExamTask;
  /** Задание 3 — развёрнутый теоретический вопрос по эмбриологии. */
  task3: SelfWorkExamTask;
};

/** Задание 2 — опознать электронограмму и подписать структуры. */
export type SelfWorkElectronogramTask = {
  /** "ec-sperm" | "ec-ovum". */
  id: string;
  imageUrl: string;
  caption: string;
  prompt: string;
  /** Нумерованные структуры ровно как на подписи к электронограмме. */
  labels: Array<{ n: number; label: string; anyOf: string[] }>;
  model: string;
  explanation?: string;
};

/** Памятка описания клетки (алгоритм cell_tissue_organ из histology_preparations). */
export type SelfWorkCellMemo = {
  title: string;
  steps: Array<{ title: string; hint: string }>;
  /** Образцы описания по памятке (для «4»). */
  samples: Array<{ id: string; title: string; text: string }>;
};

/** Шкала: 3 — все три задания; 4 — плюс описание клетки по памятке; 5 — плюс максимально подробный ответ. */
export type SelfWorkExamScale = {
  grade: 3 | 4 | 5;
  when: string;
  detail: string;
};

export type SelfWorkExam = {
  title: string;
  intro: string;
  variants: SelfWorkExamVariant[];
  electronograms: SelfWorkElectronogramTask[];
  scale: SelfWorkExamScale[];
  memo: SelfWorkCellMemo;
};

/** Полный контент темы «Подготовка к самостоятельной + режим экзамена». */
export type SelfWorkTopic = {
  /** Совпадает с id лекции в histology_lectures. */
  lectureId: string;
  title: string;
  /** Только открытые вопросы — без тестов с вариантами ответов. */
  openQuestions: SelfWorkOpenQuestion[];
  exam: SelfWorkExam;
};
