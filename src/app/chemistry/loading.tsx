import { SkeletonCards } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка раздела химии</span>
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-64 w-full rounded-2xl" />
      <SkeletonCards count={3} />
    </div>
  );
}
