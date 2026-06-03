import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const wellnessSans = Noto_Sans_SC({
  variable: "--font-wellness-sans",
  weight: "variable",
  preload: false
});

const wellnessSerif = Noto_Serif_SC({
  variable: "--font-wellness-serif",
  weight: "variable",
  preload: false
});

export const metadata: Metadata = {
  title: "Food Deficit",
  description: "Meal calorie analysis and daily deficit dashboard",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6efe8"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${wellnessSans.variable} ${wellnessSerif.variable}`}>{children}</body>
    </html>
  );
}
