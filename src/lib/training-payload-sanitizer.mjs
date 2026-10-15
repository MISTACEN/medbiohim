const PRIVATE_ANSWER_KEYS = new Set([
  "explanation",
  "answer",
  "correct",
  "isCorrect",
  "is_correct",
  "correctAnswer",
  "correct_answer",
  "correctOption",
  "correct_option",
  "correctOptionId",
  "correct_option_id",
]);

/** Remove answer and review material recursively from an unanswered snapshot. */
export function safeTrainerQuestion(value) {
  if (Array.isArray(value)) return value.map(safeTrainerQuestion);
  if (!value || typeof value !== "object") return value;

  const safe = {};
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_ANSWER_KEYS.has(key)) continue;

    if (key === "preparation" && child && typeof child === "object" && !Array.isArray(child)) {
      const preparation = { ...child };
      delete preparation.name;
      delete preparation.organ;
      delete preparation.captions;
      safe[key] = safeTrainerQuestion(preparation);
      continue;
    }

    safe[key] = safeTrainerQuestion(child);
  }
  return safe;
}

/** Preserve review details only after a user has answered or skipped the item. */
export function protectTrainingPayload(payload, method, subpath) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return payload;

  if (method === "POST" && subpath === "trainings" && Array.isArray(data.questions)) {
    return { ...payload, data: { ...data, questions: data.questions.map(safeTrainerQuestion) } };
  }

  const segments = subpath.split("/");
  if (method !== "GET" || segments.length !== 2 || segments[0] !== "trainings" || !Array.isArray(data.answers)) {
    return payload;
  }

  return {
    ...payload,
    data: {
      ...data,
      answers: data.answers.map((answer) => {
        if (!answer || typeof answer !== "object" || answer.user_answer != null || Boolean(answer.is_skipped)) {
          return answer;
        }
        const safe = { ...answer };
        for (const key of ["options", "question_snapshot", "review_snapshot"]) {
          if (safe[key] !== undefined) safe[key] = safeTrainerQuestion(safe[key]);
        }
        return safe;
      }),
    },
  };
}
