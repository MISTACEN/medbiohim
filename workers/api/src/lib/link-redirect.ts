/**
 * Куда Supabase может вернуть браузер после привязки второго способа входа.
 * Разрешены только настроенные origin'ы приложения и любой localhost-порт
 * (локальная разработка: порт 3000 занят — dev-сервер поднимают на другом).
 */
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalDevOrigin(url: URL): boolean {
  return LOCAL_DEV_HOSTS.has(url.hostname);
}

/** null — адрес возврата недопустим; вызывающий отвечает 400. */
export function resolveLinkRedirect(
  raw: string,
  corsOrigins: string,
  appOrigin: string,
): string | null {
  let requested: URL;
  try {
    requested = new URL(raw);
  } catch {
    return null;
  }
  // Локально браузер открывается по http; всё остальное — только https.
  if (requested.protocol !== "https:" && !isLocalDevOrigin(requested)) return null;
  if (isLocalDevOrigin(requested)) return requested.toString();

  const configured = corsOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = configured.some((origin) => {
    try {
      return new URL(origin).origin === requested.origin;
    } catch {
      return false;
    }
  }) || requested.origin === new URL(appOrigin).origin;
  return allowed ? requested.toString() : null;
}
