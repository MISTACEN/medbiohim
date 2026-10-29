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

/**
 * Адрес возврата по умолчанию: туда, где пользователь нажимал «Привязать».
 * Раньше возврат шёл на корень сайта, и сообщение о привязке было негде показать.
 */
export function defaultLinkRedirect(appOrigin: string): string {
  return `${appOrigin.replace(/\/+$/, "")}/auth/callback?linked=google`;
}

/**
 * URL привязки идентичности GoTrue. Именно GET с query-параметрами —
 * supabase-js linkIdentity использует тот же контракт; POST с JSON отвечал 404.
 */
export function identityAuthorizeUrl(supabaseUrl: string, provider: string, redirectTo: string): URL {
  const url = new URL("/auth/v1/user/identities/authorize", supabaseUrl);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", redirectTo);
  url.searchParams.set("skip_http_redirect", "true");
  return url;
}
