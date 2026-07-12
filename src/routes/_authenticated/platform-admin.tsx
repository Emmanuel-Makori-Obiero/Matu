// FILE: src/routes/_authenticated/platform-admin.tsx
// Platform-wide oversight page, only usable by users holding the 'platform_admin'
// role (granted manually via SQL, not self-service). Lets a platform admin see
// vehicles across every SACCO and suspend one immediately — independent of which
// SACCO owns it — e.g. after a safety complaint.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type VehicleRow = {
  id: string;
  plate_number: string;
  nickname: string | null;
  sacco_id: string | null;
  suspended: boolean;
  suspended_reason: string | null;
  sacco_name?: string | null;
};

export const Route = createFileRoute("/_authenticated/platform-admin")({
  component: PlatformAdminPage,
});

function PlatformAdminPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAccess() {
    const { data, error } = await supabase.rpc("is_platform_admin");
    if (error) {
      toast.error(error.message);
      setCheckingAccess(false);
      return;
    }
    setIsAdmin(Boolean(data));
    setCheckingAccess(false);
    if (data) load();
  }

  async function load() {
    setLoading(true);
    const { data: vRows, error: vErr } = await supabase
      .from("vehicles")
      .select("id,plate_number,nickname,sacco_id,suspended,suspended_reason")
      .order("suspended", { ascending: false })
      .order("plate_number", { ascending: true });
    if (vErr) {
      toast.error(vErr.message);
      setLoading(false);
      return;
    }
    const rows = (vRows ?? []) as VehicleRow[];

    const saccoIds = Array.from(new Set(rows.map((r) => r.sacco_id).filter(Boolean))) as string[];
    let saccoNames: Record<string, string> = {};
    if (saccoIds.length > 0) {
      const { data: saccoRows } = await supabase
        .from("saccos")
        .select("id,name")
        .in("id", saccoIds);
      saccoNames = Object.fromEntries((saccoRows ?? []).map((s) => [s.id, s.name]));
    }

    setVehicles(
      rows.map((r) => ({ ...r, sacco_name: r.sacco_id ? saccoNames[r.sacco_id] : null })),
    );
    setLoading(false);
  }

  async function toggleSuspend(v: VehicleRow) {
    setBusyId(v.id);
    const nextSuspended = !v.suspended;
    const reason = nextSuspended ? (reasonDraft[v.id] ?? "").trim() : null;

    if (nextSuspended && !reason) {
      toast.error("Add a reason before suspending a vehicle.");
      setBusyId(null);
      return;
    }

    const { error } = await supabase.rpc("set_vehicle_suspension", {
      _vehicle_id: v.id,
      _suspended: nextSuspended,
      _reason: reason,
    });

    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(nextSuspended ? `${v.plate_number} suspended` : `${v.plate_number} reinstated`);
    load();
  }

  if (checkingAccess) {
    return (
      <AppShell title="Platform admin">
        <p className="text-sm opacity-70">Checking access…</p>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell title="Platform admin">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-6 text-sm">
          <ShieldX className="size-5 text-red-500" />
          You don't have access to this page.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Platform admin"
      subtitle="Cross-SACCO oversight. Suspending a vehicle here blocks it platform-wide, regardless of which SACCO owns it."
    >
      <div className="space-y-3">
        {loading && <p className="text-sm opacity-70">Loading vehicles…</p>}
        {!loading && vehicles.length === 0 && (
          <p className="text-sm opacity-70">No vehicles found across any SACCO yet.</p>
        )}
        {vehicles.map((v) => (
          <div
            key={v.id}
            className={`rounded-2xl border p-4 ${
              v.suspended ? "border-red-500/50 bg-red-500/5" : "border-border bg-surface"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {v.plate_number}
                  {v.nickname && (
                    <span className="ml-2 font-normal opacity-70">"{v.nickname}"</span>
                  )}
                </p>
                <p className="text-xs opacity-70">{v.sacco_name ?? "No SACCO"}</p>
                {v.suspended && v.suspended_reason && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                    <ShieldAlert className="size-3.5" /> {v.suspended_reason}
                  </p>
                )}
              </div>

              {v.suspended ? (
                <button
                  disabled={busyId === v.id}
                  onClick={() => toggleSuspend(v)}
                  className="flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ShieldCheck className="size-4" /> Reinstate
                </button>
              ) : (
                <button
                  disabled={busyId === v.id}
                  onClick={() => toggleSuspend(v)}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ShieldX className="size-4" /> Suspend
                </button>
              )}
            </div>

            {!v.suspended && (
              <input
                type="text"
                placeholder="Reason (required to suspend)"
                value={reasonDraft[v.id] ?? ""}
                onChange={(e) => setReasonDraft((prev) => ({ ...prev, [v.id]: e.target.value }))}
                className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
