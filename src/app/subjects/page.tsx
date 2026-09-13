"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { subjects as mockSubjects } from "@/lib/mock-data";
import { listSubjects } from "@/lib/api";

type Item = {
  id: string;
  name: string;
  course_number?: number | null;
  semester?: number | null;
  control_type?: string | null;
};

export default function SubjectsPage() {
  const [items, setItems] = useState<Item[]>(
    mockSubjects.map((s) => ({
      id: String(s.id),
      name: s.name,
      course_number: s.course,
      semester: s.semester,
      control_type: s.controlType,
    }))
  );
  const [source, setSource] = useState<"mock" | "api">("mock");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listSubjects();
        if (cancelled) return;
        if (res.ok && Array.isArray(res.data.items) && res.data.items.length > 0) {
          setItems(res.data.items);
          setSource("api");
          setNote(null);
        } else if (!res.ok) {
          setNote(`API: ${res.error.message} — показаны mock-данные`);
        }
      } catch {
        if (!cancelled) setNote("API недоступен — показаны mock-данные");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Предметы</h1>
          <p className="text-sm text-slate-500 mt-1">
            Источник: {source === "api" ? "API" : "mock"}
            {note ? ` · ${note}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <Link
            key={s.id}
            href={`/subjects/${s.id}`}
            className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#2B4C7E]/40 hover:shadow transition"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[#2B4C7E]/10 p-2 text-[#2B4C7E]">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900 group-hover:text-[#2B4C7E]">{s.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {[
                    s.course_number != null ? `${s.course_number} курс` : null,
                    s.semester != null ? `${s.semester} сем.` : null,
                    s.control_type || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#2B4C7E]" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
