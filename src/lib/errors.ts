/**
 * Единый словарь ошибок: код ответа API → понятный русский текст.
 *
 * Технические строки (`HTTP 500`, `not found`, `undefined`) не должны попадать
 * в интерфейс студента: их заменяет описание из этого словаря, а действие
 * («Повторить») даёт компонент `ErrorState`.
 */
const CODE_TEXT: Record<string, string> = {
  NETWORK: "Нет связи с сервером. Проверьте интернет и попробуйте снова.",
  BAD_RESPONSE: "Сервер вернул неожиданный ответ. Попробуйте ещё раз.",
  TIMEOUT: "Сервер отвечает слишком долго. Попробуйте ещё раз.",
  UNAUTHORIZED: "Нужно войти заново.",
  INVALID_REFRESH: "Сессия истекла. Войдите заново — открытая страница сохранится.",
  NO_REFRESH_TOKEN: "Сессия требует повторного входа.",
  REFRESH_FAILED: "Не удалось продлить сессию. Войдите заново.",
  FORBIDDEN: "Недостаточно прав для этого действия.",
  NOT_FOUND: "Запись не найдена: возможно, её удалили или перенесли.",
  VALIDATION: "Проверьте заполненные поля.",
  VALIDATION_ERROR: "Проверьте заполненные поля.",
  DB_UNAVAILABLE: "База данных временно недоступна. Попробуйте позже.",
  UPSTREAM: "Внешний сервис не ответил. Попробуйте позже.",
  AUTH_UPSTREAM: "Сервис входа временно недоступен. Попробуйте позже.",
  AUTH_ERROR: "Не удалось выполнить вход. Попробуйте ещё раз.",
  AUTH_NOT_CONFIGURED: "Вход временно недоступен: сервис авторизации не настроен.",
  SERVICE_ROLE_REQUIRED: "Действие недоступно: сервер работает в режиме только для чтения.",
  RATE_LIMITED: "Слишком много запросов. Подождите минуту и повторите.",
  RATE_LIMIT: "Слишком много запросов. Подождите минуту и повторите.",
  EMAIL_NOT_CONFIRMED: "Email не подтверждён. Проверьте письмо или войдите через Google.",
};

const STATUS_TEXT: Record<number, string> = {
  400: "Запрос отклонён сервером. Проверьте введённые данные.",
  401: "Нужно войти заново.",
  403: "Недостаточно прав для этого действия.",
  404: "Раздел или запись не найдены.",
  408: "Сервер отвечает слишком долго. Попробуйте ещё раз.",
  429: "Слишком много запросов. Подождите минуту и повторите.",
  500: "Внутренняя ошибка сервера. Попробуйте позже.",
  502: "Внешний сервис не ответил. Попробуйте позже.",
  503: "Сервис временно недоступен. Попробуйте позже.",
  504: "Сервер отвечает слишком долго. Попробуйте ещё раз.",
};

export const DEFAULT_ERROR_TEXT = "Не удалось выполнить запрос. Попробуйте ещё раз.";

/**
 * Текст, написанный для человека, всегда русский (весь студенческий интерфейс
 * русскоязычный). Поэтому строка без кириллицы считается машинной: так в UI не
 * проходят `not found`, `HTTP 500`, `undefined` и сырые коды.
 */
export function isTechnicalMessage(text: string): boolean {
  const value = String(text || "").trim();
  if (!value) return true;
  if (/[А-Яа-яЁё]/.test(value)) return false;
  return /[A-Za-z]/.test(value);
}

export function describeApiError(
  error?: { code?: string; message?: string } | null,
  status?: number
): string {
  const message = String(error?.message || "").trim();
  if (message && !isTechnicalMessage(message)) return message;
  const code = String(error?.code || "").trim().toUpperCase();
  if (code && CODE_TEXT[code]) return CODE_TEXT[code];
  if (status && STATUS_TEXT[status]) return STATUS_TEXT[status];
  return DEFAULT_ERROR_TEXT;
}

export function describeStatus(status: number): string {
  return STATUS_TEXT[status] || DEFAULT_ERROR_TEXT;
}
