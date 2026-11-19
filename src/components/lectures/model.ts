/** Список лекций: тип строки и общие хелперы. */

export type LectureRow = {
  id: string;
  title: string;
  subject?: string;
  subject_slug?: string;
  topic?: string;
  summary?: string;
  body_markdown?: string | null;
};

export type LectureListRow = { lesson: LectureRow; total: number; solved: number };
