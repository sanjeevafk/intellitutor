import "./globals.css";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
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
          <SWRConfig
            value={{
              revalidateOnFocus: false,
              revalidateOnReconnect: false,
              revalidateIfStale: false,
              dedupingInterval: 10000,
              keepPreviousData: true
            }}
          >
            {children}
          </SWRConfig>
        </main>
      </body>
    </html>
  );
}
