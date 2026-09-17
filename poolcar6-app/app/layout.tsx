import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pool Car Dispatch",
  description: "Pool car request and allocation system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body min-h-screen">{children}</body>
    </html>
  );
}
