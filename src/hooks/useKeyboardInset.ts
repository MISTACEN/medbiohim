"use client";

import { useEffect, useState } from "react";

/**
 * Инсент клавиатуры на мобильных: разница между layout- и visual-viewport.
 *
 * iOS Safari не уменьшает layout viewport (и 100dvh) при открытии клавиатуры —
 * она просто накрывает нижнюю часть страницы. Элементы с полями ввода (чат,
 * формы) получают актуальный сдвиг через visualViewport и приподнимаются
 * паддингом, чтобы ввод не уезжал под клавиатуру.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;

    const update = () => {
      // Разница > 8px — считаем, что клавиатура открыта (меньшее — дрожание тулбара).
      const gap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(gap > 8 ? gap : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
