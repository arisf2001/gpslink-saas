import { spawn } from "node:child_process";

// WhatsApp voice notes: speech-to-text and text-to-speech with OpenAI; ffmpeg makes the Ogg/Opus mono file WhatsApp plays as a voice note.

const key = () => {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY no configurada");
  return k;
};

export async function transcribe(audio: Buffer, mime = "audio/ogg"): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime.split(";")[0] }), "nota.ogg");
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", "es");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form, signal: AbortSignal.timeout(60_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI transcribe ${res.status}: ${data?.error?.message ?? "error"}`);
  return String(data.text ?? "").trim();
}

function toVoiceNote(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"]);
    const out: Buffer[] = [];
    let err = "";
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", (d: Buffer) => (err += d));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.slice(0, 200)}`))));
    ff.stdin.end(input);
  });
}

export async function speech(text: string): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "coral",
      input: text.slice(0, 1500),
      instructions: "Habla en español latinoamericano, tono amable y claro, ritmo natural.",
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`OpenAI speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return toVoiceNote(Buffer.from(await res.arrayBuffer()));
}

// Photo of a GPS label: the IMEI (or device ID) printed on it, read with OpenAI vision; null when none is legible.
export async function readImei(image: Buffer, mime = "image/jpeg"): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: [
        { type: "text", text: "This is a photo of a GPS tracker or its box/label. Reply only with the IMEI (15 digits) or, if there is no IMEI, the device ID number printed on it. Digits only. Reply NONE if no such number is legible." },
        { type: "image_url", image_url: { url: `data:${mime.split(";")[0]};base64,${image.toString("base64")}` } },
      ] }],
      max_tokens: 30,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI vision ${res.status}: ${data?.error?.message ?? "error"}`);
  const digits = String(data?.choices?.[0]?.message?.content ?? "").replace(/\D/g, "");
  return /^\d{10,17}$/.test(digits) ? digits : null;
}
