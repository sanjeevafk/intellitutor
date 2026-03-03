import "./globals.css";
import type { ReactNode } from "react";
import ThemeToggle from "./theme-toggle";

export const metadata = {
  title: "Tutor Intelligence Dashboard",
  description: "Tutor Intelligence Dashboard",
  icons: {
    icon: "/favicon.ico"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main>
          <ThemeToggle />
          {children}
        </main>
      </body>
    </html>
  );
}
