import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import NavBar from "../components/NavBar";
import Providers from "../components/providers";
import SwipeNav from "../components/SwipeNav";

const openSans = Open_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DuelPic",
  description:
    "Compete in picture-guessing duels and earn real rewards on Monad. Play free, pay to earn, or battle 1v1 in PvP ranked mode.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg-page">
        <Providers>
          <SwipeNav>{children}</SwipeNav>
          <NavBar />
        </Providers>
      </body>
    </html>
  );
}
