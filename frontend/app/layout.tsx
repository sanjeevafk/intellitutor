import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Tutor Intelligence Dashboard",
  description: "Tutor Intelligence Dashboard"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
