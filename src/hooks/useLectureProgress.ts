"use client";

import { useEffect, useState } from "react";
import { LECTURE_PROGRESS_EVENT, readLectureProgress, type LectureProgress } from "@/lib/lectureProgress";

/** Подписка на локальный прогресс мини-тестов: обновляется после ответа
 *  в любом блоке и при изменениях из соседней вкладки. */
export function useLectureProgress(): LectureProgress {
  const [progress, setProgress] = useState<LectureProgress>({});

  useEffect(() => {
    const sync = () => setProgress(readLectureProgress());
    sync();
    window.addEventListener(LECTURE_PROGRESS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LECTURE_PROGRESS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return progress;
}