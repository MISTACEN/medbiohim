import { SkeletonCards } from "@/components/ui/Skeleton";

/** Скелетон дашборда: навигация не показывает пустой кадр при переходах. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка раздела</span>
      <div className="hero-banner">
        <div className="skeleton h-6 w-56" />
        <div className="skeleton mt-3 h-3 w-80 max-w-full" />
      </div>
      <SkeletonCards count={3} />
      <div className="card space-y-3">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="skeleton h-3 w-4/6" />
      </div>
    </div>
  );
}
