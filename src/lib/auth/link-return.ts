/**
 * Возврат после OAuth-привязки Google.
 *
 * Supabase возвращает браузер на redirect_to, который должен быть в списке
 * разрешённых адресов проекта. Поэтому привязка идёт через уже настроенный
 * /auth/callback, а он решает, куда идти дальше и что честно сказать.
 */
export type LinkReturn = {
  kind: "linked" | "error" | "none";
  /** Куда перейти в приложении. */
  target: string;
  /** Что показать пользователю. */
  message: string;
};

export function resolveLinkReturn(search: string): LinkReturn {
  const params = new URLSearchParams(search);
  const error = params.get("error_description") || params.get("error") || "";
  if (error) {
    return {
      kind: "error",
      target: `/settings?error=${encodeURIComponent(error)}`,
      message: `Привязка Google не завершена: ${error}`,
    };
  }
  const linked = params.get("linked");
  if (linked === "google" || linked === "1") {
    return {
      kind: "linked",
      target: "/settings?linked=1",
      message: "Привязка завершена. Проверяем аккаунт…",
    };
  }
  return { kind: "none", target: "/", message: "" };
}
