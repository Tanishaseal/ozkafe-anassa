import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/variables.css";
import "@/styles/base.css";
import "@/styles/components.css";
import "@/styles/kitchen.css";
import "@/styles/admin.css";
import "@/styles/qr.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OZKAFE — Anassa, Kolkata | Pure Veg Coffee Experience",
  description: "OZKAFE at Anassa, Kolkata (Beside JW Marriott) – Pure Veg Coffee Experience Centre. In-house roasted specialty coffee, artisan teas, cold brews, and delicious café bites.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
