"use client";

import { Suspense } from "react";
import { ClipboardCheck } from "lucide-react";

import { hasToken } from "@/lib/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { AttemptsHistory } from "@/components/tests-hub/catalog/AttemptsHistory";
import { ChemistryBank } from "@/components/tests-hub/catalog/ChemistryBank";
import { TestsViewNav } from "@/components/tests-hub/catalog/TestsViewNav";
import { useTestsCatalog } from "@/components/tests-hub/catalog/useTestsCatalog";
import TestsHub from "@/components/tests/TestsHub";
import { RecommendedTests } from "@/components/tests/RecommendedTests";

function TestsPageInner() {
  const page = useTestsCatalog();

  if (page.authLoading) {
    return (
      <div className="space-y-5">
        <SkeletonCard height={56} />
        <SkeletonCard />
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Войдите, чтобы проходить тесты"
        description="Банки вопросов, генератор вариантов и история попыток доступны после входа в аккаунт."
        action="Войти"
        actionHref="/login"
      />
    );
  }

  return (
    <div className="space-y-5">
      <TestsViewNav page={page} />

      {page.view === "tests" && <RecommendedTests />}
      {page.view === "tests" && <TestsHub highlightTestId={page.openTestId} />}

      {page.view === "chemistry" && <ChemistryBank page={page} />}

      {page.view === "history" && <AttemptsHistory page={page} />}
    </div>
  );
}

export default function TestsPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <TestsPageInner />
    </Suspense>
  );
}
