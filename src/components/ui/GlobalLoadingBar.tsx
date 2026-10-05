"use client";

import { useEffect, useState } from "react";
import { LoadingBar } from "./LoadingBar";

export function GlobalLoadingBar() {
  const [pending, setPending] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      setPending((n) => {
        const next = n + 1;
        if (next === 1) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setVisible(true), 140);
        }
        return next;
      });
    };
    const end = () => {
      setPending((n) => Math.max(0, n - 1));
    };

    window.addEventListener("mbh:api-start", start);
    window.addEventListener("mbh:api-end", end);
    return () => {
      window.removeEventListener("mbh:api-start", start);
      window.removeEventListener("mbh:api-end", end);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (pending === 0) {
      const timer = setTimeout(() => setVisible(false), 120);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [pending]);

  return <LoadingBar active={visible} />;
}
