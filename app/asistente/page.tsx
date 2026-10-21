import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { iaLogoutAction } from "./actions";
import { AssistantChat } from "./chat";
import { IaLogin } from "./login";

export const metadata: Metadata = { title: "Asistente IA | GPS Link" };

export default async function AsistentePage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const embed = (await searchParams).embed === "1";
  const loggedIn = !!(await getSession("ia"));
  return (
    <>
      {!embed && <SiteNav />}
      <div className={embed ? "ia-embed" : "wrap"}>
        {loggedIn ? (
          <>
            <AssistantChat />
            <form action={iaLogoutAction} style={{ textAlign: "center", margin: "8px 0" }}>
              <input type="hidden" name="embed" value={embed ? "1" : ""} />
              <button className="linkbtn">Salir del asistente</button>
            </form>
          </>
        ) : (
          <div className={embed ? "panel" : "panel narrow"}>
            <h1 style={{ fontSize: 22, marginBottom: 6 }}>Asistente IA</h1>
            <p className="hint" style={{ marginBottom: 14 }}>Pregúntale dónde están tus vehículos, su recorrido, o pídele apagar el motor con tu PIN.</p>
            <IaLogin embed={embed} />
          </div>
        )}
      </div>
    </>
  );
}
