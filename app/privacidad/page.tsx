import type { Metadata } from "next";
import { BRAND } from "@/lib/config";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = { title: "Política de privacidad — GPS Link", description: "Cómo GPS Link usa tus datos, incluidos los asistentes de voz e IA (Alexa y Gemini)." };

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <div className="wrap">
        <div className="panel" style={{ maxWidth: 820, margin: "0 auto", lineHeight: 1.6 }}>
          <h1>Política de privacidad</h1>
          <p className="hint">Última actualización: 21 de octubre de 2026</p>
          <p>
            GPS Link ({"\u201c"}nosotros{"\u201d"}) ofrece rastreo GPS de vehículos directamente y a través de empresas de marca blanca. Esta política explica qué datos
            usamos y para qué, en la plataforma de rastreo, la app, el asistente de IA y las conexiones con Amazon Alexa y Google Gemini.
          </p>
          <h2>Datos que usamos</h2>
          <ul>
            <li><b>Cuenta:</b> correo, nombre, teléfono y contraseña (guardada cifrada).</li>
            <li><b>Vehículos y equipos GPS:</b> ubicación, dirección aproximada, velocidad, encendido, historial de recorridos, batería, señal, satélites y voltaje.</li>
            <li><b>Preguntas al asistente:</b> el texto de lo que preguntas y la respuesta, para darte el servicio y mejorar las respuestas.</li>
          </ul>
          <h2>Alexa y Gemini</h2>
          <ul>
            <li>Solo funcionan si tú conectas tu cuenta con tu usuario y contraseña de la plataforma de rastreo. Nunca le damos tu contraseña a Amazon ni a Google.</li>
            <li>Al conectarla, Alexa o Gemini pueden <b>consultar</b> tus vehículos: ubicación, estado del equipo e historial. <b>No pueden apagar ni encender motores</b> ni cambiar nada en tu cuenta.</li>
            <li>Lo que dices a Alexa o escribes a Gemini lo procesan Amazon o Google según sus propias políticas. Nosotros solo recibimos la pregunta y devolvemos los datos de tus vehículos.</li>
            <li>Para responder en Alexa usamos un proveedor de IA (OpenAI), al que enviamos tu pregunta y los datos necesarios de tus vehículos, sin tu contraseña.</li>
            <li>Puedes desconectarlo cuando quieras desde la app de Alexa o desde los ajustes de Gemini. Al desconectarlo dejamos de responder a esa conexión.</li>
          </ul>
          <h2>Con quién compartimos datos</h2>
          <p>
            Con la empresa de marca blanca que te da el servicio, con proveedores que necesitamos para funcionar (servidores, correo, mensajes, mapas, IA y pagos) y
            cuando la ley lo exija. No vendemos tus datos.
          </p>
          <h2>Cuánto tiempo los guardamos</h2>
          <p>Mientras tu cuenta esté activa y el tiempo que exija la ley. El historial de ubicaciones se guarda según la configuración de tu plataforma.</p>
          <h2>Tus derechos</h2>
          <p>
            Puedes pedir ver, corregir o borrar tus datos escribiendo a <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>. Los servicios no son para
            menores de 18 años.
          </p>
        </div>
      </div>
    </>
  );
}
