import { SkeletonCards } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка раздела администрирования</span>
      <div className="skeleton h-8 w-48" />
      <SkeletonCards count={4} />
      <div className="card space-y-3">
        <div className="skeleton h-4 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-3 w-full" />
        ))}
      </div>
    </div>
  );
}
