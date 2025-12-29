import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "クイズ感謝祭2025",
  description: "リアルタイム4択クイズゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
