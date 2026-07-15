import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type VerificationStatus = "not_required" | "pending" | "verified" | "rejected";

// Shared by the driver and SACCO dashboards — both roles go through the same
// signup-time identity check (see the "Identity verification" fields on
// /auth and the claim_role/set_verification_status functions), so this keeps
// the banner and its copy in one place instead of duplicated per dashboard.
export function VerificationBanner() {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("verification_status, verification_rejection_reason")
        .eq("id", u.user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setStatus(data.verification_status as VerificationStatus);
      setReason(data.verification_rejection_reason);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || status === "not_required" || status === "verified") return null;

  if (status === "rejected") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <ShieldX className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-medium">Verification wasn't approved.</span>{" "}
          {reason ?? "Update your details and resubmit."}{" "}
          <Link to="/verify" className="font-medium underline">
            Fix this
          </Link>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-medium">Verification pending.</span> You can keep using the app while
        our team reviews your details — this usually doesn't take long.{" "}
        <Link to="/verify" className="font-medium underline">
          Review details
        </Link>
      </span>
    </div>
  );
}

// Small check icon export kept alongside for consistency if a "Verified"
// badge is ever wanted elsewhere (e.g. next to a driver's name).
export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
      <ShieldCheck className="size-3.5" /> Verified
    </span>
  );
}
