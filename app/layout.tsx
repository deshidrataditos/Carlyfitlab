import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#155d69' };

const siteMetadata: Metadata = {
  title: "Carlyfit Lab | Formulando tu mejor versión",
  description: "Planes de 90 días para entrenar en casa o gimnasio con video explicativo, acompañamiento personalizado, nutrición deportiva y postres Carlyfit Lab en La Barca, Jalisco.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export function generateMetadata(): Metadata {
  return {
    ...siteMetadata,
    ...(process.env.SITE_TESTING === "true"
      ? { robots: { index: false, follow: false, noarchive: true } }
      : {}),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX">
      <body className="antialiased">
        {process.env.SITE_TESTING === "true" && (
          <div className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-950">
            ENTORNO DE PRUEBA — No se realizan cobros reales
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
