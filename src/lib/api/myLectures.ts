/** Авторские занятия: обычный пользователь работает только со своими лекциями. */
import { api } from "./client";
import { endpoints } from "../endpoints";

export async function listMyLectures(): Promise<any> {
  return api(endpoints.content.myLectures()) as any;
}

export async function createMyLecture(payload: Record<string, unknown>): Promise<any> {
  return api(endpoints.content.myLectures(), { method: "POST", body: JSON.stringify(payload) }) as any;
}

export async function updateMyLecture(id: string, payload: Record<string, unknown>): Promise<any> {
  return api(endpoints.content.myLecture(id), { method: "PATCH", body: JSON.stringify(payload) }) as any;
}

export async function publishMyLecture(id: string): Promise<any> {
  return api(endpoints.content.myLecturePublish(id), { method: "POST", body: "{}" }) as any;
}
