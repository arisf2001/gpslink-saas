// Spanish email templates for a white label's clients. [placeholders] are filled by the tracking platform.
const LOGIN = (url: string) => `<p><a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Entrar a la plataforma</a></p><p style="color:#6b7280;font-size:13px">${url}</p>`;

export const TEMPLATE_LABELS: Record<string, string> = {
  event: "Alerta de un vehículo (eventos)",
  report: "Reporte programado",
  account_created: "Cuenta creada",
  registration: "Registro confirmado",
  account_password_changed: "Contraseña cambiada",
  reset_password: "Recuperar contraseña (enlace)",
  reset_password_code: "Recuperar contraseña (código)",
  email_verification: "Verificar correo",
  sharing_link: "Enlace para compartir ubicación",
  expiring_device: "Equipo por vencer",
  expired_device: "Equipo vencido",
  expiring_user: "Cuenta por vencer",
  expired_user: "Cuenta vencida",
  expiring_sim: "SIM por vencer",
  expired_sim: "SIM vencida",
  service_expiration: "Servicio por vencer",
  service_expired: "Servicio vencido",
};

export function spanishTemplates(brand: string, platformUrl: string): { name: string; title: string; note: string }[] {
  const url = platformUrl.replace(/\/$/, "");
  const t = (name: string, title: string, note: string) => ({ name, title, note });
  return [
    t("event", `${brand}: [event] - [device.name]`, `<h2 style="margin:0 0 12px">[event]</h2><p><b>Vehículo:</b> [device.name]<br><b>Hora:</b> [time]<br><b>Velocidad:</b> [speed]<br><b>Dirección:</b> [address]<br><b>Geocerca:</b> [geofence]</p><p><a href="[preview]">Ver en el mapa</a></p>`),
    t("report", `${brand}: reporte "[name]"`, `<p>Hola,</p><p>Te enviamos tu reporte <b>[name]</b> del periodo <b>[period]</b>. Lo encuentras adjunto.</p>${LOGIN(url)}`),
    t("account_created", `Tu cuenta de ${brand} está lista`, `<p>Hola,</p><p>Tu cuenta de rastreo de <b>${brand}</b> fue creada.</p><p><b>Correo:</b> [email]<br><b>Contraseña:</b> [password]</p>${LOGIN(url)}<p>Te recomendamos cambiar la contraseña al entrar.</p>`),
    t("registration", `Bienvenido a ${brand}`, `<p>Hola,</p><p>Gracias por registrarte en <b>${brand}</b>. Estos son tus datos para entrar:</p><p><b>Correo:</b> [email]<br><b>Contraseña:</b> [password]</p>${LOGIN(url)}`),
    t("account_password_changed", `${brand}: tu contraseña cambió`, `<p>Hola,</p><p>La contraseña de tu cuenta de <b>${brand}</b> fue cambiada.</p><p><b>Correo:</b> [email]<br><b>Contraseña:</b> [password]</p>${LOGIN(url)}<p>Si no fuiste tú, responde este correo.</p>`),
    t("reset_password", `${brand}: recupera tu contraseña`, `<p>Hola,</p><p>Recibimos una solicitud para cambiar la contraseña de tu cuenta. Entra a este enlace:</p><p><b>[url]</b></p><p>Si no lo pediste, ignora este correo.</p>`),
    t("reset_password_code", `${brand}: tu código para recuperar la contraseña`, `<p>Hola,</p><p>Tu código para cambiar la contraseña es:</p><p style="font-size:26px;font-weight:bold;letter-spacing:4px">[code]</p><p>Si no lo pediste, ignora este correo.</p>`),
    t("email_verification", `${brand}: confirma tu correo`, `<p>Hola,</p><p>Para confirmar tu correo, entra a este enlace:</p><p><b>[link]</b></p>`),
    t("sharing_link", `${brand}: te compartieron una ubicación`, `<p>Hola,</p><p>Te compartieron la ubicación en vivo de un vehículo:</p><p><b>[link]</b></p>`),
    t("expiring_device", `${brand}: el equipo [device.name] vence en [days] días`, `<p>Hola,</p><p>El servicio del equipo <b>[device.name]</b> vence en <b>[days] días</b>. Renuévalo para no perder el rastreo.</p>${LOGIN(url)}`),
    t("expired_device", `${brand}: el equipo [device.name] venció`, `<p>Hola,</p><p>El servicio del equipo <b>[device.name]</b> (IMEI [device.imei]) venció hace [days] días. Renuévalo para volver a verlo en el mapa.</p>${LOGIN(url)}`),
    t("expiring_user", `${brand}: tu cuenta vence en [days] días`, `<p>Hola,</p><p>Tu cuenta <b>[email]</b> vence en <b>[days] días</b>. Renuévala para seguir rastreando tus vehículos.</p>${LOGIN(url)}`),
    t("expired_user", `${brand}: tu cuenta venció`, `<p>Hola,</p><p>Tu cuenta <b>[email]</b> venció hace [days] días. Renuévala para volver a entrar.</p>${LOGIN(url)}`),
    t("expiring_sim", `${brand}: la SIM de [device.name] vence en [days] días`, `<p>Hola,</p><p>La SIM <b>[device.sim_number]</b> del equipo <b>[device.name]</b> vence en <b>[days] días</b>.</p>`),
    t("expired_sim", `${brand}: la SIM de [device.name] venció`, `<p>Hola,</p><p>La SIM <b>[device.sim_number]</b> del equipo <b>[device.name]</b> venció hace [days] días.</p>`),
    t("service_expiration", `${brand}: servicio por vencer en [device.name]`, `<p>Hola,</p><p>El servicio <b>[service.name]</b> del equipo <b>[device.name]</b> está por vencer. Falta: <b>[service.left]</b>.</p>`),
    t("service_expired", `${brand}: servicio vencido en [device.name]`, `<p>Hola,</p><p>El servicio <b>[service.name]</b> del equipo <b>[device.name]</b> venció.</p>`),
  ];
}
