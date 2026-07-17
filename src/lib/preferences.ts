// FILE: src/lib/preferences.ts
// User-facing preference cookies for Matu — small settings that should:
//   1. survive across visits (unlike plain in-memory state), and
//   2. be visible instantly in every open tab (unlike localStorage, which
//      needs a "storage" event listener to sync across tabs).
// These are NOT auth or security-sensitive — just UI defaults.

import { getCookie, setCookie } from "@/lib/cookies";

export type AppLanguage = "en" | "sw" | "sheng";

const LANGUAGE_KEY = "matu_lang";
const LANGUAGE_DAYS = 365;

const VALID_LANGUAGES: AppLanguage[] = ["en", "sw", "sheng"];

/** Reads the saved language preference, defaulting to English if unset or invalid. */
export function getPreferredLanguage(): AppLanguage {
  const value = getCookie(LANGUAGE_KEY);
  return (VALID_LANGUAGES as string[]).includes(value ?? "") ? (value as AppLanguage) : "en";
}

export function setPreferredLanguage(lang: AppLanguage): void {
  setCookie(LANGUAGE_KEY, lang, { days: LANGUAGE_DAYS });
}
