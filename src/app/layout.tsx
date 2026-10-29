import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./schedule-now.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthHashCatcher } from "@/components/auth/AuthHashCatcher";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

// F5: self-hosted Inter вместо блокирующего @import Google Fonts; кириллица
// обязательна — весь интерфейс русскоязычный.
const inter = Inter({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — образовательная платформа`,
    template: `%s — ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "MEDBIOHIM",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MEDBIOHIM",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon.svg"],
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — образовательная платформа`,
    description: DEFAULT_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="classic-light" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* F11: применить сохранённую тему до первой отрисовки — без вспышки светлой.
            Логика повторяет ThemeProvider: mb_app_theme → mb_theme=dark → classic-light. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("mb_app_theme");var allowed=["classic-light","classic-dark","midnight","aurora-glass","medical-glass","crystal-glass"];var theme=t&&allowed.indexOf(t)>=0?t:(localStorage.getItem("mb_theme")==="dark"?"classic-dark":"classic-light");document.documentElement.setAttribute("data-theme",theme);var dark=["classic-dark","midnight"];document.documentElement.classList.toggle("dark",dark.indexOf(theme)>=0);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <a href="#main" className="skip-link">Перейти к содержимому</a>
        <PwaRegister />
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
