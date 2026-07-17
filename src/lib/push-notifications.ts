// FILE: src/lib/push-notifications.ts
// Handles the passenger-facing side of Web Push: asking for notification
// permission, subscribing this browser to push, and saving that subscription
// to Supabase so the send-trip-push edge function can find it later. This is
// what makes "driver progress" and "driver has arrived" notifications show
// up in the OS notification bar even while Matu isn't the open tab.
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

// Web Push wants the VAPID public key as a raw Uint8Array, but env vars can
// only carry strings — this is the standard base64url -> Uint8Array
// conversion every Web Push integration needs.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushNotificationsSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// Passenger-level "show notifications" preference, set from Account settings.
// Separate from the browser's own Notification.permission: the browser
// permission controls whether the OS is *allowed* to show anything at all,
// while this preference controls whether Matu *offers* to turn them on in the
// first place (e.g. the "Get notified when your matatu is close" banner).
// Defaults to on so existing behavior doesn't change until someone opts out.
const NOTIFICATIONS_PREF_KEY = "matu:notifications-enabled";

export function getNotificationsPreference(): boolean {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_PREF_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function setNotificationsPreference(enabled: boolean) {
  try {
    localStorage.setItem(NOTIFICATIONS_PREF_KEY, String(enabled));
  } catch {
    // localStorage unavailable — preference just won't persist across sessions.
  }
}

// Call this from a real user gesture (a button tap) — browsers block the
// permission prompt if it's triggered automatically on page load.
export async function enableTripPushNotifications(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!pushNotificationsSupported()) {
    return { ok: false, reason: "Push notifications aren't supported in this browser" };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted" };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });
    }
    const json = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "Subscription is missing required keys" };
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return { ok: false, reason: "Not signed in" };
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: u.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    console.error("[push-notifications] subscribe failed:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "Subscription failed" };
  }
}
