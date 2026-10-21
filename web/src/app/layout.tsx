import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: { default: "Hardwood Wire", template: "%s · Hardwood Wire" },
  description: "A personal NBA intelligence feed: news, highlights, injuries, scores and stats — without the social media noise.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0d0f12",
  width: "device-width",
  initialScale: 1,
};

// Applies the saved theme before first paint so light-theme users don't see a dark flash.
const themeScript = `try{var p=JSON.parse(localStorage.getItem("hw.prefs.v1")||"{}");if(p.theme==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Suspense>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
