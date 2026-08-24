import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unicorn Club",
  description: "A matchmaking platform: curated rosters, private client portals, scheduling and payments.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
