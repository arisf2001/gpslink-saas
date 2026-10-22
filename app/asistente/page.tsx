import type { Metadata } from "next";
import { resolveUser } from "@/lib/ai/assistant";
import { resourceUrl } from "@/lib/mcp";
import { getSession } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { iaLogoutAction } from "./actions";
import { AssistantChat } from "./chat";
import { GoogleHomeGroups } from "./google-home-groups";
import { IaLogin } from "./login";
import { VoiceConnect } from "./voice-connect";

export const metadata: Metadata = { title: "Asistente IA | GPS Link" };

export default async function AsistentePage({ searchParams }: { searchParams: Promise<{ embed?: string; gh?: string }> }) {
  const sp = await searchParams;
  const embed = sp.embed === "1";
  const hash = await getSession("ia");
  const loggedIn = !!hash;
  const company = hash ? await resolveUser(hash).then((u) => u.company).catch(() => null) : null;
  return (
    <>
      {!embed && <SiteNav />}
      <div className={embed ? "ia-embed" : "wrap"}>
        {loggedIn ? (
          <>
            <AssistantChat />
            {/* Gemini personal accounts cannot add custom apps yet (checked 2026-10-22); set GEMINI_CONNECT=1 when Google opens it. */}
            <VoiceConnect geminiUrl={process.env.GEMINI_CONNECT === "1" ? resourceUrl(company?.subdomain ?? null) : null} alexaUrl={process.env.ALEXA_SKILL_URL || null} color={company?.brandColor || "#0F4C5C"} />
            <GoogleHomeGroups hash={hash} embed={embed} saved={sp.gh === "ok"} />
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
