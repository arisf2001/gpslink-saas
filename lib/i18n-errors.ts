import { getLang } from "./lang";

const EN: Record<string, string> = {
  "Demasiados intentos. Espera unos minutos.": "Too many attempts. Wait a few minutes.",
  "Demasiados intentos. Espera un minuto.": "Too many attempts. Wait a minute.",
  "Ese paquete no está disponible.": "That package is not available.",
  "Ya existe una cuenta con ese correo.": "An account with that email already exists.",
  "Ese código de empresa ya está en uso. Elige otro.": "That company code is already taken. Choose another one.",
  "No pudimos enviar el correo. Revisa que esté bien escrito o inténtalo más tarde.": "We couldn't send the email. Check that it's spelled correctly or try again later.",
  "Escribe el código de 6 números que te llegó al correo.": "Enter the 6-digit code we emailed you.",
  "El código venció o ya no es válido. Vuelve a llenar el formulario.": "The code expired or is no longer valid. Fill out the form again.",
  "Código incorrecto demasiadas veces. Vuelve a llenar el formulario.": "Wrong code too many times. Fill out the form again.",
  "Ocurrió un error. Vuelve a llenar el formulario.": "Something went wrong. Fill out the form again.",
  "Ocurrió un error. Inténtalo de nuevo.": "Something went wrong. Please try again.",
  "El código venció. Vuelve a llenar el formulario.": "The code expired. Fill out the form again.",
  "Ya te reenviamos el código varias veces. Revisa tu correo no deseado (spam).": "We already resent the code several times. Check your spam folder.",
  "No pudimos enviar el correo. Inténtalo más tarde.": "We couldn't send the email. Try again later.",
  "Te enviamos un código nuevo.": "We sent you a new code.",
  "Ese correo ya está registrado en la plataforma de rastreo. Usa otro correo o contáctanos.": "That email is already registered on the tracking platform. Use another email or contact us.",
  "No pudimos crear tu plataforma en este momento. Inténtalo de nuevo en unos minutos.": "We couldn't create your platform right now. Try again in a few minutes.",
  "Escribe tu correo y tu contraseña.": "Enter your email and password.",
  "Correo o contraseña incorrectos.": "Wrong email or password.",
  "No pudimos entrar ahora. Inténtalo otra vez.": "We couldn't sign you in right now. Try again.",
};

export function toEnglish(text: string): string {
  const left = /^Código incorrecto\. Te (?:queda 1 intento|quedan (\d+) intentos)\.$/.exec(text);
  if (left) return `Wrong code. ${left[1] ? `${left[1]} attempts` : "1 attempt"} left.`;
  return EN[text] ?? text;
}

// Server actions keep their Spanish messages; English visitors get them translated here.
export async function localize<T extends { error?: string; info?: string }>(state: T): Promise<T> {
  if ((await getLang()) !== "en") return state;
  return { ...state, ...(state.error ? { error: toEnglish(state.error) } : {}), ...(state.info ? { info: toEnglish(state.info) } : {}) };
}
