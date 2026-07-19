// FILE: src/components/matu/TripSummary.tsx
// The "how was your trip" receipt shown once a booking is done — either
// completed (alighted) or cancelled. Modeled on Uber's post-trip screen:
// a static map of the leg just ridden, the fare, the duration, who drove
// you, and (for completed trips) a star rating + review prompt.
//
// Deliberately takes plain data as props rather than fetching its own
// booking/trip/route/stage rows — callers (the tracking page, and the
// "Past" list in ride.history.tsx) already have that loaded, so this stays
// a dumb, reusable presentational component plus its own small bits of
// state for the driver's name and any existing review.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, Banknote, CheckCircle2, Clock, MapPin, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RouteMap, type MapStage } from "@/components/matu/RouteMap";

export type TripSummaryBooking = {
  id: string;
  status: string;
  fare_paid: number | null;
  pickup_stage_id: string | null;
  dropoff_stage_id: string | null;
  cancellation_reason: string | null;
  boarded_at?: string | null;
  alighted_at?: string | null;
};
export type TripSummaryTrip = {
  id: string;
  fare: number;
  driver_id: string;
  started_at?: string | null;
  ended_at?: string | null;
};
export type TripSummaryStage = { id: string; name: string; lat: number; lng: number };
export type TripSummaryVehicle = { plate_number: string; nickname: string | null } | null;
export type TripSummaryRoute = { name: string; origin: string; destination: string } | null;

// "18 min" / "1h 24m" — mirrors how Uber phrases ride duration rather than
// showing a raw timestamp delta.
function formatDuration(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function TripSummary({
  booking,
  trip,
  route,
  stages,
  vehicle,
}: {
  booking: TripSummaryBooking;
  trip: TripSummaryTrip;
  route: TripSummaryRoute;
  stages: TripSummaryStage[];
  vehicle: TripSummaryVehicle;
}) {
  const cancelled = booking.status === "cancelled";
  const completed = booking.status === "alighted";

  const [driverName, setDriverName] = useState<string | null>(null);
  const [existingReview, setExistingReview] = useState<{ rating: number } | null>(null);
  const [checkedReview, setCheckedReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmittedRating, setJustSubmittedRating] = useState<number | null>(null);

  // One review per booking — enforced by a unique constraint on
  // trip_reviews.booking_id and RLS checking the booking is the reviewer's
  // own and actually alighted (see reviews.$driverId.tsx for where these
  // surface publicly).
  useEffect(() => {
    (async () => {
      const [{ data: profile }, { data: review }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", trip.driver_id).maybeSingle(),
        supabase.from("trip_reviews").select("rating").eq("booking_id", booking.id).maybeSingle(),
      ]);
      setDriverName(profile?.full_name ?? null);
      setExistingReview(review ?? null);
      setCheckedReview(true);
    })();
  }, [booking.id, trip.driver_id]);

  async function submitReview() {
    if (rating < 1) return toast.error("Tap a star to rate your trip");
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("trip_reviews").insert({
        booking_id: booking.id,
        trip_id: trip.id,
        passenger_id: u.user.id,
        driver_id: trip.driver_id,
        rating,
        comment: comment.trim() || null,
      });
      if (error) throw error;
      setJustSubmittedRating(rating);
      toast.success("Thanks for your review!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit your review");
    } finally {
      setSubmitting(false);
    }
  }

  const pickup = stages.find((s) => s.id === booking.pickup_stage_id) ?? null;
  const dropoff = stages.find((s) => s.id === booking.dropoff_stage_id) ?? null;

  const mapStages: MapStage[] = [pickup, dropoff].filter((s): s is TripSummaryStage => !!s);
  const staticRoute =
    pickup && dropoff
      ? {
          origin: { lat: pickup.lat, lng: pickup.lng },
          destination: { lat: dropoff.lat, lng: dropoff.lng },
        }
      : null;

  // Prefer this passenger's own boarded→alighted window (their actual time
  // on the vehicle); fall back to the whole trip's started→ended if their
  // own timestamps weren't captured (e.g. a booking that predates this
  // feature, or one swept to "alighted" in bulk when the driver ended the
  // trip without a per-passenger scan-off).
  const duration =
    formatDuration(booking.boarded_at, booking.alighted_at) ??
    formatDuration(trip.started_at, trip.ended_at);

  const endedAt = booking.alighted_at ?? trip.ended_at ?? null;
  const fare = booking.fare_paid ?? trip.fare;
  const shownRating = existingReview?.rating ?? justSubmittedRating;

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
            cancelled ? "bg-destructive/10" : "bg-primary/10"
          }`}
        >
          {cancelled ? (
            <Ban className="size-5 text-destructive" />
          ) : (
            <CheckCircle2 className="size-5 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold">
            {cancelled ? "Booking cancelled" : "Trip completed"}
          </p>
          {endedAt && (
            <p className="text-xs text-muted-foreground">
              {new Date(endedAt).toLocaleString("en-KE", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>

      {cancelled && booking.cancellation_reason && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
          Reason: {booking.cancellation_reason}
        </div>
      )}

      {mapStages.length === 2 && (
        <RouteMap
          stages={mapStages}
          liveRoute={staticRoute}
          className="h-48 w-full rounded-xl border border-border"
        />
      )}

      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3.5" /> Route
          </span>
          <span className="truncate text-right font-medium">
            {pickup?.name ?? "—"} → {dropoff?.name ?? "—"}
          </span>
        </div>
        {route && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">On</span>
            <span className="truncate text-right font-medium">{route.name}</span>
          </div>
        )}
        {duration && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" /> Duration
            </span>
            <span className="font-medium">{duration}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Banknote className="size-3.5" /> Fare
          </span>
          <span className="font-semibold">{cancelled ? "KSh 0" : `KSh ${fare}`}</span>
        </div>
        {vehicle && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Vehicle</span>
            <span className="font-medium">
              {vehicle.plate_number}
              {vehicle.nickname ? ` · ${vehicle.nickname}` : ""}
            </span>
          </div>
        )}
        {driverName && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Driver</span>
            <Link
              to="/reviews/$driverId"
              params={{ driverId: trip.driver_id }}
              className="font-medium text-primary underline"
            >
              {driverName}
            </Link>
          </div>
        )}
      </div>

      {completed && checkedReview && (
        <div className="border-t border-border pt-3">
          {shownRating ? (
            <div className="flex items-center gap-1 text-sm">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              <span className="font-medium">You rated this trip {shownRating}/5</span>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold">Rate your trip</p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  >
                    <Star
                      className={`size-7 ${
                        n <= (hoverRating || rating)
                          ? "fill-amber-400 text-amber-400"
                          : "fill-transparent text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a review (optional) — other passengers, this driver, and their SACCO can see it"
                rows={2}
                className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
              <button
                onClick={submitReview}
                disabled={submitting}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit rating"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
