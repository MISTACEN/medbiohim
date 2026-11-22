/** Производные значения текущего вопроса: режим ввода, вердикт и счёт. */
import { displayOptionEntries } from "@/components/questions/optionOrder";
import {
  correctKeys,
  etalonDisplay,
  optionKey,
  selectedKeys,
  type QuestionOption,
} from "@/components/test-prep/answers";

export type Experience = "prepare" | "solve" | "exam" | "control";

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  exam: "Экзамен",
  control: "Контрольный",
  solve: "Самопроверка",
  prepare: "Тренировка",
};

export type QuestionView = {
  options: QuestionOption[];
  displayEntries: ReturnType<typeof displayOptionEntries>;
  serverGrading: any;
  isChecking: boolean;
  isCloze: boolean;
  clozeBlanks: number;
  isMatch: boolean;
  matchRights: string[];
  isOpen: boolean;
  correctKeysList: string[];
  correctOptionKeys: Set<string>;
  isMulti: boolean;
  selectedOptionKeys: string[];
  revealAnswers: boolean;
  partial: boolean;
  noKey: boolean;
  staleAnswer: boolean;
  correct: boolean;
  unresolved: boolean;
  hideNumbers: boolean;
  isLast: boolean;
  experienceLabel: string;
  reference: string;
};

export function questionView(args: {
  q: any;
  questions: unknown[];
  idx: number;
  answers: Record<string, string>;
  grading: Record<string, any>;
  checked: Record<string, boolean>;
  checking: Record<string, boolean>;
  experience: Experience;
}): QuestionView {
  const { q, questions, idx, answers, grading, checked, checking, experience } = args;
  const options: QuestionOption[] = Array.isArray(q.options) ? q.options : [];
  // Показ вариантов перемешан (детерминированно для вопроса); ключи — из
  // исходного порядка, поэтому сохранённые ответы и грейдинг не меняются.
  const displayEntries = displayOptionEntries(q, options, optionKey);
  const serverGrading = grading[q.id];
  // Ответ отправлен, но сервер ещё не сравнил его с эталоном: показываем
  // нейтральное «Проверяем…» вместо мгновенного «неверно».
  const isChecking = !!checking[q.id];
  // Пропуски: ответ «a|b|c» → по инпуту на каждый пропуск.
  const isCloze = q.type === "cloze" || q.type === "fill_blanks" || q.type === "fill-blanks";
  const clozeBlanks = isCloze
    ? String(q.answer || serverGrading?.answer_display || "").split("|").map((part) => part.trim()).filter(Boolean).length || 1
    : 0;
  // Соответствие: варианты — левые части, ответ — правые в том же порядке.
  const isMatch = q.type === "match" || q.type === "matching";
  const matchRights = isMatch
    ? [...new Set(
        String(q.answer || serverGrading?.answer_display || "")
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean),
      )]
    : [];
  // is_closed приходит с сервера; старые ответы API без него разбираем по типу.
  // Если закрытый вопрос остался без вариантов, даём текстовое поле, чтобы
  // вопрос вообще можно было ответить (и отправить на ручную проверку).
  const isOpen = (q.is_closed == null
    ? q.type === "open" ||
      q.type === "problem" ||
      q.type === "theory" ||
      q.type === "practical" ||
      options.length === 0
    : !q.is_closed || options.length === 0) && !isCloze && !isMatch;
  const correctKeysList = correctKeys(q, serverGrading);
  const correctOptionKeys = new Set(correctKeysList);
  const isMulti = !isOpen && (q.allow_multiple === true || q.requires_order === true || correctOptionKeys.size > 1);
  const selectedOptionKeys = selectedKeys(q, answers[q.id]);
  // Эталоны и цвета показываем только там, где это обещано режимом:
  // «Подготовка» — сразу, «Решение»/«Экзамен» — только после завершения.
  const revealAnswers = experience === "prepare";
  const scoreRaw = Number(serverGrading?.score);
  const partial =
    (Number.isFinite(scoreRaw) && scoreRaw > 0 && scoreRaw < 1) ||
    (revealAnswers &&
      isMulti &&
      selectedOptionKeys.length > 0 &&
      selectedOptionKeys.length < correctKeysList.length &&
      selectedOptionKeys.every((key) => correctOptionKeys.has(key)));
  // В банке бывает не задан ни один верный вариант (импортированный вопрос без
  // эталона): такой вопрос нельзя показывать как ошибку студента.
  // Но если сервер уже вынес вердикт, ключ был — он просто не отдаётся в
  // публичном ответе. Иначе после перезагрузки проверенный неверный ответ
  // выглядел как «эталон не заполнен, ошибкой не считается».
  const hasServerVerdict = serverGrading != null && serverGrading.is_correct != null;
  const noKey = q.is_closed !== false && correctKeysList.length === 0 && !hasServerVerdict;
  // Ответ из старой версии вопроса: его вариант больше не существует в банке
  // (мы чинили склеенные варианты), поэтому показывать вердикт нельзя.
  const staleAnswer = Boolean(checked[q.id]) && q.is_closed !== false && selectedOptionKeys.length === 0;
  const correct = serverGrading?.is_correct === true && !partial && !noKey;
  const unresolved = noKey || (serverGrading && serverGrading.is_correct == null);
  // Экзамен: ни вердиктов, ни номеров вопросов — всё только после сдачи.
  const hideNumbers = experience === "exam";

  return {
    options,
    displayEntries,
    serverGrading,
    isChecking,
    isCloze,
    clozeBlanks,
    isMatch,
    matchRights,
    isOpen,
    correctKeysList,
    correctOptionKeys,
    isMulti,
    selectedOptionKeys,
    revealAnswers,
    partial,
    noKey,
    staleAnswer,
    correct,
    unresolved,
    hideNumbers,
    isLast: idx === questions.length - 1,
    experienceLabel: EXPERIENCE_LABEL[experience],
    reference: etalonDisplay(q, serverGrading),
  };
}

/** Счёт по текущей сессии: верно / частично / ошибки + средний балл. */
export function scoreSummary(
  questions: { id: string }[],
  grading: Record<string, any>,
  checked: Record<string, boolean>,
) {
  const scoreOf = (item: { id: string }) => {
    const g = grading[item.id];
    if (!g) return null;
    const s = Number(g.score);
    if (Number.isFinite(s)) return Math.min(1, Math.max(0, s));
    return g.is_correct === true ? 1 : g.is_correct === false ? 0 : null;
  };
  const countedScores = questions.map(scoreOf).filter((v): v is number => v != null);
  const correctCount = countedScores.filter((v) => v === 1).length;
  const partialCount = countedScores.filter((v) => v > 0 && v < 1).length;
  const wrongCount = countedScores.filter((v) => v === 0).length;
  const averagePercent = countedScores.length
    ? Math.round((countedScores.reduce((sum, v) => sum + v, 0) / countedScores.length) * 100)
    : 0;
  return {
    answeredCount: Object.keys(checked).length,
    correctCount,
    partialCount,
    wrongCount,
    averagePercent,
    counted: countedScores.length,
  };
}
