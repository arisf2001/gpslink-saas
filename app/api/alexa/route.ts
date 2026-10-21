import { assistantConfig, rateLimit, resolveUser, t, type Lang } from "@/lib/ai/assistant";
import { chat } from "@/lib/ai/engine";
import { SessionError } from "@/lib/ai/gps";
import { speak, verifyAlexaRequest } from "@/lib/alexa";
import { userFromAccessToken } from "@/lib/oauth";

// Alexa custom skill endpoint. The customer links the skill with their GPS Link user/password (OAuth),
// then asks things like "dónde está la jeepeta". Read-only: engine commands are not available by voice.

type AlexaBody = {
  session?: { attributes?: Record<string, unknown>; application?: { applicationId?: string } };
  context?: { System?: { user?: { accessToken?: string }; application?: { applicationId?: string } } };
  request?: { type?: string; timestamp?: string; locale?: string; intent?: { name?: string; slots?: Record<string, { value?: string }> } };
};

const ANSWER_MS = 6500;
const pending = new Map<string, Promise<string>>();

export async function POST(req: Request) {
  const raw = await req.text();
  let body: AlexaBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const skip = process.env.NODE_ENV !== "production" && process.env.ALEXA_SKIP_VERIFY === "1";
  const bad = skip ? null : await verifyAlexaRequest(req.headers, raw, body.request?.timestamp);
  if (bad) {
    console.warn("[alexa] rejected:", bad);
    return new Response(null, { status: 400 });
  }
  const appId = body.context?.System?.application?.applicationId ?? body.session?.application?.applicationId;
  if (process.env.ALEXA_SKILL_ID && appId !== process.env.ALEXA_SKILL_ID) return new Response(null, { status: 400 });

  const lang: Lang = body.request?.locale?.startsWith("en") ? "en" : "es";
  const type = body.request?.type;
  const intent = body.request?.intent?.name ?? "";
  if (type === "SessionEndedRequest") return Response.json({ version: "1.0", response: {} });
  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent") return Response.json(speak(t(lang, "Hasta luego.", "Goodbye."), { end: true }));

  const access = body.context?.System?.user?.accessToken;
  const linked = access ? await userFromAccessToken(access) : null;
  if (!linked) {
    return Response.json(speak(t(lang, "Para usar esta skill, conecta tu cuenta de rastreo en la app de Alexa. Te dejé una tarjeta allí.", "To use this skill, link your tracking account in the Alexa app. I left a card there."), { end: true, linkAccount: true }));
  }

  try {
    const user = await resolveUser(linked.hash);
    const config = await assistantConfig(user, lang);
    if (!config.enabled) return Response.json(speak(t(lang, `El asistente no está activo en tu cuenta de ${config.companyName}.`, `The assistant is not enabled on your ${config.companyName} account.`), { end: true }));
    const help = t(lang, "Puedes preguntarme, por ejemplo: dónde está mi carro, cuánta batería tiene la jeepeta, o cuánto recorrió el camión hoy.", "You can ask me, for example: where is my car, or how much did the truck drive today.");
    const hello = t(lang, `Hola, soy ${config.name}. ¿Qué quieres saber de tus vehículos?`, `Hi, I'm ${config.name}. What would you like to know about your vehicles?`);
    if (type === "LaunchRequest") return Response.json(speak(hello, { reprompt: help }));
    if (intent === "AMAZON.HelpIntent" || intent === "AMAZON.FallbackIntent") return Response.json(speak(help, { reprompt: help }));

    const question = (body.request?.intent?.slots?.pregunta?.value ?? body.request?.intent?.slots?.query?.value ?? "").trim().slice(0, 500);
    if (type !== "IntentRequest" || !question) return Response.json(speak(help, { reprompt: help }));
    if (rateLimit(`alexa:${user.userId}:${user.email}`, 12)) return Response.json(speak(t(lang, "Espera un momento y vuelve a preguntar.", "Please wait a moment and ask again.")));

    // Alexa waits ~8 s; if the answer takes longer, keep working and give it when the customer asks again.
    const key = `${user.userId}:${user.email}:${question.toLowerCase()}`;
    const conversationId = typeof body.session?.attributes?.conversationId === "string" ? body.session.attributes.conversationId : null;
    let job = pending.get(key);
    let newConversation: string | null = null;
    if (!job) {
      job = chat({ user, conversationId, message: question, lang, deviceId: null, channel: "alexa" }).then((r) => {
        newConversation = r.conversation_id;
        return r.reply;
      });
      pending.set(key, job);
      job.catch(() => {}).finally(() => setTimeout(() => pending.delete(key), 60_000));
    }
    const reply = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), ANSWER_MS))]);
    if (reply === null) {
      return Response.json(speak(t(lang, "Estoy buscando la información. Hazme la misma pregunta en unos segundos.", "I'm still looking. Ask me the same question again in a few seconds."), { reprompt: t(lang, "¿Quieres preguntar otra vez?", "Do you want to ask again?"), attributes: { conversationId } }));
    }
    pending.delete(key);
    return Response.json(speak(reply, { reprompt: t(lang, "¿Algo más?", "Anything else?"), attributes: { conversationId: newConversation ?? conversationId } }));
  } catch (e) {
    if (e instanceof SessionError) {
      return Response.json(speak(t(lang, "Tu sesión de rastreo venció. Vuelve a conectar tu cuenta en la app de Alexa.", "Your tracking session expired. Please relink your account in the Alexa app."), { end: true, linkAccount: true }));
    }
    console.error("[alexa]", e);
    return Response.json(speak(t(lang, "No pude conectar con la plataforma de rastreo. Intenta otra vez.", "I couldn't reach the tracking platform. Try again."), { end: true }));
  }
}
