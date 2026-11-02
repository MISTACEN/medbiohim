/** Личный банк вопросов: только свои вопросы, без модерации и публикации. */
import { api } from "./client";
import { endpoints } from "../endpoints";

export type MyBankQuestion = {
  id: string;
  text: string;
  kind: "single" | "multiple" | "open";
  options: string[];
  answer: string;
  explanation?: string;
  subject_slug?: string;
  topic?: string;
};

export async function listMyQuestions(): Promise<any> {
  return api(endpoints.content.myQuestions()) as any;
}

export async function createMyQuestion(payload: Record<string, unknown>): Promise<any> {
  return api(endpoints.content.myQuestions(), { method: "POST", body: JSON.stringify(payload) }) as any;
}

export async function updateMyQuestion(id: string, payload: Record<string, unknown>): Promise<any> {
  return api(endpoints.content.myQuestion(id), { method: "PATCH", body: JSON.stringify(payload) }) as any;
}

export async function deleteMyQuestion(id: string): Promise<any> {
  return api(endpoints.content.myQuestion(id), { method: "DELETE" }) as any;
}
