import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/matu/OfflineBanner";
import { initQueueSync } from "@/lib/offline-queue";
import { cacheSupabaseConfig } from "@/lib/offline-cache";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme";
import { initMonitoring, captureError } from "@/lib/monitoring";

// Runs once, immediately, before anything renders — not inside a component
// or useEffect — so errors thrown during initial render are still caught.
initMonitoring();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-display font-semibold">Stage not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This route hasn&rsquo;t been added yet. Catch the next matatu home.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  captureError(error, { route: "root-error-boundary" });
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-display font-semibold">Something went off-route</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We hit a pothole. Try again or head home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1f4a3a" },
      { title: "Matu: Smart matatu & bus rides across Kenya" },
      {
        name: "description",
        content:
          "Find matatus and buses on your route, see live arrivals, book a seat, and get alerts as your stage approaches.",
      },
      { property: "og:title", content: "Matu: Smart matatu & bus rides across Kenya" },
      {
        property: "og:description",
        content:
          "Find matatus and buses on your route, see live arrivals, book a seat, and get alerts as your stage approaches.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Matu: Smart matatu & bus rides across Kenya" },
      {
        name: "twitter:description",
        content:
          "Find matatus and buses on your route, see live arrivals, book a seat, and get alerts as your stage approaches.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/89f7705c-017f-440d-be35-128d96c0c385/id-preview-eaa5de05--f4c18098-ca98-49e9-bd12-5c36a3374c76.lovable.app-1782891678310.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/89f7705c-017f-440d-be35-128d96c0c385/id-preview-eaa5de05--f4c18098-ca98-49e9-bd12-5c36a3374c76.lovable.app-1782891678310.png",
      },
      // PWA / "Add to Home Screen" support
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Matu" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "icon", href: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta
          name="google-site-verification"
          content="ACb3I6z-tGggIBYWUW_D1LM8Y2qgoya-R0HjvuPjcqM"
        />
        {/* Applies a saved dark/pink preference to <html> before first paint —
            without this, every load would flash the light theme first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // A new sw.js has finished installing while an older one is still
        // controlling this tab. sw.js calls skipWaiting()+clients.claim(),
        // so it'll take control shortly regardless — but that alone never
        // reloads an already-open tab, which is what let stale JS keep
        // running silently after a deploy. Prompt instead of forcing a
        // reload, since someone could be mid-trip when this fires.
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              toast("A new version of Matu is available", {
                duration: Infinity,
                action: {
                  label: "Refresh",
                  onClick: () => window.location.reload(),
                },
              });
            }
          });
        });

        // Catches the update on tabs that were already open before this
        // effect ran (e.g. reg already has a waiting worker from an earlier
        // visit) and on periodic re-checks — browsers only check for a new
        // sw.js on navigation by default, so nudge it on regained focus too.
        const checkForUpdate = () => reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
      })
      .catch((err) => {
        console.error("Service worker registration failed:", err);
      });
  }, []);

  useEffect(() => initQueueSync(), []);

  // Keeps the service worker's copy of the auth token fresh, so it can make
  // its own authenticated Supabase calls during a Background Sync event —
  // including one that fires after this tab has been closed.
  useEffect(() => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    async function syncConfig() {
      const { data } = await supabase.auth.getSession();
      cacheSupabaseConfig({
        url: SUPABASE_URL as string,
        anonKey: SUPABASE_KEY as string,
        accessToken: data.session?.access_token ?? null,
      });
    }
    syncConfig();
    const { data: sub } = supabase.auth.onAuthStateChange(() => syncConfig());
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        <Outlet />
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
<button
  onClick={() => {
    throw new Error("Sentry test error");
  }}
>
  Test Sentry
</button>;
