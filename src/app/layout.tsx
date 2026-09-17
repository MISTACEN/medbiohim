import type { Metadata } from "next";
import "./globals.css";
import "./schedule-now.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthHashCatcher } from "@/components/auth/AuthHashCatcher";

export const metadata: Metadata = {
  title: "Медбиохим — образовательная платформа",
  description:
    "Платформа для студентов и преподавателей: расписание, задания, тесты, материалы",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="classic-light" suppressHydrationWarning>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              try {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then((registrations) => {
                    registrations.forEach((registration) => registration.unregister());
                  }).catch(() => {});
                }
                if ('caches' in window) {
                  caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {});
                }
              } catch (_) {}
            })();`,
          }}
        />
        <ThemeProvider>
          <AuthProvider>
            <AuthHashCatcher />
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
