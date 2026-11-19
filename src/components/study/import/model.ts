export const MAX_FILE_BYTES = 8 * 1024 * 1024;
// Аудио ограничено жёстче: тело идёт через Vercel-прокси (~4.5 МБ), Whisper на
// Groq принимает mp3/m4a/ogg/wav/webm — 4 МБ mp3 64 кбит/с ≈ 8 минут речи.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.txt,.md,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,.mp3,.m4a,.ogg,.wav,.webm";

export function isAudioFile(file: File): boolean {
  return /^audio\//.test(file.type) || /\.(mp3|m4a|ogg|wav|webm)$/i.test(file.name);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]+,/, ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
