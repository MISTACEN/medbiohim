/** Билеты: тип банка вопросов. */

export type Bank = {
  id: string;
  title: string;
  subject: string;
  subject_slug?: string;
  count: number;
};
