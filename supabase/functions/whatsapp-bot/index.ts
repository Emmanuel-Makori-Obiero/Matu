// FILE: supabase/functions/whatsapp-bot/index.ts
// WhatsApp chatbot for Matu, built on Meta's free WhatsApp Cloud API.
//
// Covers everything the in-app assistant + booking + tracking + payment flow
// does, from a WhatsApp chat:
//   - search_routes / get_available_trips  -> "find me a matatu to Rongai"
//   - book_trip                            -> reserve a seat over chat
//   - get_my_bookings                      -> "what did I book?"
//   - get_vehicle_status                   -> "is my matatu coming?" / ETA +
//                                              whether it's nearly full
//   - pay_fare                             -> triggers a real M-Pesa STK push
//                                              to the rider's phone
//   - report_jam / check_jams              -> crowdsourced traffic reports
//
// SETUP REQUIRED before this works:
//   1. Create a Meta developer app -> add the "WhatsApp" product. Free test
//      phone number + a permanent token (System User token in Meta Business
//      Suite, so it doesn't expire after 24h like the default temp token).
//   2. Create a Google AI Studio key for Gemini (free tier is enough for a
//      low-volume bot): https://aistudio.google.com/apikey
//   3. Run the migration in this same commit
//      (20260721163015_whatsapp_bot_and_jam_reports.sql) first — it creates
//      whatsapp_users, whatsapp_sessions, jam_reports, get_recent_jams(),
//      and get_trip_occupancy(), which this function depends on.
//   4. Set edge function secrets:
//        supabase secrets set \
//          WHATSAPP_TOKEN=... \
//          WHATSAPP_PHONE_NUMBER_ID=... \
//          WHATSAPP_VERIFY_TOKEN=some-string-you-invent \
//          GEMINI_API_KEY=... \
//          MAPBOX_TOKEN=... \
//          MPESA_CONSUMER_KEY=... \
//          MPESA_CONSUMER_SECRET=... \
//          MPESA_CALLBACK_SECRET=...
//      (MPESA_* and MAPBOX_TOKEN are probably already set as secrets for
//      mpesa-stk-push / the web app — reuse the same values here. MAPBOX_TOKEN
//      is a plain secret, NOT the VITE_-prefixed one baked into the frontend
//      build, since Edge Functions can't read Vite env vars.)
//   5. Deploy: supabase functions deploy whatsapp-bot --no-verify-jwt
//      (--no-verify-jwt because Meta calls this anonymously, not with a
//      Supabase user JWT)
//   6. In the Meta app's WhatsApp -> Configuration page, set the webhook
//      callback URL to:
//        https://<project-ref>.functions.supabase.co/whatsapp-bot
//      and the verify token to the same WHATSAPP_VERIFY_TOKEN you set above.
//      Subscribe to the "messages" webhook field.
//   7. mpesa-callback already exists and will mark payments as paid when
//      Safaricom calls back — no changes needed there. Sandbox STK pushes
//      only actually land on Safaricom's test MSISDN 254708374149; see the
//      "TO GO LIVE" note in mpesa-stk-push/index.ts before using real money.
//
// Free-tier note: Meta does not charge for user-initiated conversations
// (anyone who messages the bot first) within the 24h window, and the first
// 1,000 business-initiated conversations per month are free. A bot that only
// ever replies to incoming messages stays free on the WhatsApp side.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_MODEL = "gemini-2.5-flash";
const MAPBOX_TOKEN = Deno.env.get("MAPBOX_TOKEN"); // optional — ETA tool degrades gracefully without it

// ---- M-Pesa (same sandbox config as supabase/functions/mpesa-stk-push) ----
const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY")!;
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET")!;
const MPESA_CALLBACK_SECRET = Deno.env.get("MPESA_CALLBACK_SECRET")!;
const MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"; // -> https://api.safaricom.co.ke in production
const MPESA_SHORTCODE = "174379"; // -> your real production shortcode when going live
const MPESA_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"; // sandbox passkey
const MPESA_CALLBACK_URL = `${SUPABASE_URL}/functions/v1/mpesa-callback?secret=${encodeURIComponent(MPESA_CALLBACK_SECRET)}`;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- WhatsApp send helper ----------
async function sendWhatsAppText(to: string, body: string) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false },
    }),
  });
  if (!res.ok) {
    console.error("WhatsApp send failed", await res.text());
  }
}

// ---------- Phone -> Supabase user mapping ----------
// Every WhatsApp number gets a real (passwordless) auth user behind the
// scenes so bookings/payments created by the bot satisfy the exact same
// passenger_id = auth.uid() RLS policies the passenger app already relies
// on — no special-cased "guest" write path to maintain.
async function getOrCreateUserForPhone(phone: string, waName?: string) {
  const { data: existing } = await admin
    .from("whatsapp_users")
    .select("user_id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return existing.user_id as string;

  const { data: created, error } = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: { full_name: waName ?? phone, via: "whatsapp" },
  });
  if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);

  await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: waName ?? null,
    phone,
  });
  await admin.from("whatsapp_users").insert({
    phone,
    user_id: created.user.id,
    display_name: waName ?? null,
  });
  return created.user.id as string;
}

// ---------- Session state (tiny, one row per phone) ----------
async function getSession(phone: string) {
  const { data } = await admin
    .from("whatsapp_sessions")
    .select("state, context")
    .eq("phone", phone)
    .maybeSingle();
  return data ?? { state: "idle", context: {} };
}

async function setSession(phone: string, state: string, context: Record<string, unknown>) {
  await admin
    .from("whatsapp_sessions")
    .upsert({ phone, state, context, updated_at: new Date().toISOString() });
}

// ---------- M-Pesa STK push (mirrors mpesa-stk-push, called server-side) ----------
async function initiateFareStkPush(phone: string, amount: number, bookingId: string) {
  const authRes = await fetch(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`) },
  });
  const authJson = await authRes.json();
  if (!authRes.ok || !authJson.access_token) {
    console.error("Safaricom auth failed", authJson);
    return { error: "Could not reach M-Pesa right now." };
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`);

  const stkRes = await fetch(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authJson.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(amount)),
      PartyA: phone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: `Matu-${bookingId.slice(0, 8)}`,
      TransactionDesc: "Matu fare",
    }),
  });
  const stkJson = await stkRes.json();
  if (!stkRes.ok || stkJson.ResponseCode !== "0") {
    console.error("STK push failed", stkJson);
    return { error: stkJson.errorMessage ?? "Payment request failed." };
  }

  const { error: insertError } = await admin.from("payments").insert({
    booking_id: bookingId,
    payer_id: null, // filled in by caller if needed; kept null-safe here
    amount,
    status: "pending",
    mpesa_checkout_request_id: stkJson.CheckoutRequestID,
  });
  if (insertError) console.error("Failed to record payment", insertError);

  return { checkoutRequestId: stkJson.CheckoutRequestID };
}

// ---------- Tools available to Gemini ----------
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search_routes",
        description: "Find matatu routes matching an origin and/or destination the rider typed.",
        parameters: {
          type: "OBJECT",
          properties: {
            origin: { type: "STRING", description: "Where the rider is starting from" },
            destination: { type: "STRING", description: "Where the rider wants to go" },
          },
        },
      },
      {
        name: "get_available_trips",
        description: "List scheduled/active trips with open seats on a specific route.",
        parameters: {
          type: "OBJECT",
          properties: { route_id: { type: "STRING" } },
          required: ["route_id"],
        },
      },
      {
        name: "book_trip",
        description:
          "Reserve a seat for the rider on a specific trip. Only call this after the rider has clearly confirmed which trip they want.",
        parameters: {
          type: "OBJECT",
          properties: { trip_id: { type: "STRING" } },
          required: ["trip_id"],
        },
      },
      {
        name: "get_my_bookings",
        description: "Look up the rider's own upcoming or recent bookings.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_vehicle_status",
        description:
          "Check on a specific booking's vehicle: how many minutes until it arrives (traffic-aware), how far away it is, and whether it's nearly full (seats taken vs capacity). Use this when the rider asks 'is my matatu coming', 'how full is it', or similar.",
        parameters: {
          type: "OBJECT",
          properties: { booking_id: { type: "STRING" } },
          required: ["booking_id"],
        },
      },
      {
        name: "pay_fare",
        description:
          "Trigger an M-Pesa STK push (payment prompt) to the rider's own phone so they can pay the fare for a specific booking. Only call this after the rider has confirmed they want to pay now.",
        parameters: {
          type: "OBJECT",
          properties: { booking_id: { type: "STRING" } },
          required: ["booking_id"],
        },
      },
      {
        name: "report_jam",
        description:
          "Record a traffic jam report from the rider on a route, so other riders and drivers see it.",
        parameters: {
          type: "OBJECT",
          properties: {
            route_id: { type: "STRING", description: "Route id if known" },
            location_text: {
              type: "STRING",
              description: "Free-text place name, e.g. 'Rongai roundabout'",
            },
            severity: { type: "STRING", enum: ["light", "moderate", "heavy"] },
          },
          required: ["location_text", "severity"],
        },
      },
      {
        name: "check_jams",
        description:
          "Check for recent, still-active jam reports and give a traffic insight, optionally filtered to a route.",
        parameters: {
          type: "OBJECT",
          properties: { route_id: { type: "STRING" } },
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION = `You are the Matu WhatsApp assistant for Kenyan matatu commuters.
Matu is a matatu booking and fleet management app. You can search routes, list
available trips with open seats and fares, book a seat once the rider clearly
confirms a specific trip, look up their bookings, check whether their booked
vehicle is close and how full it is, trigger an M-Pesa payment prompt for a
fare, and record or check crowdsourced traffic jam reports.

Rules:
- Reply in short, plain WhatsApp-style messages (no markdown headers, light use of
  emoji is fine, e.g. 🚐 for a trip, 🚦 for a jam, 💸 for payment).
- Never invent route names, fares, ETAs, seat counts, or trip times — only state
  what a tool call returned.
- Before calling book_trip, make sure the rider actually picked one option, not
  just described where they want to go.
- Before calling pay_fare, confirm the rider wants to pay now, and tell them a
  payment prompt is on the way to their phone — remind them to enter their
  M-Pesa PIN when it arrives.
- When reporting vehicle status, if seats_available is low (say, 2 or fewer)
  or 0, clearly say the vehicle is nearly full or full.
- If asked about anything outside Matu (routes, bookings, jams, payments, general
  app questions), politely say you can only help with Matu.
- Match the rider's language style: if they write in Sheng or Swahili, reply
  naturally in kind; otherwise use plain English.`;

// ---------- Tool execution ----------
async function execTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  phone: string,
) {
  switch (name) {
    case "search_routes": {
      let q = admin.from("routes").select("id, name, origin, destination, base_fare").limit(5);
      if (args.origin) q = q.ilike("origin", `%${args.origin}%`);
      if (args.destination) q = q.ilike("destination", `%${args.destination}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { routes: data };
    }
    case "get_available_trips": {
      const { data, error } = await admin
        .from("trips")
        .select("id, status, fare, started_at, vehicle_id")
        .eq("route_id", args.route_id)
        .in("status", ["scheduled", "in_progress"])
        .limit(5);
      if (error) return { error: error.message };
      return { trips: data };
    }
    case "book_trip": {
      const { data: trip, error: tripErr } = await admin
        .from("trips")
        .select("id, fare, route_id")
        .eq("id", args.trip_id)
        .maybeSingle();
      if (tripErr || !trip) return { error: "Trip not found." };
      const { data: booking, error } = await admin
        .from("bookings")
        .insert({ trip_id: trip.id, passenger_id: userId, status: "reserved" })
        .select("id, seat_number")
        .single();
      if (error) return { error: error.message };
      return { booking, fare: trip.fare };
    }
    case "get_my_bookings": {
      const { data, error } = await admin
        .from("bookings")
        .select("id, status, fare_paid, created_at, trips(route_id, fare)")
        .eq("passenger_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return { error: error.message };
      return { bookings: data };
    }
    case "get_vehicle_status": {
      const { data: booking, error: bookingErr } = await admin
        .from("bookings")
        .select("id, trip_id, passenger_id, pickup_stage_id")
        .eq("id", args.booking_id)
        .maybeSingle();
      if (bookingErr || !booking) return { error: "Booking not found." };
      if (booking.passenger_id !== userId) return { error: "This booking isn't yours." };

      const { data: trip, error: tripErr } = await admin
        .from("trips")
        .select("id, status, current_lat, current_lng, vehicle_id")
        .eq("id", booking.trip_id)
        .maybeSingle();
      if (tripErr || !trip) return { error: "Trip not found." };

      const { data: occupancy } = await admin.rpc("get_trip_occupancy", { p_trip_id: trip.id });
      const occ = occupancy?.[0];
      const nearlyFull = occ != null && occ.capacity > 0 ? occ.seats_available <= 2 : null;

      let etaMinutes: number | null = null;
      let distanceMeters: number | null = null;
      if (
        MAPBOX_TOKEN &&
        trip.current_lat != null &&
        trip.current_lng != null &&
        booking.pickup_stage_id
      ) {
        const { data: stage } = await admin
          .from("stages")
          .select("lat, lng")
          .eq("id", booking.pickup_stage_id)
          .maybeSingle();
        if (stage) {
          try {
            const url =
              `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
              `${trip.current_lng},${trip.current_lat};${stage.lng},${stage.lat}` +
              `?overview=false&access_token=${MAPBOX_TOKEN}`;
            const res = await fetch(url);
            if (res.ok) {
              const json = await res.json();
              const route = json.routes?.[0];
              if (route) {
                etaMinutes = Math.round(route.duration / 60);
                distanceMeters = Math.round(route.distance);
              }
            }
          } catch (err) {
            console.error("Mapbox ETA lookup failed", err);
          }
        }
      }

      return {
        trip_status: trip.status,
        eta_minutes: etaMinutes,
        distance_meters: distanceMeters,
        seats_taken: occ?.seats_taken ?? null,
        seats_available: occ?.seats_available ?? null,
        capacity: occ?.capacity ?? null,
        nearly_full: nearlyFull,
      };
    }
    case "pay_fare": {
      const { data: booking, error: bookingErr } = await admin
        .from("bookings")
        .select("id, passenger_id, fare_paid, trips(fare)")
        .eq("id", args.booking_id)
        .maybeSingle();
      if (bookingErr || !booking) return { error: "Booking not found." };
      if (booking.passenger_id !== userId) return { error: "This booking isn't yours." };

      let normalizedPhone = phone.replace(/^\+/, "");
      if (normalizedPhone.startsWith("0")) normalizedPhone = "254" + normalizedPhone.slice(1);
      if (!/^254\d{9}$/.test(normalizedPhone)) {
        return { error: "Need a valid Safaricom number to send the payment prompt to." };
      }

      const fare = (booking as unknown as { trips: { fare: number } }).trips?.fare;
      if (!fare) return { error: "Couldn't find the fare amount for this booking." };

      const result = await initiateFareStkPush(normalizedPhone, fare, booking.id);
      if ("error" in result) return result;
      return { prompt_sent: true, amount: fare, checkout_request_id: result.checkoutRequestId };
    }
    case "report_jam": {
      const { data, error } = await admin
        .from("jam_reports")
        .insert({
          route_id: args.route_id ?? null,
          location_text: args.location_text,
          severity: args.severity ?? "moderate",
          reported_by: userId,
          source: "whatsapp",
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      return { reported: true, id: data.id };
    }
    case "check_jams": {
      const { data, error } = await admin.rpc("get_recent_jams", {
        p_route_id: args.route_id ?? null,
      });
      if (error) return { error: error.message };
      return { jams: data };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// ---------- Gemini turn (handles one round of tool calling) ----------
async function runGemini(
  history: { role: string; parts: unknown[] }[],
  userId: string,
  phone: string,
) {
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: history,
    tools: TOOLS,
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
  const json = await res.json();
  const candidate = json.candidates?.[0];
  const parts: any[] = candidate?.content?.parts ?? [];

  const functionCalls = parts.filter((p) => p.functionCall);
  if (functionCalls.length > 0) {
    // Run every requested tool call, feed results back, then let the model
    // produce the final text reply in a second round.
    history.push({ role: "model", parts });
    const responseParts = [];
    for (const p of functionCalls) {
      const result = await execTool(p.functionCall.name, p.functionCall.args ?? {}, userId, phone);
      responseParts.push({
        functionResponse: { name: p.functionCall.name, response: result },
      });
    }
    history.push({ role: "function", parts: responseParts });
    return runGemini(history, userId, phone);
  }

  const text = parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return { text: text || "Sorry, I didn't quite get that — could you rephrase?", history };
}

// ---------- HTTP entry point ----------
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta webhook verification handshake (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const entry = payload?.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];
    if (!message) {
      // Delivery/read status callbacks land here too — just ack them.
      return new Response("ok", { status: 200 });
    }

    const from: string = message.from; // E.164 without leading +
    const phone = from.startsWith("+") ? from : `+${from}`;
    const text: string | undefined = message.text?.body;
    const waName: string | undefined = entry?.contacts?.[0]?.profile?.name;

    if (!text) {
      await sendWhatsAppText(
        from,
        "I can only read text messages right now 🙂 — try typing your question.",
      );
      return new Response("ok", { status: 200 });
    }

    const userId = await getOrCreateUserForPhone(phone, waName);
    const session = await getSession(phone);

    // Session context currently just carries conversation continuity; kept
    // deliberately thin (last few turns) rather than full history to keep
    // each Gemini call small and cheap.
    const priorTurns = (session.context?.turns as { role: string; parts: unknown[] }[]) ?? [];
    const history = [...priorTurns, { role: "user", parts: [{ text }] }];

    const { text: reply, history: finalHistory } = await runGemini(history, userId, phone);

    await sendWhatsAppText(from, reply);

    // Keep only the last 3 user/model turns (not the raw function-call
    // scaffolding) so context doesn't grow unbounded.
    const trimmed = finalHistory.filter((h) => h.role === "user" || h.role === "model").slice(-6);
    await setSession(phone, "idle", { turns: trimmed });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("whatsapp-bot error", err);
    return new Response("ok", { status: 200 }); // always 200 so Meta doesn't retry-storm
  }
});
