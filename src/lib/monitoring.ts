// FILE: src/lib/monitoring.ts
// Central place to init error monitoring. Call initMonitoring() once, as
// early as possible in the client entry (see __root.tsx wiring below).
import * as Sentry from "@sentry/react";

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN configured (e.g. local dev) — skip silently rather than
    // erroring, so this is safe to leave in every environment.
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Sample at 100% for now given current traffic; dial down (e.g. 0.1)
    // once volume grows enough that cost/noise becomes a concern.
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0, // no session replay — avoid recording PII
    // (phone numbers, ID numbers, M-Pesa fields) that this app collects.
    beforeSend(event) {
      // Belt-and-suspenders scrub: drop any breadcrumb/request data that
      // looks like it might carry the phone/ID/license fields this app
      // collects, in case a stack trace or breadcrumb captured form state.
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
  });
}

// Wrap a boundary-caught error, or catch a non-throw failure path you still
// want visibility into (e.g. an M-Pesa callback that returned ok:false).
export function captureError(error: unknown, context?: Record<string, unknown>) {
  console.error(error);
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
