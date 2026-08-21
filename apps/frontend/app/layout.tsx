// Fuentes self-hosted (fontsource, sin fetch a Google Fonts en build).
// Newsreader (serif editorial con italicas) para titulares; Hanken Grotesk para el cuerpo.
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource-variable/hanken-grotesk";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://citari.example"),
  title: {
    default: "Citari | Reservas multi tenant",
    template: "%s | Citari"
  },
  description: "Plataforma de reservas multi tenant para negocios de servicios.",
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "Citari",
    description: "Reservas multi tenant para negocios de servicios.",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
