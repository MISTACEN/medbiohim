/**
 * Загрузка статического контентного JSON из public/content.
 *
 * Канон для histologyContent / physiologyContent / portalContent /
 * subject-plan-static (раньше fetch no-cache копировался в каждом).
 * Кэширование поверх — ответственность вызывающего модуля: у каждого
 * своя политика (per-slug, per-url, без кэша).
 */
export async function fetchContentJson<T>(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(url, { cache: "no-cache", signal: options.signal });
  if (!response.ok) throw new Error(`Не удалось загрузить материал (${response.status})`);
  return (await response.json()) as T;
}
