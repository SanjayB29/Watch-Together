import type { Metadata } from "next";
import localFont from "next/font/local";
import { FluidBackground } from "@/components/FluidBackground";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "CineLink - Peer-to-Peer Cinema",
  description: "Synchronized peer-to-peer watch parties with zero upload required",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased relative min-h-screen selection:bg-primary selection:text-white`}
      >
        <FluidBackground />
        <div className="relative z-0 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
