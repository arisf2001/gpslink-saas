import { SiteNav } from "../site-nav";
import { TrackLoginForm } from "./form";

export const metadata = { title: "Entrar a la plataforma · GPS Link" };

export default function EntrarPage() {
  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ maxWidth: 420, padding: "50px 20px" }}>
        <TrackLoginForm />
      </main>
    </>
  );
}
