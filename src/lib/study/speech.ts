/**
 * Обёртка Web Speech API для устного ответа (roadmap 2.8).
 *
 * Chrome/Android/Edge поддерживают SpeechRecognition полностью; Safari —
 * ограниченно, Firefox — нет. Функция возвращает null, если API нет: вызывающий
 * код тогда показывает поле «напишите ответ» вместо микрофона.
 */

// SpeechRecognition отсутствует в стандартных типах — описываем минимум.
type MinimalRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => MinimalRecognition;

export type SpeechRecognitionState = {
  supported: boolean;
  listening: boolean;
  transcript: string;
  interim: string;
  error: string | null;
};

/**
 * Создать распознаватель с непрерывным набором текста. Финальные куски
 * дописываются в transcript, промежуточные возвращаются отдельно — их показываем
 * серым, чтобы студент видел, что микрофон слышит.
 */
export function createSpeechRecognition(options: {
  onTranscript: (final: string, interim: string) => void;
  onEnd?: () => void;
  onError?: (message: string | null) => void;
}): MinimalRecognition | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "ru-RU";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const chunk = String(result?.[0]?.transcript || "");
      if (result?.isFinal) finalText += chunk + " ";
      else interimText += chunk;
    }
    options.onTranscript(finalText.trim(), interimText.trim());
  };
  recognition.onerror = (event) => {
    // not-allowed — отказ в доступе к микрофону; no-speech — тишина, не ошибка.
    const code = event?.error || "";
    if (code === "not-allowed" || code === "service-not-allowed") {
      options.onError?.("Доступ к микрофону запрещён — разрешите его в настройках браузера или напишите ответ.");
    } else if (code !== "no-speech" && code !== "aborted") {
      options.onError?.(null);
    }
  };
  recognition.onend = () => options.onEnd?.();
  return recognition;
}

export function speechSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}
