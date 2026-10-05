import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./schedule-now.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthHashCatcher } from "@/components/auth/AuthHashCatcher";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f9fafb",
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  title: "Медбиохим — образовательная платформа",
  description:
    "Платформа для студентов и преподавателей: расписание, задания, тесты, материалы",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="classic-light" suppressHydrationWarning>
      <body className="antialiased">

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
