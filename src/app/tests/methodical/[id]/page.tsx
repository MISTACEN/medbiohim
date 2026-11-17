"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listTests } from "@/lib/api/tests";

const LEGACY_ID = "chemistry-alcohols-phenols-ethers";
const SOURCE_KEY = "manual:chemistry-alcohols-phenols-ethers:full-80";

export default function MethodicalTestRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const openCommonTest = async () => {
      if (id !== LEGACY_ID) {
        router.replace("/tests?view=chemistry");
        return;
      }

      const result = await listTests(undefined, undefined, "chemistry_organic_physical", 2, 3);
      if (!active) return;
      const test = result.ok
        ? result.data.items.find((item: any) => item.source_key === SOURCE_KEY)
        : null;

      router.replace(test
        ? `/tests/preparation/${test.id}?mode=prepare&count=80&subject=chemistry_organic_physical&return=${encodeURIComponent("/tests?view=chemistry")}`
        : "/tests?view=chemistry");
    };

    void openCommonTest();
    return () => { active = false; };
  }, [id, router]);

  return (
    <main className="mx-auto flex min-h-[40vh] w-full max-w-3xl items-center justify-center px-4 py-10 text-center">
      <p className="text-sm font-semibold text-slate-600">Открываем тест в общем тренажёре…</p>
    </main>
  );
}
