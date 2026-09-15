"use client";

import { useEffect, useState } from "react";

export function Confetti({ show }: { show: boolean }) {
  const [pieces, setPieces] = useState<Array<{ id: number; left: number; delay: number; color: string }>>([]);

  useEffect(() => {
    if (!show) {
      setPieces([]);
      return;
    }
    const colors = ["#6366F1", "#8B5CF6", "#10B981", "#F59E0B", "#F43F5E"];
    setPieces(
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        color: colors[i % colors.length],
      }))
    );
    const t = setTimeout(() => setPieces([]), 2800);
    return () => clearTimeout(t);
  }, [show]);

  if (!pieces.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-0 h-2 w-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
