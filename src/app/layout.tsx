import type { Metadata, Viewport } from "next";
import { Inter, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "에이텍모빌리티 자재관리",
  description: "에이텍모빌리티 자재관리 시스템",
  applicationName: "ATEC WMS",
  appleWebApp: {
    capable: true,
    title: "ATEC WMS",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#B32646",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${hankenGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
