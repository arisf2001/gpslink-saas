import { trackerUrl } from "@/lib/config";
import { SiteNav } from "../site-nav";
import { TrackLoginForm } from "./form";

export const metadata = { title: "Entrar a la plataforma · GPS Link" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ gl_error?: string }> }) {
  const { gl_error } = await searchParams;
  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ maxWidth: 420, padding: "50px 20px" }}>
        <TrackLoginForm initialError={gl_error ? (gl_error === "2" ? "Demasiados intentos. Espera un minuto." : "Correo o contraseña incorrectos.") : undefined} googleUrl={`${trackerUrl()}/google/login`} />
      </main>
    </>
  );
}
