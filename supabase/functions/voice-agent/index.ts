// FILE: supabase/functions/voice-agent/index.ts
// This is the actual phone agent. Twilio opens a WebSocket here (per active call)
// carrying raw 8kHz mulaw audio in both directions. We open a second WebSocket to
// OpenAI's Realtime API and pipe audio straight through — OpenAI does speech-to-speech
// natively (no separate STT/TTS step), which is what lets it sound like a person
// switching between Swahili and English mid-sentence instead of a robotic IVR.
//
// Required secrets (set via `supabase secrets set`):
//   OPENAI_API_KEY
//   SUPABASE_URL              (auto-available, but set explicitly for clarity)
//   SUPABASE_SERVICE_ROLE_KEY (needed to read/write bookings on the caller's behalf)

import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SYSTEM_PROMPT = `You are the Matu voice assistant — a friendly Nairobi matatu booking line,
not a call center robot. Talk the way a helpful conductor or a sharp friend would: warm, brief,
natural. Mix Swahili and English the way Nairobians actually talk (Sheng is fine) — mirror
whichever language or mix the caller uses. Never say things like "I am an AI" or read out menus
("press 1 for..."). Just have a normal conversation.

What you can actually do, using your tools:
- Check if there are matatus available on a route right now, and how many seats are left.
- Tell a caller with an active booking how far their matatu still has to go and when it'll arrive.
- Book a seat for them on a route, given a pickup stage and drop-off stage.

Keep responses short — this is a phone call, not a chat window. Confirm details back before
booking ("Kwa hivyo, unataka seat moja kutoka Kasarani kwenda Town, sawa?") so nothing gets
booked by mistake. If you're not sure which route or stage they mean, ask — don't guess and
book the wrong thing.`;

const TOOLS = [
  {
    type: "function",
    name: "check_seats_available",
    description:
      "Check active matatus on a route right now and how many seats are left on each. Use the route's common name or origin/destination the caller mentions.",
    parameters: {
      type: "object",
      properties: {
        route_query: {
          type: "string",
          description:
            "Route name, origin, or destination as the caller said it, e.g. 'Kasarani to Town'",
        },
      },
      required: ["route_query"],
    },
  },
  {
    type: "function",
    name: "get_my_active_trip_status",
    description:
      "Get the caller's current active booking: which vehicle, how far remaining to their drop-off, and ETA. Use when the caller asks 'where is my matatu' or similar.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "book_seat",
    description:
      "Book one seat for the caller on a specific active trip. Only call this after confirming route, pickup stage, and drop-off stage with the caller out loud.",
    parameters: {
      type: "object",
      properties: {
        route_query: { type: "string", description: "Route name or origin/destination" },
        pickup_stage_query: {
          type: "string",
          description: "Pickup stage name as the caller said it",
        },
        dropoff_stage_query: {
          type: "string",
          description: "Drop-off stage name as the caller said it",
        },
      },
      required: ["route_query", "pickup_stage_query", "dropoff_stage_query"],
    },
  },
];

// --- Tool implementations, backed directly by your existing Supabase schema ---

async function findRoute(query: string) {
  const { data } = await supabase
    .from("routes")
    .select("id,name,origin,destination")
    .or(`name.ilike.%${query}%,origin.ilike.%${query}%,destination.ilike.%${query}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

async function toolCheckSeatsAvailable(args: { route_query: string }) {
  const route = await findRoute(args.route_query);
  if (!route) return { found: false, message: "Route haikupatikana. Uliza jina lingine." };

  const { data: trips } = await supabase
    .from("trips")
    .select("id,vehicle_id")
    .eq("route_id", route.id)
    .in("status", ["boarding", "in_transit"]);

  if (!trips || trips.length === 0) {
    return {
      found: true,
      route: route.name,
      vehicles: [],
      message: "Hakuna matatu active sasa hivi kwa hio route.",
    };
  }

  const results = await Promise.all(
    trips.map(async (t) => {
      const [{ data: vehicle }, { data: bookedCount }] = await Promise.all([
        supabase
          .from("vehicles")
          .select("plate_number,nickname,capacity")
          .eq("id", t.vehicle_id)
          .maybeSingle(),
        supabase.rpc("get_trip_booked_count", { _trip_id: t.id }),
      ]);
      const capacity = vehicle?.capacity ?? 14;
      const seatsLeft = Math.max(capacity - Number(bookedCount ?? 0), 0);
      return {
        plate: vehicle?.plate_number ?? "unknown",
        nickname: vehicle?.nickname ?? null,
        seatsLeft,
      };
    }),
  );

  return { found: true, route: route.name, vehicles: results };
}

async function toolGetMyActiveTripStatus(callerPhone: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", callerPhone)
    .maybeSingle();
  if (!profile) return { found: false, message: "Sikuweza pata account yako na hii number." };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id,trip_id,dropoff_stage_id")
    .eq("passenger_id", profile.id)
    .in("status", ["reserved", "confirmed", "boarded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!booking) return { found: false, message: "Huna booking ya sasa hivi." };

  const { data: trip } = await supabase
    .from("trips")
    .select("id,vehicle_id,status,current_lat,current_lng")
    .eq("id", booking.trip_id)
    .maybeSingle();
  if (!trip) return { found: false, message: "Trip haikupatikana." };

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("plate_number,nickname")
    .eq("id", trip.vehicle_id)
    .maybeSingle();

  const { data: dropoff } = booking.dropoff_stage_id
    ? await supabase
        .from("stages")
        .select("name,lat,lng")
        .eq("id", booking.dropoff_stage_id)
        .maybeSingle()
    : { data: null };

  let etaMinutes: number | null = null;
  let distanceKm: number | null = null;
  if (trip.current_lat != null && trip.current_lng != null && dropoff) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${trip.current_lng},${trip.current_lat};${dropoff.lng},${dropoff.lat}?overview=false`;
      const res = await fetch(url);
      const json = await res.json();
      const r = json.routes?.[0];
      if (r) {
        etaMinutes = Math.round(r.duration / 60);
        distanceKm = Math.round((r.distance / 1000) * 10) / 10;
      }
    } catch {
      // leave as null — the model will say it can't tell right now
    }
  }

  return {
    found: true,
    vehiclePlate: vehicle?.plate_number ?? "unknown",
    vehicleNickname: vehicle?.nickname ?? null,
    status: trip.status,
    dropoffName: dropoff?.name ?? null,
    etaMinutes,
    distanceKm,
  };
}

async function toolBookSeat(
  callerPhone: string,
  args: { route_query: string; pickup_stage_query: string; dropoff_stage_query: string },
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", callerPhone)
    .maybeSingle();
  if (!profile)
    return {
      success: false,
      message: "Sikuweza pata account yako na hii number. Lazima ujisajili kwa app kwanza.",
    };

  const route = await findRoute(args.route_query);
  if (!route) return { success: false, message: "Route haikupatikana." };

  const { data: stages } = await supabase.from("stages").select("id,name").eq("route_id", route.id);
  const pickup = (stages ?? []).find((s) =>
    s.name.toLowerCase().includes(args.pickup_stage_query.toLowerCase()),
  );
  const dropoff = (stages ?? []).find((s) =>
    s.name.toLowerCase().includes(args.dropoff_stage_query.toLowerCase()),
  );
  if (!pickup || !dropoff) {
    return { success: false, message: "Sikupata hiyo stage. Tafadhali sema jina lingine." };
  }

  const { data: trips } = await supabase
    .from("trips")
    .select("id,fare,vehicle_id")
    .eq("route_id", route.id)
    .in("status", ["boarding", "in_transit"]);
  if (!trips || trips.length === 0) {
    return { success: false, message: "Hakuna matatu active kwa hio route sasa hivi." };
  }

  // Pick the first trip that still has room.
  let chosenTrip: { id: string; fare: number } | null = null;
  for (const t of trips) {
    const [{ data: vehicle }, { data: bookedCount }] = await Promise.all([
      supabase.from("vehicles").select("capacity").eq("id", t.vehicle_id).maybeSingle(),
      supabase.rpc("get_trip_booked_count", { _trip_id: t.id }),
    ]);
    const capacity = vehicle?.capacity ?? 14;
    if (Number(bookedCount ?? 0) < capacity) {
      chosenTrip = { id: t.id, fare: t.fare };
      break;
    }
  }
  if (!chosenTrip)
    return { success: false, message: "Magari yote yamejaa kwa hio route sasa hivi." };

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      trip_id: chosenTrip.id,
      passenger_id: profile.id,
      pickup_stage_id: pickup.id,
      dropoff_stage_id: dropoff.id,
      status: "reserved",
    })
    .select("id")
    .single();
  if (error) return { success: false, message: "Kuna hitilafu, jaribu tena." };

  // Payment isn't collected over the call — passenger completes M-Pesa/cash in the
  // app the same way as a normal booking, or the conductor collects cash on board.
  return {
    success: true,
    bookingId: booking.id,
    fare: chosenTrip.fare,
    message: `Nimekubooki seat kutoka ${pickup.name} kwenda ${dropoff.name}. Fare ni KSh ${chosenTrip.fare}. Lipa kupitia app au kwa conductor.`,
  };
}

// --- WebSocket bridge ---

Deno.serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  const { socket: twilioWs, response } = Deno.upgradeWebSocket(req);

  let streamSid = "";
  let callerPhone = "";
  let openaiWs: WebSocket | null = null;

  twilioWs.onopen = () => {
    openaiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
      // Deno's WebSocket doesn't take custom headers directly for auth in all runtimes;
      // Supabase Edge Functions (Deno Deploy) support passing headers via this form.
      ["realtime", `openai-insecure-api-key.${OPENAI_API_KEY}`, "openai-beta.realtime-v1"],
    );

    openaiWs.onopen = () => {
      openaiWs!.send(
        JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            instructions: SYSTEM_PROMPT,
            voice: "alloy",
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            turn_detection: { type: "server_vad" },
            tools: TOOLS,
            tool_choice: "auto",
          },
        }),
      );
    };

    openaiWs.onmessage = async (evt) => {
      const msg = JSON.parse(evt.data);

      if (msg.type === "response.audio.delta" && msg.delta) {
        twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: msg.delta } }));
      }

      if (msg.type === "response.function_call_arguments.done") {
        const args = JSON.parse(msg.arguments || "{}");
        let result: unknown;
        try {
          if (msg.name === "check_seats_available") {
            result = await toolCheckSeatsAvailable(args);
          } else if (msg.name === "get_my_active_trip_status") {
            result = await toolGetMyActiveTripStatus(callerPhone);
          } else if (msg.name === "book_seat") {
            result = await toolBookSeat(callerPhone, args);
          } else {
            result = { error: "unknown tool" };
          }
        } catch {
          result = { error: "tool failed" };
        }

        openaiWs!.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: msg.call_id,
              output: JSON.stringify(result),
            },
          }),
        );
        openaiWs!.send(JSON.stringify({ type: "response.create" }));
      }
    };
  };

  twilioWs.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      callerPhone = msg.start.customParameters?.callerPhone ?? "";
    }

    if (msg.event === "media" && openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(
        JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media.payload }),
      );
    }

    if (msg.event === "stop") {
      openaiWs?.close();
    }
  };

  twilioWs.onclose = () => openaiWs?.close();

  return response;
});
