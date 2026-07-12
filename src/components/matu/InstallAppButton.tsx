// FILE: src/components/matu/InstallAppButton.tsx
//
// "Install app" / "Add to Home Screen" button. Browsers differ a lot here:
//  - Chrome/Edge on Android & desktop: fire a `beforeinstallprompt` event we can
//    capture and trigger programmatically via `.prompt()` — but only once per
//    page load, and only if Chrome's own engagement heuristics are satisfied.
//    If that event fires before this component mounts (e.g. on a fast page
//    load) or doesn't fire at all yet, there's no programmatic prompt to show
//    — so we fall back to manual "how to add to home screen" instructions
//    instead of just hiding the button.
//  - iOS Safari: does NOT support `beforeinstallprompt` at all — there is no
//    programmatic install. The only way is Share sheet -> "Add to Home Screen",
//    so on iOS we always show instructions instead of a fake button that does
//    nothing.
//  - Already installed (running in standalone/display-mode): hide the button
//    entirely, there's nothing to install.
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

// Not in the default lib.dom types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for "launched from home screen"
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallAppButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showAndroidHelp, setShowAndroidHelp] = useState(false);
  const ios = isIos();
  const android = isAndroid();

  useEffect(() => {
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already running as an installed app — nothing to offer.
  if (installed) return null;

  async function handleClick() {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    // No captured prompt (Android but the event hasn't fired, or any other
    // mobile/desktop browser) — show manual browser-menu instructions instead
    // of silently doing nothing or disappearing.
    setShowAndroidHelp(true);
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={
          className ??
          "inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium transition hover:bg-secondary"
        }
      >
        <Download className="size-3.5" /> Download app
      </button>

      {showIosHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-display text-lg font-semibold">Add Matu to your Home Screen</h3>
              <button
                onClick={() => setShowIosHelp(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  1
                </span>
                <span>
                  Tap the <Share className="mb-0.5 inline size-4" /> Share button in Safari's
                  toolbar.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  2
                </span>
                <span>Scroll down and tap "Add to Home Screen".</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  3
                </span>
                <span>Tap "Add" — Matu will appear as an app icon on your Home Screen.</span>
              </li>
            </ol>
          </div>
        </div>
      )}

      {showAndroidHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setShowAndroidHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-display text-lg font-semibold">Add Matu to your Home Screen</h3>
              <button
                onClick={() => setShowAndroidHelp(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  1
                </span>
                <span>
                  Tap the <strong>⋮</strong> menu button in{" "}
                  {android ? "Chrome's" : "your browser's"} toolbar.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  2
                </span>
                <span>Tap "Add to Home screen" or "Install app".</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  3
                </span>
                <span>Confirm — Matu will appear as an app icon on your Home Screen.</span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
