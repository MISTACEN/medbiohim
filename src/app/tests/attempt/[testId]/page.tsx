"use client";

import { use } from "react";

import { AttemptRunner } from "@/components/test-prep/AttemptRunner";
import { useAttemptRunner } from "@/components/test-prep/useAttemptRunner";

export default function AttemptRunnerPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = use(params);
  const page = useAttemptRunner(testId);

  return <AttemptRunner page={page} />;
}
