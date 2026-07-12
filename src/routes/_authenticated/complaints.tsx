// FILE: src/routes/_authenticated/complaints.tsx
// Two kinds of complaints, routed differently:
//  - "App" issues (bugs, payment problems, account issues) always go to the developer
//    inbox by email, since only the dev can fix those.
//  - "Travel" issues (driver conduct, vehicle condition, route problems) are routed to
//    the driver, the sacco, or both — via a direct call/SMS to whichever contact is
//    available, plus a record saved to the database so the driver/sacco can see it in
//    a future dashboard.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, MessageSquareWarning, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

const DEV_EMAIL = "elmakobiero@gmail.com";

type TripOption = {
  bookingId: string;
  tripId: string;
  routeName: string;
  driverId: string;
  driverPhone: string | null;
  saccoId: string | null;
  saccoName: string | null;
  saccoPhone: string | null;
  dateLabel: string;
};

export const Route = createFileRoute("/_authenticated/complaints")({
  component: ComplaintsPage,
});

function ComplaintsPage() {
  const [category, setCategory] = useState<"app" | "travel" | null>(null);

  // App complaint state
  const [appMessage, setAppMessage] = useState("");

  // Travel complaint state
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripOptions, setTripOptions] = useState<TripOption[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [recipient, setRecipient] = useState<"driver" | "sacco" | "both">("both");
  const [travelMessage, setTravelMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (category !== "travel") return;
    loadTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  async function loadTrips() {
    setLoadingTrips(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setLoadingTrips(false);
      return;
    }

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id,trip_id,created_at,status")
      .eq("passenger_id", u.user.id)
      .in("status", ["boarded", "alighted", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(20);

    const rows = bookings ?? [];
    if (rows.length === 0) {
      setTripOptions([]);
      setLoadingTrips(false);
      return;
    }

    const tripIds = [...new Set(rows.map((r) => r.trip_id))];
    const { data: trips } = await supabase
      .from("trips")
      .select("id,route_id,driver_id,vehicle_id")
      .in("id", tripIds);

    const routeIds = [...new Set((trips ?? []).map((t) => t.route_id))];
    const vehicleIds = [...new Set((trips ?? []).map((t) => t.vehicle_id))];
    const driverIds = [...new Set((trips ?? []).map((t) => t.driver_id))];

    const [{ data: routes }, { data: vehicles }, { data: drivers }] = await Promise.all([
      routeIds.length
        ? supabase.from("routes").select("id,name").in("id", routeIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      vehicleIds.length
        ? supabase.from("vehicles").select("id,sacco_id").in("id", vehicleIds)
        : Promise.resolve({ data: [] as { id: string; sacco_id: string | null }[] }),
      driverIds.length
        ? supabase.from("profiles").select("id,phone").in("id", driverIds)
        : Promise.resolve({ data: [] as { id: string; phone: string | null }[] }),
    ]);

    const saccoIds = [
      ...new Set((vehicles ?? []).map((v) => v.sacco_id).filter((x): x is string => !!x)),
    ];
    const { data: saccos } = saccoIds.length
      ? await supabase.from("saccos").select("id,name,contact_phone").in("id", saccoIds)
      : { data: [] as { id: string; name: string; contact_phone: string | null }[] };

    const routeMap = Object.fromEntries((routes ?? []).map((r) => [r.id, r.name]));
    const vehicleMap = Object.fromEntries((vehicles ?? []).map((v) => [v.id, v]));
    const driverMap = Object.fromEntries((drivers ?? []).map((d) => [d.id, d.phone]));
    const saccoMap = Object.fromEntries((saccos ?? []).map((s) => [s.id, s]));
    const tripMap = Object.fromEntries((trips ?? []).map((t) => [t.id, t]));

    const options: TripOption[] = rows
      .map((b) => {
        const trip = tripMap[b.trip_id];
        if (!trip) return null;
        const vehicle = vehicleMap[trip.vehicle_id];
        const sacco = vehicle?.sacco_id ? saccoMap[vehicle.sacco_id] : undefined;
        return {
          bookingId: b.id,
          tripId: trip.id,
          routeName: routeMap[trip.route_id] ?? "Route",
          driverId: trip.driver_id,
          driverPhone: driverMap[trip.driver_id] ?? null,
          saccoId: sacco?.id ?? null,
          saccoName: sacco?.name ?? null,
          saccoPhone: sacco?.contact_phone ?? null,
          dateLabel: new Date(b.created_at).toLocaleDateString("en-KE", {
            day: "numeric",
            month: "short",
          }),
        };
      })
      .filter((x): x is TripOption => !!x);

    setTripOptions(options);
    setSelectedTripId(options[0]?.bookingId ?? "");
    setLoadingTrips(false);
  }

  const selectedTrip = tripOptions.find((t) => t.bookingId === selectedTripId);

  async function sendAppComplaint() {
    if (!appMessage.trim()) return toast.error("Tell us what went wrong first.");
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSubmitting(false);
      return toast.error("You need to be signed in to send this.");
    }
    const { data: complaint, error } = await supabase
      .from("complaints")
      .insert({
        passenger_id: u.user.id,
        category: "app",
        recipient: "developer",
        message: appMessage.trim(),
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error || !complaint) return toast.error(error?.message || "Could not save complaint");

    // Fire-and-forget the real email — the complaint is already saved either way, so a
    // slow or failed send doesn't block the passenger.
    supabase.functions.invoke("send-complaint-email", { body: { complaintId: complaint.id } });
    toast.success("Sent to the developer.");
    setAppMessage("");
  }

  async function submitTravelComplaint() {
    if (!selectedTrip) return toast.error("Pick which trip this is about.");
    if (!travelMessage.trim()) return toast.error("Describe what happened first.");

    // If "sacco" was picked but this sacco has no phone/email on file, fall back to the
    // driver instead of silently going nowhere. "Both" is left as-is — the driver side
    // still gets contacted even if the sacco side has nothing on file.
    let effectiveRecipient = recipient;
    const saccoHasContact = !!selectedTrip.saccoPhone || !!selectedTrip.saccoName;
    if (recipient === "sacco" && !saccoHasContact) {
      effectiveRecipient = "driver";
      toast.info("No sacco contact on file for this trip — routing to the driver instead.");
    }

    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSubmitting(false);
      return toast.error("You need to be signed in to send this.");
    }
    const { data: complaint, error } = await supabase
      .from("complaints")
      .insert({
        passenger_id: u.user.id,
        category: "travel",
        recipient: effectiveRecipient,
        trip_id: selectedTrip.tripId,
        sacco_id: selectedTrip.saccoId,
        driver_id: selectedTrip.driverId,
        message: travelMessage.trim(),
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error || !complaint) return toast.error(error?.message || "Could not save complaint");

    // Real email, sent server-side (looks up the driver's account email and the sacco's
    // contact_email itself — falls back to the developer if neither is on file).
    supabase.functions.invoke("send-complaint-email", { body: { complaintId: complaint.id } });

    // Also offer an immediate phone call as a backup — same fallback: if the sacco has no
    // number, use the driver's instead of no one.
    const phoneContacts: string[] = [];
    if (
      (effectiveRecipient === "driver" || effectiveRecipient === "both") &&
      selectedTrip.driverPhone
    ) {
      phoneContacts.push(selectedTrip.driverPhone);
    }
    if (
      (effectiveRecipient === "sacco" || effectiveRecipient === "both") &&
      selectedTrip.saccoPhone
    ) {
      phoneContacts.push(selectedTrip.saccoPhone);
    } else if (effectiveRecipient !== "driver" && selectedTrip.driverPhone) {
      // Sacco wanted but no sacco phone — try the driver's number as a last resort.
      phoneContacts.push(selectedTrip.driverPhone);
    }

    toast.success("Complaint sent.");
    if (phoneContacts.length) {
      window.location.href = `tel:${phoneContacts[0]}`;
    }
    setTravelMessage("");
  }

  return (
    <AppShell
      title="Support & complaints"
      subtitle="Tell us what went wrong — app issues and trip issues go to different people."
    >
      {!category ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setCategory("app")}
            className="rounded-2xl border border-border bg-surface p-6 text-left transition hover:border-primary"
          >
            <MessageSquareWarning className="size-6 text-primary" />
            <div className="mt-3 font-display text-base font-semibold">App or account issue</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Bugs, payment problems, login issues, or anything about how the app itself works. Goes
              straight to the developer.
            </p>
          </button>
          <button
            onClick={() => setCategory("travel")}
            className="rounded-2xl border border-border bg-surface p-6 text-left transition hover:border-primary"
          >
            <Phone className="size-6 text-primary" />
            <div className="mt-3 font-display text-base font-semibold">Something about a trip</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Driver conduct, vehicle condition, fare disputes, or anything that happened on a
              specific trip. Goes to the driver, the sacco, or both.
            </p>
          </button>
        </div>
      ) : category === "app" ? (
        <div className="max-w-lg rounded-2xl border border-border bg-surface p-6">
          <button
            onClick={() => setCategory(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h2 className="mt-2 font-display text-lg font-semibold">App or account issue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is sent straight to {DEV_EMAIL}, no need to open your own email app.
          </p>
          <textarea
            value={appMessage}
            onChange={(e) => setAppMessage(e.target.value)}
            placeholder="What went wrong?"
            rows={5}
            className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={sendAppComplaint}
            disabled={submitting}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Mail className="size-4" /> {submitting ? "Sending…" : "Email the developer"}
          </button>
        </div>
      ) : (
        <div className="max-w-lg rounded-2xl border border-border bg-surface p-6">
          <button
            onClick={() => setCategory(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h2 className="mt-2 font-display text-lg font-semibold">Something about a trip</h2>

          {loadingTrips ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading your recent trips…</p>
          ) : tripOptions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No recent trips found to file a complaint against.
            </p>
          ) : (
            <div className="mt-4 grid gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Which trip?</label>
                <select
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm"
                >
                  {tripOptions.map((t) => (
                    <option key={t.bookingId} value={t.bookingId}>
                      {t.routeName} · {t.dateLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Send this to</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["driver", "sacco", "both"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRecipient(r)}
                      className={`rounded-lg border px-3 py-2 text-sm capitalize transition ${
                        recipient === r
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {selectedTrip && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {selectedTrip.saccoName
                      ? `Sacco: ${selectedTrip.saccoName}`
                      : "No sacco on file"}
                  </p>
                )}
              </div>

              <textarea
                value={travelMessage}
                onChange={(e) => setTravelMessage(e.target.value)}
                placeholder="What happened?"
                rows={4}
                className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />

              <button
                onClick={submitTravelComplaint}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <Phone className="size-4" />
                {submitting ? "Sending…" : "Submit & contact"}
              </button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
