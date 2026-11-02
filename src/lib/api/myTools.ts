/** Импорт документов: текст PDF разбирает Worker, OCR зовёт внешний шлюз. */
import { api } from "./client";
import { endpoints } from "../endpoints";

export async function extractPdfText(contentBase64: string): Promise<any> {
  return api(endpoints.content.myToolsExtractPdf(), {
    method: "POST",
    body: JSON.stringify({ content_base64: contentBase64 }),
  }) as any;
}

export async function ocrImage(payload: {
  image_base64: string;
  mime?: string;
  prompt?: string;
}): Promise<any> {
  return api(endpoints.content.myToolsOcr(), {
    method: "POST",
    body: JSON.stringify(payload),
  }) as any;
}
