import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    from: () => ({ upsert: (...args: unknown[]) => upsertMock(...args) }),
  },
}));

const {
  pushNotificationsSupported,
  notificationPermission,
  getNotificationsPreference,
  setNotificationsPreference,
  enableTripPushNotifications,
} = await import("@/lib/push-notifications");

describe("notificationPermission", () => {
  it("reports 'unsupported' when the Notification API doesn't exist", () => {
    const original = (globalThis as { Notification?: unknown }).Notification;
    // @ts-expect-error - deliberately removing it for this test
    delete globalThis.Notification;
    expect(notificationPermission()).toBe("unsupported");
    (globalThis as { Notification?: unknown }).Notification = original;
  });
});

describe("getNotificationsPreference / setNotificationsPreference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to true when nothing has been set", () => {
    expect(getNotificationsPreference()).toBe(true);
  });

  it("persists false once explicitly turned off", () => {
    setNotificationsPreference(false);
    expect(getNotificationsPreference()).toBe(false);
  });

  it("round-trips true after being turned off then back on", () => {
    setNotificationsPreference(false);
    setNotificationsPreference(true);
    expect(getNotificationsPreference()).toBe(true);
  });
});

describe("enableTripPushNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails fast with a clear reason when the browser doesn't support push", () => {
    const original = (navigator as { serviceWorker?: unknown }).serviceWorker;
    // @ts-expect-error - simulate an unsupported browser
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;

    return enableTripPushNotifications().then((result) => {
      expect(result).toEqual({ ok: false, reason: expect.any(String) });
      (navigator as { serviceWorker?: unknown }).serviceWorker = original;
    });
  });

  it("fails with a clear reason when permission is denied", async () => {
    // @ts-expect-error - jsdom doesn't ship Notification/PushManager by
    // default; stub the minimum surface these tests need.
    globalThis.Notification = { requestPermission: vi.fn().mockResolvedValue("denied") };
    // @ts-expect-error - see above
    globalThis.PushManager = function () {};
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve({}) },
      configurable: true,
    });

    const result = await enableTripPushNotifications();
    expect(result).toEqual({ ok: false, reason: "Notification permission was not granted" });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
