// FILE: src/lib/cookies.ts
// Lightweight, typed browser-cookie helpers for Matu.
//
// Why cookies here (vs. localStorage, which the app already uses heavily)?
// - Cross-tab by default: a cookie set in one tab is instantly visible in another
//   without a storage event listener — useful for things like "preferred role
//   dashboard" when a driver has both the app and a booking link open.
// - Server-readable: if Matu ever adds an Edge Function or SSR route (e.g. a
//   public trip-share page rendered server-side), cookies are sent
//   automatically on every request. localStorage never leaves the browser.
// - Expiry control: cookies can be given a real expiry date, so short-lived
//   things (e.g. "just completed onboarding, don't show again for 90 days")
//   don't have to be manually cleaned up like localStorage keys do.
//
// What stays out of cookies:
// - Supabase auth tokens. The Supabase JS client manages its own session
//   storage (currently localStorage — see src/integrations/supabase/client.ts).
//   Moving that to cookies would require an SSR/Edge Function layer to read
//   the cookie server-side and is a separate, bigger decision — not done here.

export interface CookieOptions {
  /** Days until expiry. Omit for a session cookie (cleared when browser closes). */
  days?: number;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  /** Defaults to true on https origins (production/Vercel), false on http (local dev). */
  secure?: boolean;
}

function defaultSecure(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === "undefined") return;

  const { days, path = "/", sameSite = "Lax", secure = defaultSecure() } = options;

  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path}; SameSite=${sameSite}`;

  if (days !== undefined) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    cookie += `; expires=${expires.toUTCString()}`;
  }

  // SameSite=None requires Secure per spec; also default to Secure on https.
  if (secure || sameSite === "None") cookie += "; Secure";

  document.cookie = cookie;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const target = encodeURIComponent(name) + "=";
  const parts = document.cookie.split("; ");

  for (const part of parts) {
    if (part.startsWith(target)) {
      return decodeURIComponent(part.slice(target.length));
    }
  }
  return null;
}

export function deleteCookie(name: string, path = "/"): void {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(name)}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function hasCookie(name: string): boolean {
  return getCookie(name) !== null;
}
