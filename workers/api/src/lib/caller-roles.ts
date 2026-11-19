/**
 * Коды ролей пользователя. Нужен там, где нужен ответ «кто это», а не готовый
 * guard: labs смотрит, преподаватель это или админ, админка расписания решает,
 * можно ли трогать чужую когорту.
 */
export async function getCallerRoles(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", userId)
    .limit(25);

  if (error) throw error;

  const codes: string[] = [];
  for (const row of data || []) {
    const roleRows = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
    for (const role of roleRows) {
      const code = String(role?.code || "").toLowerCase().trim();
      if (code) codes.push(code);
    }
  }
  return [...new Set(codes)];
}
