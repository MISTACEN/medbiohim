import type { PreviewQuestion } from "@/lib/api/teacher";

export type Verdict = "correct" | "wrong" | "unresolved";

export function optionKey(option: PreviewQuestion["options"][number], index: number): string {
  if (typeof option !== "string" && option?.key != null && String(option.key).trim()) {
    return String(option.key);
  }
  return String.fromCharCode(65 + index);
}
export function optionLabel(option: PreviewQuestion["options"][number]): string {
  return typeof option === "string" ? option : String(option?.label ?? "");
}
