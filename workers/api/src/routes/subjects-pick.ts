/**
 * Выбор одной строки предмета из нескольких активных строк (курсы/семестры
 * одного слага). Вынесено отдельным модулем: правило должно быть одинаковым в
 * каталоге и в карточке предмета, и его можно проверить без Hono и БД.
 *
 * Раньше карточка на таком предмете отдавала 409 «не уникален» и страница не
 * открывалась, а каталог выбирал строку по своей логике — они расходились.
 */
export type SubjectRowLike = {
  total_hours?: unknown;
  specialty_slug?: unknown;
  created_at?: string | null;
  id?: string | null;
};

export function pickBestSubjectRow<T extends SubjectRowLike>(rows: T[]): T | undefined {
  const rank = (row: T): [number, number] => [
    Number(row.total_hours || 0),
    row.specialty_slug ? 1 : 0,
  ];
  return [...rows].sort((a, b) => {
    const [ah, as] = rank(a);
    const [bh, bs] = rank(b);
    if (bh !== ah) return bh - ah;
    if (bs !== as) return bs - as;
    const ac = String(a.created_at || "");
    const bc = String(b.created_at || "");
    if (ac !== bc) return ac < bc ? -1 : 1;
    return String(a.id || "").localeCompare(String(b.id || ""));
  })[0];
}
