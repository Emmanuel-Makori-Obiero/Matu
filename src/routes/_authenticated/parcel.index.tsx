// FILE: src/routes/_authenticated/parcel.index.tsx
// Send a parcel with a matatu/bus going your route. Origin/destination only — no
// specific trip picked up front, any driver heading that way can accept it while
// they're on an active trip. Price is a flat base fee plus a size/weight surcharge.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Package, MapPin, Send, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type ParcelSize = "small" | "medium" | "large";

type ParcelRow = {
  id: string;
  origin: string;
  destination: string;
  receiver_name: string;
  receiver_phone: string;
  size: ParcelSize;
  weight_kg: number;
  price: number;
  status: "pending" | "accepted" | "in_transit" | "delivered" | "cancelled";
  created_at: string;
};

const BASE_FEE = 100;
const SIZE_SURCHARGE: Record<ParcelSize, number> = { small: 0, medium: 50, large: 120 };
const PER_KG_OVER_5 = 15;

function calcPrice(size: ParcelSize, weightKg: number): number {
  const overweight = Math.max(0, weightKg - 5);
  return Math.round(BASE_FEE + SIZE_SURCHARGE[size] + overweight * PER_KG_OVER_5);
}

const STATUS_LABEL: Record<ParcelRow["status"], string> = {
  pending: "Waiting for a driver",
  accepted: "Accepted — awaiting pickup",
  in_transit: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<ParcelRow["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  in_transit: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-secondary text-muted-foreground",
};

export const Route = createFileRoute("/_authenticated/parcel/")({
  component: ParcelPage,
});

function ParcelPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [size, setSize] = useState<ParcelSize>("small");
  const [weightKg, setWeightKg] = useState(1);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [parcels, setParcels] = useState<ParcelRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const price = calcPrice(size, weightKg);

  async function loadParcels() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setLoadingList(false);
    const { data, error } = await supabase
      .from("parcels")
      .select(
        "id,origin,destination,receiver_name,receiver_phone,size,weight_kg,price,status,created_at",
      )
      .eq("sender_id", u.user.id)
      .order("created_at", { ascending: false });
    if (!error && data) setParcels(data as ParcelRow[]);
    setLoadingList(false);
  }

  useEffect(() => {
    loadParcels();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin.trim() || !destination.trim() || !receiverName.trim() || !receiverPhone.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const { error } = await supabase.from("parcels").insert({
        sender_id: u.user.id,
        origin: origin.trim(),
        destination: destination.trim(),
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        size,
        weight_kg: weightKg,
        description: description.trim() || null,
        price,
      });
      if (error) throw error;

      toast.success("Parcel request sent! We'll notify you once a driver accepts.");
      setOrigin("");
      setDestination("");
      setReceiverName("");
      setReceiverPhone("");
      setSize("small");
      setWeightKg(1);
      setDescription("");
      loadParcels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send parcel request");
    } finally {
      setSubmitting(false);
    }
  }

  async function revealAndCopyCode(p: ParcelRow) {
    setRevealingId(p.id);
    let code = codes[p.id];
    if (!code) {
      const { data, error } = await supabase.rpc("get_parcel_dropoff_code", {
        _parcel_id: p.id,
      });
      if (error || !data) {
        setRevealingId(null);
        toast.error("Couldn't fetch the dropoff code");
        return;
      }
      code = data as string;
      setCodes((prev) => ({ ...prev, [p.id]: code! }));
    }
    navigator.clipboard.writeText(code);
    setRevealingId(null);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <AppShell title="Send a Parcel" subtitle="Get a package delivered along a matatu or bus route">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Send form */}
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-2xl border border-border bg-surface p-5"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Package className="size-4 text-primary" /> Parcel details
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              From
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. Kasarani"
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              To
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Ambassadeur"
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Receiver name
              <input
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Who's collecting it"
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Receiver phone
              <input
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                placeholder="07xx xxx xxx"
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Size</span>
            <div className="grid grid-cols-3 gap-2">
              {(["small", "medium", "large"] as ParcelSize[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition ${
                    size === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Weight (kg)
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={weightKg}
              onChange={(e) => setWeightKg(Math.max(0.1, Number(e.target.value)))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Description (optional)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Documents in a brown envelope"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Estimated price</span>
            <span className="font-semibold text-primary">KSh {price}</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Send className="size-4" /> {submitting ? "Sending…" : "Send parcel request"}
          </button>
        </form>

        {/* My parcels */}
        <div className="grid gap-3">
          <div className="text-sm font-semibold">Your parcels</div>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : parcels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No parcels sent yet — fill in the form to send your first one.
            </p>
          ) : (
            parcels.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin className="size-3.5 text-primary" />
                    {p.origin} → {p.destination}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  To {p.receiver_name} · {p.receiver_phone} · {p.size} · {p.weight_kg}kg · KSh{" "}
                  {p.price}
                </p>
                {p.status !== "cancelled" && (
                  <button
                    onClick={() => revealAndCopyCode(p)}
                    disabled={revealingId === p.id}
                    className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                  >
                    {copiedId === p.id ? (
                      <Check className="size-3.5 text-green-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {codes[p.id]
                      ? `Dropoff code: ${codes[p.id]}`
                      : revealingId === p.id
                        ? "Loading code…"
                        : "Show & copy dropoff code"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
