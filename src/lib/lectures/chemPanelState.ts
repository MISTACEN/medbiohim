/**
 * Открытая панель химического модуля должна переживать переходы между
 * лекциями: студент открыл её один раз и продолжает читать следующую тему,
 * не нажимая кнопку заново.
 *
 * Храним в sessionStorage, а не localStorage: это состояние текущего сеанса,
 * и в новой вкладке панель не должна открываться сама. Доступ к storage может
 * быть запрещён (приватный режим, политика браузера) — тогда просто не помним.
 */
const KEY = "mbh:chem-panel:open";

export function readChemPanelOpen(): boolean {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return false;
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeChemPanelOpen(open: boolean): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    if (open) window.sessionStorage.setItem(KEY, "1");
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage недоступен — состояние не запоминается, панель работает как раньше */
  }
}
