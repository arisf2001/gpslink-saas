export const TRIAL_DAYS = 90;
export const REMINDER_DAYS = [3, 2, 1] as const;
export const ADDON_DEVICES = 10;
export const RENEWAL_WINDOW_DAYS = 30;
// Once a company pays, access is controlled per device, so the reseller account itself stays open.
export const RESELLER_OPEN_DAYS = 3650;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function trackerUrl(): string {
  return (process.env.GPSWOX_URL ?? "https://track.gpslinkusa.com").replace(/\/$/, "");
}

export const BRAND = {
  name: "GPS Link",
  supportEmail: process.env.SUPPORT_EMAIL ?? "info@gpslinkusa.com",
  supportWhatsApp: process.env.SUPPORT_WHATSAPP || "13059272739",
};
