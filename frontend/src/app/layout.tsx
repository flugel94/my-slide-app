import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// ★これを追加
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Slide Gen App",
  description: "Generate Google Slides with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        {/* ★Providersで囲む */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}