import type { Metadata } from "next";
import "./globals.css";
import "./energy.css";

export const metadata: Metadata = {
  title: "Isı Yönetim | Kazan & Sayaç Takibi",
  description: "Apartman merkezi kazanı, sayaç, tüketim ve maliyet takip paneli.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
