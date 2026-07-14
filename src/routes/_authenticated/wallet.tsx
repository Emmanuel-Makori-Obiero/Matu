// FILE: src/routes/_authenticated/wallet.tsx
// The wallet feature (prepaid balance, top-up, withdrawal) is temporarily disabled:
// fares are now paid directly to the driver (cash or their own Pochi la Biashara /
// Send Money / Buy Goods details, set in Account settings) instead of through an
// in-app balance. The underlying wallet tables and RPCs are untouched in the
// database in case this comes back later — this file just stops surfacing the UI.
// See src/routes/_authenticated/ride.$routeId.tsx for the current payment flow.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { AppShell } from "@/components/matu/AppShell";

export const Route = createFileRoute("/_authenticated/wallet")({
  component: WalletDisabled,
});

function WalletDisabled() {
  return (
    <AppShell title="Wallet" subtitle="Temporarily unavailable">
      <div className="mx-auto grid max-w-md gap-3 rounded-2xl border border-border bg-surface p-6 text-center">
        <Wallet className="mx-auto size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          The wallet isn't available right now. Fares are paid directly to the driver, either in
          cash or via their M-Pesa details shown when you book.
        </p>
        <Link
          to="/ride"
          className="mx-auto mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Find a ride
        </Link>
      </div>
    </AppShell>
  );
}
