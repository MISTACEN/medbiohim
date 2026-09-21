"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** Старая CMS-оболочка → единый Центр управления. */
export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/tools");
  }, [router]);

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8 text-center">
      <p className="text-sm text-slate-500">Переход в единый Центр управления…</p>
      <Link href="/admin/tools" className="btn-primary inline-flex">
        Открыть CMS
      </Link>
    </main>
  );
}
