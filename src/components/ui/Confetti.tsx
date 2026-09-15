"use client";

import { useEffect, useState } from "react";

const COLORS = ["#6366F1", "#8B5CF6", "#10B981", "#F59E0B", "#F43F5E", "#38BDF8"];

/** Accept both `active` and legacy `show` */
export function Confetti({
  active,
  show,
  duration = 2800,
}: {
  active?: boolean;
  show?: boolean;
  duration?: number;
}) {
  const on = active ?? show ?? false;
  const [pieces, setPieces] = useState<
    Array<{ id: number; left: number; delay: number; color: string; rot: number }>
  >([]);

  useEffect(() => {
    if (!on) {
      setPieces([]);
      return;
    }
    setPieces(
      Array.from({ length: 48 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * 360,
      }))
    );
    const t = setTimeout(() => setPieces([]), duration);
    return () => clearTimeout(t);
  }, [on, duration]);

  if (!pieces.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-0 h-2.5 w-2.5 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
