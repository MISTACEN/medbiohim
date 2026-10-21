"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type BankQuestion,
  type PlanStage,
  type SituationalTask,
  type TestModule,
  type TheoryQuestion,
  type TopicId,
  testModules,
} from "./content";
import {
  DEFAULT_COLLOQUIUM_CONTENT,
  type ColloquiumContentSnapshot,
} from "./settings";

export type TestResult = { correct: boolean; at: number };

export type ExamAttempt = {
  id: string;
  date: number;
  score: number;
  total: number;
  seconds: number;
  modules: string[];
  byModule: Record<string, { correct: number; total: number }>;
};

export type ColloquiumProgress = {
  theory: Record<string, boolean>;
  tests: Record<string, TestResult>;
  tasks: Record<string, boolean>;
  exams: ExamAttempt[];
};

const STORAGE_KEY = "medbiohim:physiology-colloquium:v1";

function emptyProgress(): ColloquiumProgress {
  return { theory: {}, tests: {}, tasks: {}, exams: [] };
}

export function theoryKey(question: TheoryQuestion): string {
  return `t:${question.id}`;
}

export function testKey(question: BankQuestion): string {
  return `q:${question.module}:${question.number ?? question.id}`;
}

export function taskKey(task: SituationalTask): string {
  return `s:${task.id}`;
}

export function theoryForTopics(
  topicIds: TopicId[],
  content: ColloquiumContentSnapshot = DEFAULT_COLLOQUIUM_CONTENT,
): TheoryQuestion[] {
  return content.theory.filter((question) => topicIds.includes(question.topic));
}

export function tasksForTopics(
  topicIds: TopicId[],
  content: ColloquiumContentSnapshot = DEFAULT_COLLOQUIUM_CONTENT,
): SituationalTask[] {
  return content.tasks.filter((task) => topicIds.includes(task.topic));
}

export function testsForModules(
  moduleIds: string[],
  content: ColloquiumContentSnapshot = DEFAULT_COLLOQUIUM_CONTENT,
): BankQuestion[] {
  return content.tests.filter((question) => moduleIds.includes(question.module));
}

export type CoverageStats = {
  theoryDone: number;
  theoryTotal: number;
  testAttempted: number;
  testCorrect: number;
  testTotal: number;
  tasksDone: number;
  tasksTotal: number;
  done: number;
  total: number;
  percent: number;
  accuracy: number | null;
};

function coverage(
  theory: TheoryQuestion[],
  tests: BankQuestion[],
  tasks: SituationalTask[],
  progress: ColloquiumProgress,
): CoverageStats {
  const theoryDone = theory.filter((question) => progress.theory[theoryKey(question)]).length;
  const attempted = tests.filter((question) => progress.tests[testKey(question)]);
  const testCorrect = attempted.filter((question) => progress.tests[testKey(question)]?.correct).length;
  const tasksDone = tasks.filter((task) => progress.tasks[taskKey(task)]).length;
  const total = theory.length + tests.length + tasks.length;
  const done = theoryDone + attempted.length + tasksDone;
  const rawPercent = total ? (done / total) * 100 : 0;

  return {
    theoryDone,
    theoryTotal: theory.length,
    testAttempted: attempted.length,
    testCorrect,
    testTotal: tests.length,
    tasksDone,
    tasksTotal: tasks.length,
    done,
    total,
    percent: done === 0 ? 0 : done === total ? 100 : Math.min(99, Math.max(1, Math.round(rawPercent))),
    accuracy: attempted.length ? Math.round((testCorrect / attempted.length) * 100) : null,
  };
}

export function overallStats(
  progress: ColloquiumProgress,
  content: ColloquiumContentSnapshot = DEFAULT_COLLOQUIUM_CONTENT,
): CoverageStats {
  return coverage(content.theory, content.tests, content.tasks, progress);
}

export function stageStats(
  stage: PlanStage,
  progress: ColloquiumProgress,
  content: ColloquiumContentSnapshot = DEFAULT_COLLOQUIUM_CONTENT,
): CoverageStats {
  return coverage(
    theoryForTopics(stage.theoryTopics, content),
    testsForModules(stage.testModules, content),
    tasksForTopics(stage.taskTopics, content),
    progress,
  );
}

export function isStageComplete(
  stage: PlanStage,
  progress: ColloquiumProgress,
  content: ColloquiumContentSnapshot = DEFAULT_COLLOQUIUM_CONTENT,
): boolean {
  const stats = stageStats(stage, progress, content);
  return stats.total > 0 && stats.done === stats.total;
}

export type NextStep = {
  view: "theory" | "tests" | "tasks" | "exam";
  topic?: TopicId;
  module?: string;
  label: string;
  hint: string;
  stage?: PlanStage;
};

export function nextStep(
  progress: ColloquiumProgress,
  content: ColloquiumContentSnapshot = DEFAULT_COLLOQUIUM_CONTENT,
): NextStep {
  for (const stage of content.plan_stages) {
    const stats = stageStats(stage, progress, content);

    if (stats.theoryDone < stats.theoryTotal) {
      const topic = stage.theoryTopics.find((topicId) =>
        theoryForTopics([topicId], content).some((question) => !progress.theory[theoryKey(question)]),
      );
      return {
        view: "theory",
        topic,
        stage,
        label: `Продолжить: ${stage.title}`,
        hint: "Осталось разобрать теорию этого этапа.",
      };
    }

    if (stats.testAttempted < stats.testTotal) {
      const moduleIds = stage.testModules.filter(
        (moduleId) =>
          testsForModules([moduleId], content).some((question) => !progress.tests[testKey(question)]),
      );
      return {
        view: "tests",
        module: moduleIds[0],
        stage,
        label: `Продолжить: ${stage.title}`,
        hint: "Теория разобрана — переходи к тестам этапа.",
      };
    }

    if (stats.tasksDone < stats.tasksTotal) {
      return {
        view: "tasks",
        stage,
        label: `Продолжить: ${stage.title}`,
        hint: "Остались ситуационные задачи этапа.",
      };
    }
  }

  return {
    view: "exam",
    label: "Перейти к экзамену",
    hint: "Все этапы пройдены. Проверь себя в режиме экзамена.",
  };
}

export function useColloquiumProgress() {
  const [progress, setProgress] = useState<ColloquiumProgress>(emptyProgress);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ColloquiumProgress>;
        setProgress({
          theory: parsed.theory ?? {},
          tests: parsed.tests ?? {},
          tasks: parsed.tasks ?? {},
          exams: Array.isArray(parsed.exams) ? parsed.exams : [],
        });
      }
    } catch {
      // Broken storage must not block the study page.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Private mode or full storage: progress simply stays in memory.
    }
  }, [progress, ready]);

  const toggleTheory = useCallback((question: TheoryQuestion) => {
    setProgress((previous) => {
      const key = theoryKey(question);
      const theory = { ...previous.theory };
      if (theory[key]) delete theory[key];
      else theory[key] = true;
      return { ...previous, theory };
    });
  }, []);

  const markTest = useCallback((question: BankQuestion, correct: boolean) => {
    setProgress((previous) => {
      const key = testKey(question);
      const previousResult = previous.tests[key];
      if (previousResult?.correct && !correct) return previous;
      return {
        ...previous,
        tests: { ...previous.tests, [key]: { correct, at: Date.now() } },
      };
    });
  }, []);

  const toggleTask = useCallback((task: SituationalTask) => {
    setProgress((previous) => {
      const key = taskKey(task);
      const tasks = { ...previous.tasks };
      if (tasks[key]) delete tasks[key];
      else tasks[key] = true;
      return { ...previous, tasks };
    });
  }, []);

  const addExam = useCallback((attempt: ExamAttempt) => {
    setProgress((previous) => ({
      ...previous,
      exams: [attempt, ...previous.exams].slice(0, 20),
    }));
  }, []);

  const reset = useCallback(() => {
    setProgress(emptyProgress());
  }, []);

  const bestExam = useMemo(() => {
    if (!progress.exams.length) return null;
    return progress.exams.reduce((best, attempt) =>
      attempt.score / attempt.total > best.score / best.total ? attempt : best,
    );
  }, [progress.exams]);

  return {
    progress,
    ready,
    bestExam,
    toggleTheory,
    markTest,
    toggleTask,
    addExam,
    reset,
  };
}

export function moduleTitle(moduleId: string, modules: TestModule[] = testModules): string {
  return modules.find((module) => module.id === moduleId)?.title ?? moduleId;
}

export function moduleShortTitle(moduleId: string, modules: TestModule[] = testModules): string {
  return modules.find((module) => module.id === moduleId)?.shortTitle ?? moduleId;
}
