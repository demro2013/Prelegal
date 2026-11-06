import type { Metadata } from "next";
import {
  Big_Shoulders,
  Schibsted_Grotesk,
  Source_Serif_4,
} from "next/font/google";
import "./globals.css";

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
});

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create a Legal Agreement | Prelegal",
  description:
    "Chat with an AI assistant to draft a standard legal agreement, preview it as it fills in, and download it as a PDF.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bigShoulders.variable} ${schibsted.variable} ${sourceSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
