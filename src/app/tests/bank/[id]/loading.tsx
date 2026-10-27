export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка банка заданий</span>
      <div className="skeleton h-8 w-72" />
      <div className="card space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
