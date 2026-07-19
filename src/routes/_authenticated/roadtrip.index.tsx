// FILE: src/routes/_authenticated/roadtrip.index.tsx
// Whole-vehicle hire — deliberately separate from the seat-based matatu booking
// flow (ride.$routeId.tsx): here you're hiring the entire car/matatu for a
// custom trip, not a single seat on a fixed route. Pricing has no fixed fare —
// the owner quotes a price per request — so a request moves through
// requested -> quoted -> confirmed, with the same self-declared M-Pesa/cash
// payment trust model already used for matatu bookings.
//
// Anyone signed in can list a vehicle here, not just existing drivers/saccos —
// a private car owner with no other presence in the app can list too, since
// hire_listings.owner_id is just auth.users, with no dependency on the
// vehicles/driver tables the matatu side uses.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Car, MapPin, Phone, Plus, Check, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type Listing = {
  id: string;
  owner_id: string;
  sacco_name: string | null;
  vehicle_make: string;
  vehicle_model: string | null;
  plate_number: string;
  seats: number;
  location_name: string;
  contact_phone: string;
  is_active: boolean;
  created_at: string;
  photo_urls: string[];
};

type HireRequest = {
  id: string;
  listing_id: string;
  passenger_id: string;
  pickup_location: string;
  dropoff_location: string;
  trip_date: string;
  notes: string | null;
  status: "requested" | "quoted" | "confirmed" | "declined" | "cancelled" | "completed";
  quoted_price: number | null;
  payment_method: "mpesa" | "cash" | null;
  created_at: string;
};

const STATUS_LABEL: Record<HireRequest["status"], string> = {
  requested: "Waiting for a quote",
  quoted: "Quoted — pay to confirm",
  confirmed: "Confirmed",
  declined: "Declined by owner",
  cancelled: "Cancelled",
  completed: "Trip complete",
};

const STATUS_COLOR: Record<HireRequest["status"], string> = {
  requested: "bg-amber-100 text-amber-800",
  quoted: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  declined: "bg-secondary text-muted-foreground",
  cancelled: "bg-secondary text-muted-foreground",
  completed: "bg-green-100 text-green-800",
};

const LISTING_SELECT =
  "id,owner_id,sacco_name,vehicle_make,vehicle_model,plate_number,seats,location_name,contact_phone,is_active,created_at,photo_urls";
const REQUEST_SELECT =
  "id,listing_id,passenger_id,pickup_location,dropoff_location,trip_date,notes,status,quoted_price,payment_method,created_at";

export const Route = createFileRoute("/_authenticated/roadtrip/")({
  component: RoadTripPage,
});

function RoadTripPage() {
  const [tab, setTab] = useState<"browse" | "requests" | "my-listing">("browse");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  return (
    <AppShell
      title="Road Trip"
      subtitle="Hire a whole vehicle for a custom trip — the owner quotes you a price."
    >
      <div className="mb-4 flex gap-2 rounded-lg border border-border bg-surface p-1 text-sm">
        {(
          [
            { id: "browse", label: "Find a vehicle" },
            { id: "requests", label: "My requests" },
            { id: "my-listing", label: "List my vehicle" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "browse" && <BrowseListings userId={userId} />}
      {tab === "requests" && <MyRequests userId={userId} />}
      {tab === "my-listing" && <MyListing userId={userId} />}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Browse: every active listing except the signed-in user's own (requesting
// your own car makes no sense), each with a "Request this vehicle" form.
// ---------------------------------------------------------------------------
function BrowseListings({ userId }: { userId: string | null }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("hire_listings")
        .select(LISTING_SELECT)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (!error && data) setListings(data as Listing[]);
      setLoading(false);
    })();
  }, []);

  async function submitRequest(listingId: string) {
    if (!pickup.trim() || !dropoff.trim() || !tripDate) {
      return toast.error("Please fill in pickup, drop-off, and date");
    }
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("hire_requests").insert({
        listing_id: listingId,
        passenger_id: u.user.id,
        pickup_location: pickup.trim(),
        dropoff_location: dropoff.trim(),
        trip_date: tripDate,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Request sent. The owner will quote you a price.");
      setOpenId(null);
      setPickup("");
      setDropoff("");
      setTripDate("");
      setNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send request");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading vehicles…</p>;

  const visible = listings.filter((l) => l.owner_id !== userId);
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">No vehicles listed for hire yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {visible.map((l) => (
        <div key={l.id} className="rounded-xl border border-border bg-surface p-4">
          {l.photo_urls.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {l.photo_urls.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={`${l.vehicle_make} ${l.vehicle_model ?? ""} photo ${i + 1}`}
                  className="h-24 w-32 shrink-0 rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Car className="size-4 text-primary" />
                {l.vehicle_make} {l.vehicle_model ?? ""}
                {l.sacco_name && (
                  <span className="font-normal text-muted-foreground"> · {l.sacco_name}</span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {l.location_name} · {l.seats} seats
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="size-3" /> {l.contact_phone} · {l.plate_number}
              </p>
            </div>
            <button
              onClick={() => setOpenId(openId === l.id ? null : l.id)}
              className="shrink-0 rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              {openId === l.id ? "Cancel" : "Request this vehicle"}
            </button>
          </div>

          {openId === l.id && (
            <div className="mt-3 grid gap-2 border-t border-border pt-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Pickup location"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <input
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                  placeholder="Drop-off / destination"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <input
                type="date"
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional) — e.g. number of passengers, luggage"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => submitRequest(l.id)}
                disabled={submitting}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send request"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My requests: everything the signed-in user has requested, with a pay step
// once the owner has quoted a price — same self-declared trust model as the
// matatu manual-payment flow (Matu never touches the money or verifies it;
// the owner checks their own M-Pesa SMS before the trip).
// ---------------------------------------------------------------------------
function MyRequests({ userId }: { userId: string | null }) {
  const [requests, setRequests] = useState<HireRequest[]>([]);
  const [listingsById, setListingsById] = useState<Record<string, Listing>>({});
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  async function load() {
    if (!userId) return setLoading(false);
    const { data, error } = await supabase
      .from("hire_requests")
      .select(REQUEST_SELECT)
      .eq("passenger_id", userId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      const rows = data as HireRequest[];
      setRequests(rows);
      const listingIds = [...new Set(rows.map((r) => r.listing_id))];
      if (listingIds.length) {
        const { data: listings } = await supabase
          .from("hire_listings")
          .select(LISTING_SELECT)
          .in("id", listingIds);
        const map: Record<string, Listing> = {};
        (listings ?? []).forEach((l: Listing) => (map[l.id] = l));
        setListingsById(map);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function pay(requestId: string, method: "mpesa" | "cash") {
    setPayingId(requestId);
    const { error } = await supabase
      .from("hire_requests")
      .update({ status: "confirmed", payment_method: method })
      .eq("id", requestId);
    setPayingId(null);
    if (error) return toast.error(error.message);
    toast.success(
      method === "cash"
        ? "Confirmed. Pay the owner in cash on the day."
        : "Confirmed. The owner will verify your M-Pesa payment.",
    );
    load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading your requests…</p>;
  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">You haven't requested a vehicle yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {requests.map((r) => {
        const listing = listingsById[r.listing_id];
        return (
          <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {listing ? `${listing.vehicle_make} ${listing.vehicle_model ?? ""}` : "Vehicle"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.pickup_location} → {r.dropoff_location} · {r.trip_date}
                </p>
                {r.notes && <p className="mt-0.5 text-xs text-muted-foreground">{r.notes}</p>}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_COLOR[r.status]}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
            </div>

            {r.status === "quoted" && (
              <div className="mt-3 grid gap-2 border-t border-border pt-3">
                <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Quoted price</span>
                  <span className="font-semibold text-primary">KSh {r.quoted_price}</span>
                </div>
                {listing && (
                  <p className="text-xs text-muted-foreground">
                    Pay {listing.contact_phone} directly, then confirm below.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => pay(r.id, "mpesa")}
                    disabled={payingId === r.id}
                    className="flex-1 rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-60"
                  >
                    I've sent the payment (M-Pesa)
                  </button>
                  <button
                    onClick={() => pay(r.id, "cash")}
                    disabled={payingId === r.id}
                    className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
                  >
                    I'll pay cash
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My listing: create/toggle your own vehicle, and quote/decline incoming
// requests. Deliberately no role check here — a private car owner with no
// driver profile can list a car exactly the same way a sacco-affiliated
// driver can.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// My listings: an owner can list multiple vehicles (e.g. leasing several
// cars) — each with its own photos, active/paused toggle, and its own
// incoming requests to quote or decline. Deliberately no role check — a
// private car owner with no driver profile can list exactly the same way a
// sacco-affiliated driver can.
// ---------------------------------------------------------------------------
function MyListing({ userId }: { userId: string | null }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [requestsByListing, setRequestsByListing] = useState<Record<string, HireRequest[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [quoteInputs, setQuoteInputs] = useState<Record<string, string>>({});
  const [busyListingId, setBusyListingId] = useState<string | null>(null);

  // Form state, shared between "add a new vehicle" and "edit an existing
  // one" — editingId is null for a fresh listing, or the listing's id when
  // editing it in place.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saccoName, setSaccoName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [seats, setSeats] = useState(4);
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  async function load() {
    if (!userId) return setLoading(false);
    const { data } = await supabase
      .from("hire_listings")
      .select(LISTING_SELECT)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Listing[];
    setListings(rows);

    if (rows.length > 0) {
      const { data: reqs } = await supabase
        .from("hire_requests")
        .select(REQUEST_SELECT)
        .in(
          "listing_id",
          rows.map((l) => l.id),
        )
        .order("created_at", { ascending: false });
      const grouped: Record<string, HireRequest[]> = {};
      (reqs ?? []).forEach((r: HireRequest) => {
        (grouped[r.listing_id] ??= []).push(r);
      });
      setRequestsByListing(grouped);
    } else {
      setRequestsByListing({});
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function resetForm() {
    setEditingId(null);
    setSaccoName("");
    setMake("");
    setModel("");
    setPlate("");
    setSeats(4);
    setLocation("");
    setPhone("");
    setExistingPhotos([]);
    setNewPhotoFiles([]);
  }

  function openAddForm() {
    resetForm();
    setFormOpen(true);
  }

  function openEditForm(l: Listing) {
    setEditingId(l.id);
    setSaccoName(l.sacco_name ?? "");
    setMake(l.vehicle_make);
    setModel(l.vehicle_model ?? "");
    setPlate(l.plate_number);
    setSeats(l.seats);
    setLocation(l.location_name);
    setPhone(l.contact_phone);
    setExistingPhotos(l.photo_urls ?? []);
    setNewPhotoFiles([]);
    setFormOpen(true);
  }

  async function saveListing() {
    if (!make.trim() || !plate.trim() || !location.trim() || !phone.trim()) {
      return toast.error("Vehicle make, plate, location, and phone are required");
    }
    if (existingPhotos.length + newPhotoFiles.length > 5) {
      return toast.error("Only 5 photos allowed — remove one first");
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      let photoUrls = existingPhotos;
      if (newPhotoFiles.length > 0) {
        setUploadingPhotos(true);
        const uploaded: string[] = [];
        for (const file of newPhotoFiles) {
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("hire-listing-photos")
            .upload(path, file);
          if (uploadError) throw uploadError;
          const { data: pub } = supabase.storage.from("hire-listing-photos").getPublicUrl(path);
          uploaded.push(pub.publicUrl);
        }
        photoUrls = [...existingPhotos, ...uploaded];
        setUploadingPhotos(false);
      }

      const payload = {
        owner_id: u.user.id,
        sacco_name: saccoName.trim() || null,
        vehicle_make: make.trim(),
        vehicle_model: model.trim() || null,
        plate_number: plate.trim(),
        seats,
        location_name: location.trim(),
        contact_phone: phone.trim(),
        photo_urls: photoUrls,
      };
      const { error } = editingId
        ? await supabase.from("hire_listings").update(payload).eq("id", editingId)
        : await supabase.from("hire_listings").insert(payload);
      if (error) throw error;
      toast.success(editingId ? "Listing updated" : "Vehicle listed for hire");
      setFormOpen(false);
      resetForm();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save listing");
    } finally {
      setSaving(false);
      setUploadingPhotos(false);
    }
  }

  function removeExistingPhoto(url: string) {
    setExistingPhotos((prev) => prev.filter((p) => p !== url));
  }

  function handlePhotoPick(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files);
    const total = existingPhotos.length + newPhotoFiles.length + picked.length;
    if (total > 5) {
      toast.error("Only 5 photos allowed in total");
      return;
    }
    setNewPhotoFiles((prev) => [...prev, ...picked]);
  }

  async function toggleActive(l: Listing) {
    setBusyListingId(l.id);
    const { error } = await supabase
      .from("hire_listings")
      .update({ is_active: !l.is_active })
      .eq("id", l.id);
    setBusyListingId(null);
    if (error) return toast.error(error.message);
    load();
  }

  async function deleteListing(l: Listing) {
    const activeRequests = (requestsByListing[l.id] ?? []).filter((r) =>
      ["requested", "quoted", "confirmed"].includes(r.status),
    );
    if (activeRequests.length > 0) {
      toast.error(
        "This vehicle has an active or pending request. Decline or complete it before removing.",
      );
      return;
    }
    if (
      !window.confirm(
        `Remove ${l.vehicle_make} ${l.vehicle_model ?? ""} (${l.plate_number})? This can't be undone.`,
      )
    ) {
      return;
    }
    setBusyListingId(l.id);
    const { error } = await supabase.from("hire_listings").delete().eq("id", l.id);
    setBusyListingId(null);
    if (error) return toast.error(error.message);
    toast.success("Listing removed");
    setListings((prev) => prev.filter((x) => x.id !== l.id));
  }

  async function submitQuote(requestId: string) {
    const priceStr = quoteInputs[requestId];
    const price = Number(priceStr);
    if (!priceStr || Number.isNaN(price) || price <= 0) {
      return toast.error("Enter a valid price");
    }
    setQuotingId(requestId);
    const { error } = await supabase
      .from("hire_requests")
      .update({ status: "quoted", quoted_price: price })
      .eq("id", requestId);
    setQuotingId(null);
    if (error) return toast.error(error.message);
    toast.success("Quote sent");
    load();
  }

  async function declineRequest(requestId: string) {
    const { error } = await supabase
      .from("hire_requests")
      .update({ status: "declined" })
      .eq("id", requestId);
    if (error) return toast.error(error.message);
    load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Your vehicles {listings.length > 0 && `(${listings.length})`}
        </h2>
        {!formOpen && (
          <button
            onClick={openAddForm}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Plus className="size-3.5" /> List another vehicle
          </button>
        )}
      </div>

      {formOpen && (
        <div className="grid gap-3 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="size-4 text-primary" />
              {editingId ? "Edit vehicle" : "List a new vehicle"}
            </div>
            <button
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="text-xs font-medium text-muted-foreground underline"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Vehicle make (e.g. Toyota)"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model (optional, e.g. Noah)"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="Plate number"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))}
              placeholder="Seats"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <input
            value={saccoName}
            onChange={(e) => setSaccoName(e.target.value)}
            placeholder="Sacco name (optional — leave blank for a private car)"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where's the vehicle based (e.g. Nairobi CBD)"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Contact phone"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Photos of the vehicle (optional, up to 5)
            </label>
            <div className="flex flex-wrap gap-2">
              {existingPhotos.map((url) => (
                <div key={url} className="relative">
                  <img
                    src={url}
                    alt="Vehicle"
                    className="h-20 w-24 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeExistingPhoto(url)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {newPhotoFiles.map((file, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt="New upload"
                    className="h-20 w-24 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setNewPhotoFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {existingPhotos.length + newPhotoFiles.length < 5 && (
                <label className="flex h-20 w-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-secondary">
                  + Add
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoPick(e.target.files)}
                  />
                </label>
              )}
            </div>
          </div>

          <button
            onClick={saveListing}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving
              ? uploadingPhotos
                ? "Uploading photos…"
                : "Saving…"
              : editingId
                ? "Save changes"
                : "List this vehicle"}
          </button>
        </div>
      )}

      {listings.length === 0 && !formOpen && (
        <p className="text-sm text-muted-foreground">
          You haven't listed any vehicles yet. Tap "List another vehicle" above to add your first
          one.
        </p>
      )}

      {listings.map((l) => {
        const requests = requestsByListing[l.id] ?? [];
        return (
          <div key={l.id} className="rounded-2xl border border-border bg-surface p-5">
            {l.photo_urls.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto">
                {l.photo_urls.map((url, i) => (
                  <img
                    key={url}
                    src={url}
                    alt={`${l.vehicle_make} photo ${i + 1}`}
                    className="h-20 w-28 shrink-0 rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {l.vehicle_make} {l.vehicle_model ?? ""}
                  {l.sacco_name && (
                    <span className="font-normal text-muted-foreground"> · {l.sacco_name}</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {l.plate_number} · {l.seats} seats · {l.location_name}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => toggleActive(l)}
                  disabled={busyListingId === l.id}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                    l.is_active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {l.is_active ? "Active" : "Paused"}
                </button>
                <button
                  onClick={() => openEditForm(l)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteListing(l)}
                  disabled={busyListingId === l.id}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="size-3" /> Delete
                </button>
              </div>
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Requests for this vehicle
              </h3>
              {requests.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No requests yet.</p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {r.pickup_location} → {r.dropoff_location}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{r.trip_date}</p>
                          {r.notes && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{r.notes}</p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_COLOR[r.status]}`}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>

                      {r.status === "requested" && (
                        <div className="mt-3 flex gap-2 border-t border-border pt-3">
                          <input
                            type="number"
                            min={1}
                            placeholder="Quote (KSh)"
                            value={quoteInputs[r.id] ?? ""}
                            onChange={(e) =>
                              setQuoteInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                          />
                          <button
                            onClick={() => submitQuote(r.id)}
                            disabled={quotingId === r.id}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                          >
                            Send quote
                          </button>
                          <button
                            onClick={() => declineRequest(r.id)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {r.status === "confirmed" && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-green-700">
                          <Check className="size-3" /> Paid via{" "}
                          {r.payment_method === "cash"
                            ? "cash on the day"
                            : "M-Pesa (verify your SMS)"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
