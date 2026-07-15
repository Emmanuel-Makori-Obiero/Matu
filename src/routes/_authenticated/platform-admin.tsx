// FILE: src/routes/_authenticated/platform-admin.tsx
// Platform-wide oversight page, only usable by users holding the 'platform_admin'
// role (granted manually via SQL, not self-service). Lets a platform admin see
// vehicles across every SACCO and suspend one immediately — independent of which
// SACCO owns it — e.g. after a safety complaint. Also surfaces every complaint
// filed platform-wide so nothing sits unresolved just because no SACCO admin
// happened to look.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldX, MessageSquareWarning, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { OfflineDebugPanel } from "@/components/matu/OfflineDebugPanel";
import type { Database } from "@/integrations/supabase/types";

type ComplaintStatus = Database["public"]["Enums"]["complaint_status"];

type PendingVerificationRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  id_number: string | null;
  license_number: string | null;
  driver_type: string | null;
  roles: string[];
  sacco_name: string | null;
  sacco_registration_number: string | null;
  id_document_path: string | null;
  license_document_path: string | null;
  psv_badge_path: string | null;
  good_conduct_path: string | null;
  created_at: string;
};

type ComplaintRow = {
  id: string;
  category: Database["public"]["Enums"]["complaint_category"];
  recipient: Database["public"]["Enums"]["complaint_recipient"];
  message: string;
  status: ComplaintStatus;
  resolution_note: string | null;
  created_at: string;
  sacco_id: string | null;
  driver_id: string | null;
  sacco_name?: string | null;
};

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
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [pendingVerifications, setPendingVerifications] = useState<PendingVerificationRow[]>([]);
  const [loadingVerifications, setLoadingVerifications] = useState(true);
  const [verifyBusyId, setVerifyBusyId] = useState<string | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState<Record<string, string>>({});

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
    if (data) {
      load();
      loadComplaints();
      loadVerifications();
    }
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

  async function loadComplaints() {
    setLoadingComplaints(true);
    const { data, error } = await supabase
      .from("complaints")
      .select("id,category,recipient,message,status,resolution_note,created_at,sacco_id,driver_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error(error.message);
      setLoadingComplaints(false);
      return;
    }
    const rows = (data ?? []) as ComplaintRow[];
    const saccoIds = Array.from(new Set(rows.map((r) => r.sacco_id).filter(Boolean))) as string[];
    let saccoNames: Record<string, string> = {};
    if (saccoIds.length > 0) {
      const { data: saccoRows } = await supabase
        .from("saccos")
        .select("id,name")
        .in("id", saccoIds);
      saccoNames = Object.fromEntries((saccoRows ?? []).map((s) => [s.id, s.name]));
    }
    setComplaints(
      rows.map((r) => ({ ...r, sacco_name: r.sacco_id ? saccoNames[r.sacco_id] : null })),
    );
    setLoadingComplaints(false);
  }

  async function resolveComplaint(c: ComplaintRow, status: ComplaintStatus) {
    setResolvingId(c.id);
    const { error } = await supabase.rpc("resolve_complaint", {
      _complaint_id: c.id,
      _status: status,
      _note: (noteDraft[c.id] ?? "").trim() || null,
    });
    setResolvingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "resolved" ? "Marked resolved." : "Marked acknowledged.");
    loadComplaints();
  }

  const visibleComplaints = complaints.filter((c) => showResolved || c.status !== "resolved");

  async function openDocument(path: string) {
    // Signed, short-lived (5 min) rather than a public URL — the bucket is
    // private specifically so only the uploader and platform admins (via the
    // "Platform admins read verification documents" storage policy) can ever
    // see these.
    const { data, error } = await supabase.storage
      .from("verification-documents")
      .createSignedUrl(path, 300);
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't open that document");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function loadVerifications() {
    setLoadingVerifications(true);
    // pending_verifications is a view scoped to is_platform_admin() itself
    // (see the migration) — a non-admin querying it just gets an empty
    // result, but we only ever reach here after checkAccess() confirms admin.
    const { data, error } = await supabase
      .from("pending_verifications")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoadingVerifications(false);
      return;
    }
    setPendingVerifications((data ?? []) as PendingVerificationRow[]);
    setLoadingVerifications(false);
  }

  async function reviewVerification(row: PendingVerificationRow, status: "verified" | "rejected") {
    if (status === "rejected" && !(rejectReasonDraft[row.user_id] ?? "").trim()) {
      toast.error("Add a reason before rejecting.");
      return;
    }
    setVerifyBusyId(row.user_id);
    const { error } = await supabase.rpc("set_verification_status", {
      _user_id: row.user_id,
      _status: status,
      _reason: status === "rejected" ? rejectReasonDraft[row.user_id].trim() : null,
    });
    setVerifyBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "verified"
        ? `${row.full_name ?? "Account"} verified`
        : `${row.full_name ?? "Account"} rejected`,
    );
    loadVerifications();
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
        <OfflineDebugPanel />
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

      <div className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Pending verifications</h2>
        <p className="text-xs opacity-70">
          Drivers and SACCO owners submit ID/license details at signup and can use the app
          immediately — approving or rejecting here just updates their verified badge.
        </p>

        {loadingVerifications && <p className="text-sm opacity-70">Loading…</p>}
        {!loadingVerifications && pendingVerifications.length === 0 && (
          <p className="text-sm opacity-70">Nothing pending right now.</p>
        )}
        {pendingVerifications.map((row) => (
          <div
            key={row.user_id}
            className="rounded-2xl border border-amber-500/50 bg-amber-500/5 p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <UserCheck className="size-4" />
                  {row.full_name ?? "Unnamed"}
                  <span className="font-normal opacity-70"> · {row.roles.join(", ")}</span>
                </p>
                <p className="text-xs opacity-70">
                  {row.phone ?? "No phone"} · ID {row.id_number ?? "—"}
                  {row.license_number && ` · License ${row.license_number}`}
                </p>
                {row.sacco_name && (
                  <p className="text-xs opacity-70">
                    SACCO: {row.sacco_name}
                    {row.sacco_registration_number && ` (reg. ${row.sacco_registration_number})`}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.id_document_path && (
                    <button
                      onClick={() => openDocument(row.id_document_path!)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary"
                    >
                      View ID
                    </button>
                  )}
                  {row.license_document_path && (
                    <button
                      onClick={() => openDocument(row.license_document_path!)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary"
                    >
                      View license
                    </button>
                  )}
                  {row.psv_badge_path && (
                    <button
                      onClick={() => openDocument(row.psv_badge_path!)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary"
                    >
                      View PSV badge
                    </button>
                  )}
                  {row.good_conduct_path && (
                    <button
                      onClick={() => openDocument(row.good_conduct_path!)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary"
                    >
                      View good conduct cert.
                    </button>
                  )}
                  {!row.id_document_path && (
                    <span className="text-xs italic text-destructive">No ID document uploaded</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  disabled={verifyBusyId === row.user_id}
                  onClick={() => reviewVerification(row, "verified")}
                  className="flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ShieldCheck className="size-4" /> Verify
                </button>
                <button
                  disabled={verifyBusyId === row.user_id}
                  onClick={() => reviewVerification(row, "rejected")}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <ShieldX className="size-4" /> Reject
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Rejection reason (required to reject)"
              value={rejectReasonDraft[row.user_id] ?? ""}
              onChange={(e) =>
                setRejectReasonDraft((prev) => ({ ...prev, [row.user_id]: e.target.value }))
              }
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Complaints</h2>
          <label className="flex items-center gap-2 text-xs opacity-70">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            Show resolved
          </label>
        </div>

        {loadingComplaints && <p className="text-sm opacity-70">Loading complaints…</p>}
        {!loadingComplaints && visibleComplaints.length === 0 && (
          <p className="text-sm opacity-70">Nothing here right now.</p>
        )}
        {visibleComplaints.map((c) => (
          <div
            key={c.id}
            className={`rounded-2xl border p-4 ${
              c.status === "resolved"
                ? "border-border bg-surface opacity-60"
                : c.status === "acknowledged"
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-red-500/50 bg-red-500/5"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs opacity-70">
                <MessageSquareWarning className="size-3.5" />
                {c.category === "app" ? "App issue" : "Travel issue"}
                {c.sacco_name && <span> · {c.sacco_name}</span>}
                <span>
                  ·{" "}
                  {new Date(c.created_at).toLocaleDateString("en-KE", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                {c.status}
              </span>
            </div>
            <p className="mt-2 text-sm">{c.message}</p>
            {c.resolution_note && (
              <p className="mt-2 text-xs italic opacity-70">Note: {c.resolution_note}</p>
            )}

            {c.status !== "resolved" && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  placeholder="Resolution note (optional)"
                  value={noteDraft[c.id] ?? ""}
                  onChange={(e) => setNoteDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  {c.status === "open" && (
                    <button
                      disabled={resolvingId === c.id}
                      onClick={() => resolveComplaint(c, "acknowledged")}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    disabled={resolvingId === c.id}
                    onClick={() => resolveComplaint(c, "resolved")}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
