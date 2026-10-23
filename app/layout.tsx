import type { Metadata } from "next";
import "./globals.css";
import { brandForHost } from "@/lib/brand-host";
import { mediaUrl } from "@/lib/site-media";

const DEFAULT_METADATA: Metadata = {
  title: "GPS Link | Plataforma de rastreo GPS con tu marca",
  description: "Vende rastreo satelital con tu propia marca. Paquetes anuales por equipo GPS y 3 meses gratis sin tarjeta.",
  icons: { icon: "/icon.png" },
};

export async function generateMetadata(): Promise<Metadata> {
  const brand = await brandForHost();
  if (!brand) return DEFAULT_METADATA;
  return { title: brand.site.name || brand.company.name, description: brand.site.seoDescription || undefined, icons: { icon: mediaUrl(brand.site.favicon || brand.site.logo) || "/icon.png" } };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
