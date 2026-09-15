// FILE: src/lib/cookie-consent.ts
import { getCookie, setCookie } from "@/lib/cookies";
import { setMonitoringEnabled } from "@/lib/monitoring";

export type CookieCategory = "necessary" | "preferences" | "analytics" | "marketing";

export interface CookieConsent {
  necessary: true; // always on, not user-toggleable
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
}

const CONSENT_KEY = "matu_cookie_consent";
const CONSENT_DAYS = 180;

export const DEFAULT_CONSENT: CookieConsent = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export function getConsent(): CookieConsent | null {
  const raw = getCookie(CONSENT_KEY);
  if (!raw) return null;
  try {
    return { ...DEFAULT_CONSENT, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function saveConsent(consent: Omit<CookieConsent, "necessary">): void {
  const full: CookieConsent = { necessary: true, ...consent };
  setCookie(CONSENT_KEY, JSON.stringify(full), { days: CONSENT_DAYS });
  // Flip Sentry live immediately on a fresh "accept" — no reload needed,
  // and it stays off immediately on a "reject".
  setMonitoringEnabled(full.analytics);
}

export function resetConsent(): void {
  document.cookie = `${CONSENT_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export const ACCEPT_ALL: Omit<CookieConsent, "necessary"> = {
  preferences: true,
  analytics: true,
  marketing: true,
};

export const REJECT_NON_ESSENTIAL: Omit<CookieConsent, "necessary"> = {
  preferences: false,
  analytics: false,
  marketing: false,
};
