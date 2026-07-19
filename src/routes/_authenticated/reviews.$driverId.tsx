// FILE: src/routes/_authenticated/reviews.$driverId.tsx
// Reviews for a specific driver — visible to anyone signed in (passenger,
// driver, or sacco admin), not just the driver themselves or the passengers
// who rode with them. Reviews come from ride.track_.$bookingId.tsx's
// ReviewPrompt, one per completed booking.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  passenger_id: string;
};

export const Route = createFileRoute("/_authenticated/reviews/$driverId")({
  component: DriverReviewsPage,
});

function DriverReviewsPage() {
  const { driverId } = Route.useParams();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: rows }, { data: profile }] = await Promise.all([
        supabase
          .from("trip_reviews")
          .select("id,rating,comment,created_at,passenger_id")
          .eq("driver_id", driverId)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("full_name").eq("id", driverId).maybeSingle(),
      ]);
      setReviews((rows ?? []) as Review[]);
      setDriverName(profile?.full_name ?? null);
      setLoading(false);
    })();
  }, [driverId]);

  const average =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  return (
    <AppShell
      title={driverName ? `${driverName}'s reviews` : "Driver reviews"}
      subtitle={
        average
          ? `${average} average · ${reviews.length} review${reviews.length === 1 ? "" : "s"}`
          : "No reviews yet"
      }
    >
      <div className="grid max-w-lg gap-3">
        {loading && <p className="text-sm text-muted-foreground">Loading reviews…</p>}
        {!loading && reviews.length === 0 && (
          <p className="text-sm text-muted-foreground">No one has reviewed this driver yet.</p>
        )}
        {reviews.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`size-4 ${
                    n <= r.rating
                      ? "fill-amber-400 text-amber-400"
                      : "fill-transparent text-muted-foreground"
                  }`}
                />
              ))}
              <span className="ml-2 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString("en-KE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
          </div>
        ))}

        <Link
          to="/ride"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline"
        >
          <ArrowLeft className="size-3" /> Back to the app
        </Link>
      </div>
    </AppShell>
  );
}
