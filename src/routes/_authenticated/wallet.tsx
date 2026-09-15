// FILE: src/routes/_authenticated/wallet.tsx
// One wallet screen shared by all roles. What's shown depends on which wallet(s) the
// signed-in user has: passengers get a balance + top-up form; drivers/sacco admins get
// a balance + withdraw form. A user could in theory hold more than one (e.g. a driver
// who also books rides as a passenger), so both sections can render at once.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/matu-auth";
import { generateWalletReportPdf } from "@/lib/pdf-report";
import { AppShell } from "@/components/matu/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({ meta: [{ title: "Wallet · Matu" }] }),
  component: WalletPage,
});

type OwnerType = "passenger" | "driver" | "sacco";

type WalletRow = { id: string; owner_type: OwnerType; owner_id: string; balance: number };

type TxnRow = {
  id: string;
  type: string;
  status: string;
  amount: number;
  balance_after: number | null;
  created_at: string;
};

function WalletPage() {
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [saccoId, setSaccoId] = useState<string | null>(null);
  const [saccoName, setSaccoName] = useState<string>("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [wallets, setWallets] = useState<Record<OwnerType, WalletRow | null>>({
    passenger: null,
    driver: null,
    sacco: null,
  });
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<OwnerType | null>(null);

  async function loadAll() {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .eq("id", user.id)
      .single();
    if (profile?.phone) setPhone(profile.phone);
    if (profile?.full_name) setFullName(profile.full_name);

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const myRoles = (roleRows ?? []).map((r) => r.role as AppRole);
    setRoles(myRoles);
    const isPassenger = myRoles.length === 0 || myRoles.includes("passenger");
    const isDriver = myRoles.includes("driver") || myRoles.includes("conductor");
    const isSaccoAdmin = myRoles.includes("sacco_admin");

    const { data: sacco } = isSaccoAdmin
      ? await supabase.from("saccos").select("id, name").eq("owner_id", user.id).maybeSingle()
      : { data: null };
    if (sacco) {
      setSaccoId(sacco.id);
      setSaccoName(sacco.name);
    }

    // Only create/fetch a wallet for roles this user actually holds — otherwise
    // everyone would end up with a driver wallet just from visiting this page.
    const ids: (string | null)[] = [];
    if (isPassenger) {
      const r = await supabase.rpc("get_or_create_my_wallet", { _owner_type: "passenger" });
      ids.push(r.data);
    }
    if (isDriver) {
      const r = await supabase.rpc("get_or_create_my_wallet", { _owner_type: "driver" });
      ids.push(r.data);
    }
    if (sacco?.id) {
      const r = await supabase.rpc("get_or_create_my_wallet", { _owner_type: "sacco" });
      ids.push(r.data);
    }

    const walletIds = ids.filter(Boolean) as string[];
    const { data: walletRows } = await supabase.from("wallets").select("*").in("id", walletIds);
    const next: Record<OwnerType, WalletRow | null> = {
      passenger: null,
      driver: null,
      sacco: null,
    };
    for (const w of walletRows ?? []) next[w.owner_type as OwnerType] = w as WalletRow;
    setWallets(next);

    const { data: txnRows } = await supabase
      .from("wallet_transactions")
      .select("id, type, status, amount, balance_after, created_at")
      .in("wallet_id", walletIds)
      .order("created_at", { ascending: false })
      .limit(20);
    setTxns((txnRows ?? []) as TxnRow[]);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // Live-update balances as payments/payouts resolve, instead of requiring a manual refresh.
    const channel = supabase
      .channel("wallet-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" }, () =>
        loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function topUp() {
    const amt = Number(amount);
    if (!amt || amt < 10) {
      toast.error("Enter at least KES 10");
      return;
    }
    if (!phone) {
      toast.error("Add a phone number in Account settings first");
      return;
    }
    setBusy("passenger");
    const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
      body: { phone, amount: amt, purpose: "wallet_topup" },
    });
    setBusy(null);
    if (error || data?.error) {
      toast.error(data?.error ?? "Could not start top-up");
      return;
    }
    setAmount("");
    toast.success("Enter your M-Pesa PIN on your phone to complete the top-up");
  }

  async function withdraw(ownerType: "driver" | "sacco") {
    const amt = Number(amount);
    const wallet = wallets[ownerType];
    if (!wallet || amt < 50) {
      toast.error("Minimum withdrawal is KES 50");
      return;
    }
    if (amt > wallet.balance) {
      toast.error("Amount exceeds your wallet balance");
      return;
    }
    if (!phone) {
      toast.error("Add a phone number in Account settings first");
      return;
    }
    setBusy(ownerType);
    const { data, error } = await supabase.functions.invoke("mpesa-b2c-payout", {
      body: { owner_type: ownerType, phone, amount: amt },
    });
    setBusy(null);
    if (error || data?.error) {
      toast.error(data?.error ?? "Withdrawal failed");
      return;
    }
    setAmount("");
    toast.success("Withdrawal requested. Funds will arrive shortly.");
  }

  async function downloadReport(ownerType: OwnerType) {
    const wallet = wallets[ownerType];
    if (!wallet) {
      toast.error("No wallet found to report on");
      return;
    }
    setBusy(ownerType);
    // Full ledger, not the 20-row preview shown on screen — an audit report has to
    // be complete or it isn't an audit report.
    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("id, type, status, amount, balance_after, created_at, mpesa_receipt, phone")
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: true });
    setBusy(null);
    if (error) {
      toast.error("Couldn't load transaction history for the report");
      return;
    }

    const ownerLabel =
      ownerType === "passenger"
        ? `${fullName || "Passenger"}: Passenger wallet`
        : ownerType === "driver"
          ? `${fullName || "Driver"}: Driver earnings`
          : `${saccoName || "SACCO"}: Commission wallet`;

    generateWalletReportPdf({
      ownerLabel,
      currentBalance: wallet.balance,
      txns: data ?? [],
      generatedFor: phone ? `Phone: ${phone}` : undefined,
    });
  }

  if (loading) {
    return (
      <AppShell title="Wallet" assistantContext={{ page: "account" }}>
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  const isPassenger = roles.length === 0 || roles.includes("passenger");
  const hasDriverWallet = wallets.driver !== null;
  const hasSaccoWallet = saccoId !== null;

  return (
    <AppShell
      title="Wallet"
      subtitle="Your Matu balance and transaction history"
      assistantContext={{ page: "account" }}
    >
      <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
        {/* Passenger wallet: balance + top-up */}
        {isPassenger && (
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Wallet className="size-5 text-primary" />
              <CardTitle className="text-base">Passenger wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-3xl font-semibold">
                KES {(wallets.passenger?.balance ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Top up here so you can pay fares instantly from your balance instead of an M-Pesa
                prompt every trip.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="topup-amount" className="sr-only">
                    Amount
                  </Label>
                  <Input
                    id="topup-amount"
                    type="number"
                    placeholder="Amount (KES)"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Button onClick={topUp} disabled={busy === "passenger"}>
                  {busy === "passenger" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="size-4" />
                  )}
                  Top up
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => downloadReport("passenger")}
                disabled={busy === "passenger"}
              >
                <FileDown className="size-4" /> Download financial report (PDF)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Driver wallet: balance + withdraw */}
        {hasDriverWallet && (
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Wallet className="size-5 text-primary" />
              <CardTitle className="text-base">Driver earnings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-3xl font-semibold">
                KES {(wallets.driver?.balance ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Credited automatically from fares on trips you drive. Withdraw to your M-Pesa
                anytime (minimum KES 50).
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Amount (KES)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => withdraw("driver")}
                  disabled={busy === "driver"}
                >
                  {busy === "driver" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="size-4" />
                  )}
                  Withdraw
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => downloadReport("driver")}
                disabled={busy === "driver"}
              >
                <FileDown className="size-4" /> Download financial report (PDF)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Sacco wallet: balance + withdraw */}
        {hasSaccoWallet && (
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Wallet className="size-5 text-primary" />
              <CardTitle className="text-base">SACCO commission</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-3xl font-semibold">
                KES {(wallets.sacco?.balance ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Your commission cut, credited automatically from every fare paid across your fleet.
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Amount (KES)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => withdraw("sacco")}
                  disabled={busy === "sacco"}
                >
                  {busy === "sacco" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="size-4" />
                  )}
                  Withdraw
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => downloadReport("sacco")}
                disabled={busy === "sacco"}
              >
                <FileDown className="size-4" /> Download financial audit report (PDF)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Recent activity across all of this user's wallets */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {txns.length === 0 && (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            )}
            {txns.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0"
              >
                <div>
                  <p className="capitalize">{t.type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()} ·{" "}
                    <span
                      className={
                        t.status === "completed"
                          ? "text-emerald-600"
                          : t.status === "failed" || t.status === "reversed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {t.status}
                    </span>
                  </p>
                </div>
                <p className="font-medium">KES {Number(t.amount).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
