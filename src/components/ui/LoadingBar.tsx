export function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[200] h-1 overflow-hidden bg-indigo-100/70"
      role="progressbar"
      aria-label="Загрузка"
      aria-busy="true"
    >
      <div className="loading-bar-indicator h-full w-2/5 rounded-r-full bg-indigo-600" />
    </div>
  );
}
