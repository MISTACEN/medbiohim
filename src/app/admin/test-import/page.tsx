"use client";

import { TestImportReview } from "@/components/admin/tests-hub/TestImportReview";
import { TestImportUpload } from "@/components/admin/tests-hub/TestImportUpload";
import { useTestImport } from "@/components/admin/tests-hub/useTestImport";

export default function AdminTestImportPage() {
  const page = useTestImport();

  if (!page.parsedTest) {
    return <TestImportUpload page={page} />;
  }

  return <TestImportReview page={page} parsedTest={page.parsedTest} />;
}
