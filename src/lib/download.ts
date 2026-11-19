/**
 * Скачивание blob'а пользователю — канон вместо локальных копий в
 * features-api / api/teacher / chemistry/export / lectures/exportLecture.
 *
 * Revocation с запасом: часть браузеров (Safari) начинает читать blob
 * только после click(); немедленный revoke обрывал скачивание.
 */
export function downloadBlob(blob: Blob, filename: string, revokeDelayMs = 10_000): void {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);
}
