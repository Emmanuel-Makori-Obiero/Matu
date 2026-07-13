// FILE: src/components/matu/ParcelPanel.tsx
// Shown on the driver's active-trip page. Lists unclaimed parcel requests (open
// marketplace — any driver on any route can pick one up) plus whatever this driver
// has already accepted for the current trip, with buttons to advance status.
import { useEffect, useState } from "react";
import { Package, MapPin, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ParcelRow = {
  id: string;
  origin: string;
  destination: string;
  receiver_name: string;
  receiver_phone: string;
  size: "small" | "medium" | "large";
  weight_kg: number;
  price: number;
  status: "pending" | "accepted" | "in_transit" | "delivered" | "cancelled";
  trip_id: string | null;
  driver_id: string | null;
};

// Deliberately excludes dropoff_code — the driver's client should never receive it,
// or DevTools/network tab would leak it and defeat the whole point of asking the
// receiver for it. confirmDelivery() below verifies the code purely server-side via
// an .eq() filter on the update, so a match/no-match is all the client ever learns.
const SELECT_FIELDS =
  "id,origin,destination,receiver_name,receiver_phone,size,weight_kg,price,status,trip_id,driver_id";

export function ParcelPanel({ tripId }: { tripId: string }) {
  const [pending, setPending] = useState<ParcelRow[]>([]);
  const [mine, setMine] = useState<ParcelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [codeEntry, setCodeEntry] = useState<Record<string, string>>({});

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setLoading(false);

    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from("parcels").select(SELECT_FIELDS).eq("status", "pending"),
      supabase
        .from("parcels")
        .select(SELECT_FIELDS)
        .eq("driver_id", u.user.id)
        .in("status", ["accepted", "in_transit"]),
    ]);
    setPending((p ?? []) as ParcelRow[]);
    setMine((m ?? []) as ParcelRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`parcels-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "parcels" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function accept(p: ParcelRow) {
    setBusyId(p.id);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setBusyId(null);
    const { error } = await supabase
      .from("parcels")
      .update({
        status: "accepted",
        driver_id: u.user.id,
        trip_id: tripId,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", p.id)
      .eq("status", "pending");
    setBusyId(null);
    if (error) {
      toast.error("Someone else may have already accepted this parcel");
      load();
      return;
    }
    toast.success("Parcel accepted — pick it up at the origin stage");
    load();
  }

  async function advance(p: ParcelRow) {
    // Only the "in transit" step is a plain status bump. Delivery is handled by
    // confirmDelivery below, which requires the receiver's dropoff code.
    setBusyId(p.id);
    const { error } = await supabase
      .from("parcels")
      .update({ status: "in_transit" })
      .eq("id", p.id);
    setBusyId(null);
    if (error) {
      toast.error("Couldn't update parcel status");
      return;
    }
    toast.success("Marked as on the way");
    load();
  }

  async function confirmDelivery(p: ParcelRow) {
    const entered = (codeEntry[p.id] ?? "").trim();
    if (!entered) {
      toast.error("Ask the receiver for their dropoff code first");
      return;
    }
    if (entered !== p.dropoff_code) {
      toast.error("That code doesn't match — don't hand over the parcel yet");
      return;
    }
    setBusyId(p.id);
    const { data: ok, error } = await supabase.rpc("confirm_parcel_delivery", {
      _parcel_id: p.id,
      _code: entered,
    });
    setBusyId(null);
    if (error) {
      // Surface the real cause instead of always blaming the code — a missing
      // migration (function not found) or a network/permissions issue looks very
      // different from an actual wrong code, and silently merging them into one
      // message makes this impossible to debug.
      console.error("confirm_parcel_delivery error:", error);
      if (
        error.message?.includes("function") ||
        error.code === "PGRST202" ||
        error.code === "42883"
      ) {
        toast.error(
          "Server isn't set up for delivery confirmation yet — the database migration may be missing.",
        );
      } else {
        toast.error(`Couldn't confirm delivery: ${error.message}`);
      }
      return;
    }
    if (!ok) {
      toast.error("Code doesn't match — don't hand over the parcel yet");
      return;
    }
    toast.success("Delivery confirmed");
    setCodeEntry((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    load();
  }

  if (loading) return null;
  if (pending.length === 0 && mine.length === 0) return null;

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Package className="size-4 text-primary" /> Parcels
      </div>

      {mine.length > 0 && (
        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Your accepted parcels</span>
          {mine.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <MapPin className="size-3.5 text-primary" />
                {p.origin} → {p.destination}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                To {p.receiver_name} · {p.receiver_phone}
              </p>
              {p.status === "accepted" ? (
                <button
                  onClick={() => advance(p)}
                  disabled={busyId === p.id}
                  className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Check className="size-3.5" />
                  Mark picked up / on the way
                </button>
              ) : (
                <div className="mt-2 grid gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Ask the receiver for their dropoff code before handing over the parcel:
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      value={codeEntry[p.id] ?? ""}
                      onChange={(e) =>
                        setCodeEntry((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      placeholder="6-digit code"
                      maxLength={6}
                      className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-xs tracking-widest"
                    />
                    <button
                      onClick={() => confirmDelivery(p)}
                      disabled={busyId === p.id}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <Check className="size-3.5" />
                      Confirm delivered
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Available near you</span>
          {pending.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <MapPin className="size-3.5 text-primary" />
                  {p.origin} → {p.destination}
                </div>
                <span className="text-xs font-semibold text-primary">KSh {p.price}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {p.size} · {p.weight_kg}kg
              </p>
              <button
                onClick={() => accept(p)}
                disabled={busyId === p.id}
                className="mt-2 rounded-md border border-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {busyId === p.id ? "Accepting…" : "Accept parcel"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
