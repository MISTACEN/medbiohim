/**
 * Constant-time string comparison. Длина не секрет, содержимое — секрет:
 * сравнение не должно выходить раньше времени, иначе тайминговая атака
 * раскрывает ожидаемое значение (секрет вебхука, подпись initData).
 */
export function constantTimeEqual(actual: string, expected: string): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * HMAC-SHA256 через WebCrypto. Разрешается через globalThis, чтобы модуль не
 * зависел от DOM-типизаций воркера. Ошибка или отсутствие subtle → null
 * (вызывающий код обязан трактовать это как «подпись недоступна»).
 */
export async function hmacSha256(keyBytes: Uint8Array, message: string): Promise<Uint8Array | null> {
  const encoder = new TextEncoder();
  const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return null;
  try {
    const key = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await subtle.sign("HMAC", key, encoder.encode(message));
    return new Uint8Array(signature);
  } catch {
    return null;
  }
}
