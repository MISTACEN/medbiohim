/**
 * Переход в PdfMentor по одноразовому коду.
 *
 * Код уходит POST-формой (OAuth form_post): он не попадает ни в query, ни в
 * Referer, ни в историю браузера. Адрес PdfMentor приходит из API (env), поэтому
 * в коде нет ни localhost, ни захардкоженного домена.
 */
import { API_URL, endpoints } from "@/lib/endpoints";

export type MentorConfig = {
  enabled: boolean;
  mentor_url: string | null;
  bridge_signed: boolean;
};

export type MentorSsoPayload = {
  code: string;
  intent: "login" | "link";
  form_action: string;
  mentor_url: string;
};

export type MentorSsoResult =
  | { ok: true; payload: MentorSsoPayload }
  | { ok: false; message: string };

/** Отправляем код формой: cookie PdfMentor ставятся уже на его домене. */
export function submitCodeToMentor(payload: MentorSsoPayload): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payload.form_action;
  form.style.display = "none";

  for (const [name, value] of [
    ["code", payload.code],
    ["intent", payload.intent],
  ] as const) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export async function fetchMentorConfig(): Promise<MentorConfig> {
  try {
    const res = await fetch(`${API_URL}${endpoints.mentor.config()}`);
    const data = await res.json();
    if (data?.ok) return data.data as MentorConfig;
  } catch {
    // Ниже — то же состояние, что и «не подключён»: без адреса движка.
  }
  return { enabled: false, mentor_url: null, bridge_signed: false };
}

export async function requestMentorSso(intent: "login" | "link"): Promise<MentorSsoResult> {
  try {
    const res = await fetch(`${API_URL}${endpoints.mentor.sso()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent }),
    });
    const data = await res.json();
    if (!data?.ok) {
      return { ok: false, message: data?.error?.message || "Не удалось получить доступ к PdfMentor" };
    }
    return { ok: true, payload: data.data as MentorSsoPayload };
  } catch {
    return { ok: false, message: "Ошибка соединения с PdfMentor" };
  }
}
