// FILE: src/routes/_authenticated/help.tsx
// Full-page version of the same assistant that floats on every other page — same
// edge function, same context detection, just rendered inline instead of as a bubble
// so people who want to actually sit and ask things have room to do it.
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/matu/AppShell";
import { AIAssistant } from "@/components/matu/AIAssistant";

export const Route = createFileRoute("/_authenticated/help")({
  ssr: false,
  component: HelpPage,
});

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I book a ride?",
    a: "Go to Ride, search your route (or pick from the list), choose a pickup and drop-off stage, then confirm. You'll pay via M-Pesa or cash to the conductor depending on what the SACCO allows.",
  },
  {
    q: "What's in Account settings?",
    a: "Your profile details, a Show notifications toggle, your alert sound, any roles you hold (driver/SACCO admin), your M-Pesa payout details if you drive, and account deletion.",
  },
  {
    q: "How do I get notified when my matatu is close?",
    a: 'Book a seat, then on the trip tracking screen tap "Enable" on the notification banner. Make sure Show notifications is on in Account settings, and that your browser allows notifications for Matu.',
  },
  {
    q: "How do I become a driver?",
    a: "From your Drive dashboard, request to join a SACCO with your ID, license, phone number, and vehicle details (or say you don't have one and the SACCO can assign you a vehicle). The SACCO owner approves it.",
  },
  {
    q: "How do I register a SACCO?",
    a: "From account settings or the Fleet section, register a new SACCO. You'll manage its vehicles, routes, fares, and driver requests from there.",
  },
  {
    q: "How do I pay for a trip?",
    a: "Choose cash to the conductor, or pay the driver directly via their Pochi la Biashara, Send Money, or Buy Goods details shown when you book. Matu doesn't hold your money.",
  },
  {
    q: "How do I file a complaint?",
    a: "Use the Complaints page to report an issue with a trip, driver, or vehicle. A platform admin can review and act on it.",
  },
];

function HelpPage() {
  return (
    <AppShell title="Help" subtitle="Ask a question, or check common topics below.">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <AIAssistant context={{ page: "account" }} fullPage />

        <aside className="grid content-start gap-3">
          <h2 className="font-display text-sm font-semibold text-muted-foreground">
            Common questions
          </h2>
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="rounded-xl border border-border bg-surface p-3 text-sm [&_summary]:cursor-pointer [&_summary]:list-none"
            >
              <summary className="font-medium">{item.q}</summary>
              <p className="mt-2 text-xs text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </aside>
      </div>
    </AppShell>
  );
}
