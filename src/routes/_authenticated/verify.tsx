// FILE: src/routes/_authenticated/verify.tsx
// Self-service completion/retry for identity verification — reachable any
// time from the VerificationBanner on the driver/SACCO dashboards, not just
// during signup. Simplified deliberately: just the ID number (everyone) and
// driving license number (drivers only) — no document photo uploads, PSV
// badge, or good conduct certificate. Name and age live on the Account page
// instead, since they apply to every user, not just those going through
// verification.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldX, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { ROLE_HOME } from "@/lib/matu-auth";

type Profile = {
  id: string;
  verification_status: "not_required" | "pending" | "verified" | "rejected";
  verification_rejection_reason: string | null;
  id_number: string | null;
  license_number: string | null;
};

export const Route = createFileRoute("/_authenticated/verify")({
  component: VerifyPage,
});

function VerifyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [idNumber, setIdNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setLoading(false);
    setUserId(u.user.id);

    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, verification_status, verification_rejection_reason, id_number, license_number")
        .eq("id", u.user.id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id),
    ]);

    if (p) {
      setProfile(p as Profile);
      setIdNumber(p.id_number ?? "");
      setLicenseNumber(p.license_number ?? "");
    }
    setIsDriver((roles ?? []).some((r) => r.role === "driver" || r.role === "conductor"));
    setLoading(false);
  }

  async function save() {
    if (!userId) return;
    if (!idNumber.trim()) return toast.error("Enter your national ID number");
    if (isDriver && !licenseNumber.trim()) return toast.error("Enter your driving license number");

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          id_number: idNumber.trim(),
          license_number: isDriver ? licenseNumber.trim() : null,
          // A resubmission after a rejection goes back to 'pending' so it
          // reappears in the platform-admin queue — otherwise a rejected
          // account would have no way back in short of an admin manually
          // flipping the status again.
          ...(profile?.verification_status === "rejected" && {
            verification_status: "pending",
            verification_rejection_reason: null,
          }),
        })
        .eq("id", userId);
      if (updateError) throw updateError;

      toast.success("Verification details saved. Our team will review them shortly.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong saving your details");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Verification">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!profile || profile.verification_status === "not_required") {
    return (
      <AppShell title="Verification">
        <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          Verification isn't required for your account.{" "}
          <Link to={ROLE_HOME.passenger} className="text-primary underline">
            Back to the app
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Identity verification"
      subtitle="Used to confirm you're a real driver/SACCO owner before full approval. You can keep using the app while this is pending."
    >
      <div className="grid max-w-lg gap-4">
        {profile.verification_status === "verified" && (
          <div className="flex items-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2.5 text-sm text-green-700">
            <ShieldCheck className="size-4 shrink-0" /> Verified — no action needed.
          </div>
        )}
        {profile.verification_status === "pending" && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700">
            <ShieldAlert className="size-4 shrink-0" /> Pending review. You can update your details
            below any time before it's reviewed.
          </div>
        )}
        {profile.verification_status === "rejected" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <ShieldX className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Not approved.</span>{" "}
              {profile.verification_rejection_reason ?? "Update your details below and resubmit."}
            </span>
          </div>
        )}

        <div className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
          <Field label="National ID number" value={idNumber} onChange={setIdNumber} />
          {isDriver && (
            <Field
              label="Driving license number"
              value={licenseNumber}
              onChange={setLicenseNumber}
            />
          )}

          <button
            onClick={save}
            disabled={saving}
            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Save className="size-4" /> {saving ? "Saving…" : "Save & submit"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
      />
    </label>
  );
}
