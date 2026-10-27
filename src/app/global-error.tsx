"use client";

import { useEffect } from "react";

/**
 * Последний рубеж: сбой в корневом layout. Заменяет собой весь документ,
 * поэтому содержит собственные <html> и <body> и инлайн-стили без Tailwind.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] критическая ошибка", error.digest || "", error.message);
  }, [error]);

  return (
    <html lang="ru" data-theme="classic-light">
      <body style={{ margin: 0, background: "#f9fafb", color: "#0f172a", fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "#ffffff",
              border: "1px solid rgba(15,23,42,0.08)",
              borderRadius: "20px",
              padding: "28px",
              textAlign: "center",
              boxShadow: "0 10px 35px rgba(15,23,42,0.08)",
            }}
          >
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Платформа не запустилась</h1>
            <p style={{ marginTop: "10px", fontSize: "14px", lineHeight: 1.6, color: "#64748b" }}>
              Обновите страницу. Если ошибка повторяется, сообщите код обращения в поддержку.
            </p>
            {error.digest ? (
              <p style={{ marginTop: "10px", fontSize: "12px", color: "#64748b" }}>
                Код обращения: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "20px",
                border: 0,
                borderRadius: "12px",
                padding: "11px 22px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#ffffff",
                background: "linear-gradient(135deg, #2563eb, #3b82f6)",
                cursor: "pointer",
              }}
            >
              Повторить
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
