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
  dropoff_code: string;
  trip_id: string | null;
  driver_id: string | null;
};

const SELECT_FIELDS =
  "id,origin,destination,receiver_name,receiver_phone,size,weight_kg,price,status,dropoff_code,trip_id,driver_id";

export function ParcelPanel({ tripId }: { tripId: string }) {
  const [pending, setPending] = useState<ParcelRow[]>([]);
  const [mine, setMine] = useState<ParcelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const nextStatus = p.status === "accepted" ? "in_transit" : "delivered";
    setBusyId(p.id);
    const patch: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "delivered") patch.delivered_at = new Date().toISOString();
    const { error } = await supabase.from("parcels").update(patch).eq("id", p.id);
    setBusyId(null);
    if (error) {
      toast.error("Couldn't update parcel status");
      return;
    }
    toast.success(nextStatus === "in_transit" ? "Marked as on the way" : "Marked as delivered");
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
                To {p.receiver_name} · {p.receiver_phone} · code {p.dropoff_code}
              </p>
              <button
                onClick={() => advance(p)}
                disabled={busyId === p.id}
                className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Check className="size-3.5" />
                {p.status === "accepted" ? "Mark picked up / on the way" : "Mark delivered"}
              </button>
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
