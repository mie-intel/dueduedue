import type { Metadata } from "next";
import { EB_Garamond, Jost } from "next/font/google";
import "./globals.css";
import NavBar from "../components/NavBar";
import Providers from "../components/providers";
import SwipeNav from "../components/SwipeNav";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
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
    <html
      lang="en"
      className={`${jost.variable} ${ebGaramond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg-page">
        <Providers>
          <SwipeNav>{children}</SwipeNav>
          <NavBar />
        </Providers>
      </body>
    </html>
  );
}
