import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#155d69' };

export const metadata: Metadata = {
  title: "Carlyfit Lab | Entrena, nutre y disfruta",
  description: "Entrenamiento de 90 días, asesoría en nutrición deportiva y postres Carlyfit Lab. Con Carla Judith Fernández Arzate, en línea y en La Barca, Jalisco.",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="es-MX">
      <body className="antialiased">{children}</body>
    </html>
  );
}
