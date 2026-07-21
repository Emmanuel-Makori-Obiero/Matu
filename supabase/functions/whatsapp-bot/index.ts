// FILE: supabase/functions/whatsapp-bot/index.ts
// WhatsApp chatbot for Matu, built on Meta's free WhatsApp Cloud API.
// Does the same job as src/components/matu/AIAssistant.tsx (search routes,
// check available trips, answer questions) plus two things the in-app
// assistant can't do on its own: actually BOOK a seat over chat, and
// report/check traffic jams on a route.
//
// SETUP REQUIRED before this works:
//   1. Create a Meta developer app -> add the "WhatsApp" product. This gives
//      you a free test phone number + a permanent token once you generate
//      one (System User token in Meta Business Suite -> avoids the 24h
//      temporary token).
//   2. Set edge function secrets:
//        supabase secrets set \
//          WHATSAPP_TOKEN=... \
//          WHATSAPP_PHONE_NUMBER_ID=... \
//          WHATSAPP_VERIFY_TOKEN=some-string-you-invent \
//          GEMINI_API_KEY=...
//   3. Deploy: supabase functions deploy whatsapp-bot --no-verify-jwt
//      (--no-verify-jwt because Meta calls this anonymously, not with a
//      Supabase user JWT)
//   4. In the Meta app's WhatsApp -> Configuration page, set the webhook
//      callback URL to:
//        https://<project-ref>.functions.supabase.co/whatsapp-bot
//      and the verify token to the same WHATSAPP_VERIFY_TOKEN you set above.
//      Subscribe to the "messages" webhook field.
//   5. Run the migration in this same commit
//      (20260721163015_whatsapp_bot_and_jam_reports.sql) so whatsapp_users,
//      whatsapp_sessions, and jam_reports exist.
//
// Free-tier note: Meta does not charge for user-initiated conversations
// (anyone who messages the bot first) within the 24h window, and the first
// 1,000 business-initiated conversations per month are free. For a bot that
// only ever replies to incoming messages, this stays free.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_MODEL = "gemini-2.5-flash";

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
// scenes so bookings created by the bot satisfy the exact same
// passenger_id = auth.uid() RLS policies the passenger app already relies
// on — no special-cased "guest booking" write path to maintain.
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
        description: "Check for recent, still-active jam reports, optionally filtered to a route.",
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
confirms a specific trip, look up their bookings, and record or check crowdsourced
traffic jam reports.

Rules:
- Reply in short, plain WhatsApp-style messages (no markdown headers, light use of
  emoji is fine, e.g. 🚐 for a trip, 🚦 for a jam).
- Never invent route names, fares, or trip times — only state what a tool call
  returned.
- Before calling book_trip, make sure the rider actually picked one option, not
  just described where they want to go.
- If asked about anything outside Matu (routes, bookings, jams, general app
  questions), politely say you can only help with Matu.
- Match the rider's language style: if they write in Sheng or Swahili, reply
  naturally in kind; otherwise use plain English.`;

// ---------- Tool execution ----------
async function execTool(name: string, args: Record<string, unknown>, userId: string) {
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
async function runGemini(history: { role: string; parts: unknown[] }[], userId: string) {
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
      const result = await execTool(p.functionCall.name, p.functionCall.args ?? {}, userId);
      responseParts.push({
        functionResponse: { name: p.functionCall.name, response: result },
      });
    }
    history.push({ role: "function", parts: responseParts });
    return runGemini(history, userId);
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

    const { text: reply, history: finalHistory } = await runGemini(history, userId);

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
