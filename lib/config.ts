export const TRIAL_DAYS = 90;
export const REMINDER_DAYS = [3, 2, 1] as const;
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
  supportWhatsApp: process.env.SUPPORT_WHATSAPP ?? "",
};
