// FILE: supabase/functions/send-trip-push/index.ts
// Sends real Web Push notifications — the kind that show up in the phone's
// notification bar even when Matu isn't the open tab (e.g. the passenger is
// in WhatsApp). Called by the DRIVER's client, since the driver's screen is
// expected to stay active/foregrounded while driving (screen wake lock is
// already held during a trip), which makes it the reliable place to trigger
// these rather than relying on a passenger's backgrounded tab to do it.
//
// Two shapes:
//   { type: "progress", trip_id, lat, lng }
//     -> for every passenger with an active booking on this trip, pushes a
//        notification with the same `tag` each time, so it UPDATES the
//        existing notification in place (distance/percent text) instead of
//        stacking a new one — the closest a browser notification can get to
//        Bolt's live-updating progress line.
//   { type: "arrived", trip_id, stage_id }
//     -> pushes a one-off "driver has arrived" notification (distinct tag,
//        so it doesn't get silently replaced by a progress update) to every
//        passenger waiting to board at that stage.
//
// SETUP REQUIRED before this works:
//   1. Generate a VAPID key pair once: `npx web-push generate-vapid-keys`
//   2. Set edge function secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
//      (supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...)
//   3. Put the SAME public key in the frontend as VITE_VAPID_PUBLIC_KEY
//      (see src/lib/push-notifications.ts) — the client needs it to create
//      a push subscription that this key pair is allowed to send to.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:support@matu.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

type PushSub = { endpoint: string; p256dh: string; auth: string };

// Sends to every subscription a user has (phone + laptop etc.) and quietly
// deletes any that the push service reports as gone (410/404) — a stale
// subscription otherwise just fails silently forever.
async function sendToUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>,
) {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;
  await Promise.all(
    (subs as PushSub[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("[send-trip-push] push failed:", err);
        }
      }
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "Push notifications are not configured yet" }), {
      status: 501,
      headers: cors(),
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: cors(),
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: cors(),
      });
    }

    const body = await req.json();
    const { type, trip_id } = body as { type: string; trip_id: string };
    if (!type || !trip_id) {
      return new Response(JSON.stringify({ error: "Missing type or trip_id" }), {
        status: 400,
        headers: cors(),
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Only the trip's own driver may trigger pushes for it — otherwise
    // anyone with a valid Matu login could spam another driver's passengers.
    const { data: trip, error: tripError } = await admin
      .from("trips")
      .select("id,driver_id,vehicle_id,route_id,status")
      .eq("id", trip_id)
      .single();
    if (tripError || !trip || trip.driver_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: cors(),
      });
    }

    if (type === "progress") {
      const { lat, lng } = body as { lat?: number; lng?: number };
      if (typeof lat !== "number" || typeof lng !== "number") {
        return new Response(JSON.stringify({ error: "Missing lat/lng" }), {
          status: 400,
          headers: cors(),
        });
      }
      const { data: bookings } = await admin
        .from("bookings")
        .select("id,passenger_id,status,pickup_stage_id,dropoff_stage_id")
        .eq("trip_id", trip_id)
        .not("status", "in", "(cancelled,alighted)");
      const active = (bookings ?? []).filter((b) => b.passenger_id);
      if (active.length === 0) {
        return new Response(JSON.stringify({ success: true, notified: 0 }), {
          headers: { ...cors(), "Content-Type": "application/json" },
        });
      }
      const stageIds = [
        ...new Set(
          active
            .map((b) => (b.status === "boarded" ? b.dropoff_stage_id : b.pickup_stage_id))
            .filter((x): x is string => !!x),
        ),
      ];
      const { data: stages } = await admin
        .from("stages")
        .select("id,name,lat,lng")
        .in("id", stageIds.length ? stageIds : ["00000000-0000-0000-0000-000000000000"]);
      const stageMap: Record<string, { name: string; lat: number; lng: number }> = {};
      (stages ?? []).forEach((s) => (stageMap[s.id] = s));

      let notified = 0;
      await Promise.all(
        active.map(async (b) => {
          const targetStageId = b.status === "boarded" ? b.dropoff_stage_id : b.pickup_stage_id;
          const stage = targetStageId ? stageMap[targetStageId] : null;
          if (!stage) return;
          const meters = haversineMeters({ lat, lng }, stage);
          const km = meters / 1000;
          const body =
            km < 0.15
              ? `Almost at ${stage.name} — under 150m away`
              : `${km.toFixed(1)} km from ${stage.name}`;
          await sendToUser(admin, b.passenger_id as string, {
            title: "Your matatu is on the way",
            body,
            tag: `matu-progress-${trip_id}`, // same tag every time -> replaces in place
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            data: { url: `/ride/track/${b.id}` },
          });
          notified++;
        }),
      );
      return new Response(JSON.stringify({ success: true, notified }), {
        headers: { ...cors(), "Content-Type": "application/json" },
      });
    }

    if (type === "arrived") {
      const { stage_id } = body as { stage_id?: string };
      if (!stage_id) {
        return new Response(JSON.stringify({ error: "Missing stage_id" }), {
          status: 400,
          headers: cors(),
        });
      }
      const [{ data: stage }, { data: vehicle }, { data: bookings }] = await Promise.all([
        admin.from("stages").select("id,name").eq("id", stage_id).single(),
        admin.from("vehicles").select("plate_number,nickname").eq("id", trip.vehicle_id).single(),
        admin
          .from("bookings")
          .select("id,passenger_id,status")
          .eq("trip_id", trip_id)
          .eq("pickup_stage_id", stage_id)
          .not("status", "in", "(cancelled,alighted,boarded)"),
      ]);
      const waiting = (bookings ?? []).filter((b) => b.passenger_id);
      const vehicleLabel = vehicle
        ? `${vehicle.plate_number}${vehicle.nickname ? ` · ${vehicle.nickname}` : ""}`
        : "Your matatu";

      let notified = 0;
      await Promise.all(
        waiting.map(async (b) => {
          await sendToUser(admin, b.passenger_id as string, {
            title: "Your matatu has arrived!",
            body: `${vehicleLabel} is at ${stage?.name ?? "your stage"} now.`,
            tag: `matu-arrived-${b.id}`, // distinct per booking, won't be silently replaced by a later progress update
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 400],
            data: { url: `/ride/track/${b.id}` },
          });
          notified++;
        }),
      );
      return new Response(JSON.stringify({ success: true, notified }), {
        headers: { ...cors(), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
      status: 400,
      headers: cors(),
    });
  } catch (err) {
    console.error("[send-trip-push] unexpected error:", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: cors(),
    });
  }
});
