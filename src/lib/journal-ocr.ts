/**
 * Ленивая загрузка tesseract.js с CDN: распознавание идёт в браузере,
 * снимок журнала не уходит на сервер. Скрипт грузится только по кнопке.
 */
const OCR_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

type TesseractGlobal = {
  createWorker: (lang: string, oem?: number, options?: Record<string, unknown>) => Promise<any>;
};

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

export function loadTesseract(): Promise<TesseractGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("OCR доступен только в браузере"));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OCR_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("OCR-движок не загрузился"));
      });
      existing.addEventListener("error", () => reject(new Error("Не удалось загрузить OCR-движок")));
      return;
    }
    const script = document.createElement("script");
    script.src = OCR_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error("OCR-движок не загрузился"));
    };
    script.onerror = () => reject(new Error("Не удалось загрузить OCR-движок. Проверьте соединение."));
    document.head.appendChild(script);
  });
}
