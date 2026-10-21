import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPS Link | Plataforma de rastreo GPS con tu marca",
  description: "Vende rastreo satelital con tu propia marca. Paquetes anuales por equipo GPS y 3 meses gratis sin tarjeta.",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
