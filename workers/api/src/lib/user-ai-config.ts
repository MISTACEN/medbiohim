// BYOM: пользовательская ИИ-модель. Конфиг хранится в user_ai_configs
// (RLS owner-only), API-ключ — AES-GCM-256 шифротекст с секретом воркера
// USER_KEY_ENCRYPTION_KEY: base64(iv || ciphertext). Ключ никогда не
// возвращается клиенту — наружу уходит только key_hint (последние 4 символа).

const ALGO = "AES-GCM";
const IV_BYTES = 12;

let cachedKey: CryptoKey | null = null;

async function encryptionKey(env: { USER_KEY_ENCRYPTION_KEY?: string }): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = String(env.USER_KEY_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("USER_KEY_ENCRYPTION_KEY is not configured");
  const bytes = Uint8Array.from(atob(raw), (ch) => ch.charCodeAt(0));
  cachedKey = await crypto.subtle.importKey("raw", bytes, ALGO, false, ["encrypt", "decrypt"]);
  return cachedKey;
}

export function encryptSecret(env: { USER_KEY_ENCRYPTION_KEY?: string }, plaintext: string): Promise<string> {
  return (async () => {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const cipher = await crypto.subtle.encrypt(
      { name: ALGO, iv },
      await encryptionKey(env),
      new TextEncoder().encode(String(plaintext)),
    );
    const merged = new Uint8Array(IV_BYTES + cipher.byteLength);
    merged.set(iv, 0);
    merged.set(new Uint8Array(cipher), IV_BYTES);
    return btoa(String.fromCharCode(...merged));
  })();
}

export async function decryptSecret(env: { USER_KEY_ENCRYPTION_KEY?: string }, stored: string): Promise<string> {
  const merged = Uint8Array.from(atob(String(stored || "")), (ch) => ch.charCodeAt(0));
  const iv = merged.slice(0, IV_BYTES);
  const cipher = merged.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, await encryptionKey(env), cipher);
  return new TextDecoder().decode(plain);
}

export type UserAiOverride = {
  id: "custom";
  provider: "openai_compatible" | "anthropic";
  key: string;
  base: string;
  model: string;
  preferOwn: boolean;
};

export type UserAiConfigRow = {
  provider: "openai_compatible" | "anthropic";
  base_url: string;
  model: string;
  api_key_encrypted: string;
  prefer_own: boolean;
};

/**
 * Загружает и расшифровывает конфиг пользователя. Возвращает override-кандидата
 * для getAiCompletionCandidates или null, если конфига нет / расшифровать не удалось.
 */
export async function loadUserAiOverride(
  env: { USER_KEY_ENCRYPTION_KEY?: string },
  supabase: any,
  userId: string,
): Promise<UserAiOverride | null> {
  try {
    const { data, error } = await supabase
      .from("user_ai_configs")
      .select("provider,base_url,model,api_key_encrypted,prefer_own")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as UserAiConfigRow;
    const key = await decryptSecret(env, row.api_key_encrypted);
    if (!key) return null;
    return {
      id: "custom",
      provider: row.provider === "anthropic" ? "anthropic" : "openai_compatible",
      key,
      base: String(row.base_url || "").replace(/\/$/, ""),
      model: String(row.model || ""),
      preferOwn: row.prefer_own === true,
    };
  } catch {
    // Расшифровка/чтение не должны ломать чат: просто работаем на платформенных провайдерах.
    return null;
  }
}

export async function loadUserAiConfigRaw(
  env: { USER_KEY_ENCRYPTION_KEY?: string },
  supabase: any,
  userId: string,
): Promise<{ preferOwn: boolean; hasConfig: boolean } | null> {
  try {
    const { data, error } = await supabase
      .from("user_ai_configs")
      .select("prefer_own")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return { preferOwn: data.prefer_own === true, hasConfig: true };
  } catch {
    return null;
  }
}

export function keyHint(plaintext: string): string {
  const trimmed = String(plaintext || "").trim();
  return trimmed.slice(-4);
}
