"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { hasToken, presenceHeartbeat } from "@/lib/api";
import { GlobalLoadingBar } from "@/components/ui/GlobalLoadingBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Auth, theme and other client-only state use localStorage.
  // Keep the server HTML and the first client render identical to avoid React #418.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!hasToken()) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    // Heartbeat только в видимой вкладке: в живом логе он давал 16 % трафика
    // и продолжал биться ночью со свёрнутым окном (D33).
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void presenceHeartbeat();
    };
    beat();
    timer = setInterval(beat, 60_000);
    return () => { if (timer) clearInterval(timer); };
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }
  const bare = pathname === "/login" || pathname === "/register";

  if (bare) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalLoadingBar />
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full w-64">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main id="main" className="min-h-[calc(100vh-4rem)] px-3 pb-24 pt-3 sm:p-6 lg:p-8">
          {children}
        </main>
        {!mobileOpen && <MobileNav />}
      </div>
    </div>
  );
}
/* synced-2026-09-15 */
