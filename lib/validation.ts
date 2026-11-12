export function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

const RESERVED_SLUGS = new Set(["www", "track", "admin", "api", "app", "mail", "cuenta", "registro", "gpslink", "soporte"]);

export function slugError(slug: string): string | null {
  if (slug.length < 3) return "El código de empresa debe tener al menos 3 letras o números.";
  if (RESERVED_SLUGS.has(slug)) return "Ese código está reservado. Elige otro.";
  return null;
}

// Same rule GPSWOX enforces for passwords (settings('password') on track.gpslinkusa.com).
export function passwordError(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "La contraseña debe tener mayúsculas, minúsculas y números.";
  }
  return null;
}

export function emailError(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "Correo no válido.";
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}
