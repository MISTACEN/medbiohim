import { SkeletonCards } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка предмета</span>
      <div className="skeleton h-8 w-64" />
      <div className="card space-y-3">
        <div className="skeleton h-4 w-48" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-2/3" />
      </div>
      <SkeletonCards count={3} />
    </div>
  );
}
