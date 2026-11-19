export type LoginMethod = "email" | "google" | "telegram";

export const METHODS: Array<{ id: LoginMethod; title: string; hint: string }> = [
  { id: "email", title: "Почта", hint: "Пароль или ссылка" },
  { id: "google", title: "Google", hint: "Один клик" },
  { id: "telegram", title: "Telegram", hint: "Через бота" },
];

export function mapLoginError(code: string, message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Неверный email или пароль. Если регистрировались через Google — войдите кнопкой Google.";
  }
  if (code === "EMAIL_NOT_CONFIRMED" || m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Email не подтверждён. Проверьте письмо или войдите через Google.";
  }
  if (code === "AUTH_NOT_CONFIGURED") {
    return "Вход временно недоступен: сервер авторизации не настроен.";
  }
  return message || "Ошибка входа";
}
