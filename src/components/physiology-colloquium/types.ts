import type { TopicId } from "@/lib/physiology-colloquium/content";

export type ColloquiumView = "plan" | "theory" | "tests" | "tasks" | "exam";

export type NavigateOptions = {
  topic?: TopicId;
  module?: string;
  onlyErrors?: boolean;
};

export type Navigate = (view: ColloquiumView, options?: NavigateOptions) => void;
