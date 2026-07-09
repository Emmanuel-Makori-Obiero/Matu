// FILE: supabase/functions/ai-assistant/index.ts
// Deploy: Supabase Dashboard -> Edge Functions -> Create function named "ai-assistant"
//         -> paste this file -> Deploy.
// Secret required: GEMINI_API_KEY (Dashboard -> Edge Functions -> Secrets)
//   Get a free key at https://aistudio.google.com/apikey (no credit card, 1500 req/day
//   free on gemini-2.5-flash as of mid-2026).
//
// Contract with the frontend (src/components/matu/AIAssistant.tsx):
//   Request:  { message: string, history: [...], page: string, details?: string }
//   Response: { reply: string, matchedRoutes?: RouteRow[] }
//
// Design: the model NEVER invents a route link, seat, fare, or payment status itself.
// It can only act by calling the provided tools, which hit the real database (or the
// real mpesa-stk-push function for payment). The route cards and booking summaries
// shown to the user are only ever built from what a tool call actually returned.
//
// IMPORTANT — payments: this agent NEVER asks for or handles an M-Pesa PIN/password.
// book_seat only triggers the same STK push flow the app already uses — Safaricom then
// prompts the customer for their PIN on their own phone, entirely outside this app.
// Do not add a field anywhere that collects a PIN/password and sends it through here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Service-role client: used for read tools (search/availability) so results are
// consistent regardless of RLS. Booking/payment tools additionally require a real
// authenticated user (see getUserFromRequest) — the service role is never used to
// impersonate a passenger, only to perform the insert on their behalf once verified.
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

type RouteRow = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  base_fare: number | null;
};

// ---- Tool implementations (query the real DB, nothing invented) ----

async function searchRoutes(query: string): Promise<RouteRow[]> {
  const like = `%${query.trim()}%`;
  const { data } = await supabase
    .from("routes")
    .select("id,name,origin,destination,base_fare")
    .or(`origin.ilike.${like},destination.ilike.${like},name.ilike.${like}`)
    .limit(5);
  return (data ?? []) as RouteRow[];
}

async function getAvailableTrips(routeId: string) {
  const { data: trips } = await supabase
    .from("trips")
    .select("id,status,fare,vehicle_id,started_at,vehicles(capacity,plate_number,vehicle_type)")
    .eq("route_id", routeId)
    .in("status", ["scheduled", "boarding"])
    .limit(10);

  if (!trips || trips.length === 0) return { trips: [] };

  const tripIds = trips.map((t) => t.id);
  const { data: bookings } = await supabase
    .from("bookings")
    .select("trip_id")
    .in("trip_id", tripIds)
    .in("status", ["confirmed", "boarded"]);

  const bookedCount: Record<string, number> = {};
  (bookings ?? []).forEach((b) => {
    bookedCount[b.trip_id] = (bookedCount[b.trip_id] ?? 0) + 1;
  });

  return {
    trips: trips.map((t) => {
      // deno-lint-ignore no-explicit-any
      const vehicle = t.vehicles as any;
      const capacity = vehicle?.capacity ?? 0;
      const booked = bookedCount[t.id] ?? 0;
      return {
        trip_id: t.id,
        status: t.status,
        fare: t.fare,
        vehicle_type: vehicle?.vehicle_type ?? null,
        plate_number: vehicle?.plate_number ?? null,
        seats_available: Math.max(capacity - booked, 0),
      };
    }),
  };
}

// ---- Booking tools (require a real signed-in user; never touch a PIN/password) ----

async function bookSeat(userId: string, tripId: string, phone: string | undefined) {
  const { data: trip } = await supabase
    .from("trips")
    .select("id,route_id,fare,status,vehicles(capacity)")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return { error: "Trip not found." };
  if (!["scheduled", "boarding"].includes(trip.status)) {
    return { error: "This trip is no longer accepting bookings." };
  }

  // deno-lint-ignore no-explicit-any
  const capacity = (trip.vehicles as any)?.capacity ?? 0;
  const { data: existing } = await supabase
    .from("bookings")
    .select("seat_number")
    .eq("trip_id", tripId)
    .in("status", ["reserved", "confirmed", "boarded"]);
  const taken = new Set((existing ?? []).map((b) => b.seat_number));

  let seat: number | null = null;
  for (let s = 1; s <= capacity; s++) {
    if (!taken.has(s)) {
      seat = s;
      break;
    }
  }
  if (!seat) return { error: "This trip is fully booked — try another trip or route." };

  const { data: stages } = await supabase
    .from("stages")
    .select("id,order_index")
    .eq("route_id", trip.route_id)
    .order("order_index", { ascending: true });
  if (!stages || stages.length < 2) return { error: "This route has no stages set up yet." };
  const pickupStageId = stages[0].id;
  const dropoffStageId = stages[stages.length - 1].id;

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      trip_id: tripId,
      passenger_id: userId,
      seat_number: seat,
      pickup_stage_id: pickupStageId,
      dropoff_stage_id: dropoffStageId,
      fare_paid: trip.fare,
      status: "reserved",
    })
    .select("id")
    .single();
  if (error || !booking) return { error: error?.message ?? "Could not reserve a seat." };

  if (!phone) {
    return {
      booking_id: booking.id,
      seat_number: seat,
      fare: trip.fare,
      payment_triggered: false,
      note: "Seat reserved but no phone number given yet — ask the passenger for the M-Pesa number to send the payment prompt to, then call book_seat again with the same trip (a new seat isn't needed once one exists — use pay_for_booking instead once you have the phone).",
    };
  }

  const { error: payError } = await supabase.functions.invoke("mpesa-stk-push", {
    body: { bookingId: booking.id, phone, amount: trip.fare },
  });

  return {
    booking_id: booking.id,
    seat_number: seat,
    fare: trip.fare,
    payment_triggered: !payError,
    note: payError
      ? "Seat reserved, but the payment prompt failed to send — tell the passenger to retry payment from their booking."
      : "STK push sent — tell the passenger to check their phone and enter their M-Pesa PIN on the Safaricom prompt (not in this chat). Once they say they've paid, call check_payment_status with this booking_id.",
  };
}

async function payForBooking(userId: string, bookingId: string, phone: string) {
  const { data: booking } = await supabase
    .from("bookings")
    .select("id,passenger_id,fare_paid,status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.passenger_id !== userId) return { error: "Booking not found." };
  if (booking.status === "cancelled") return { error: "This booking was cancelled." };

  const { error: payError } = await supabase.functions.invoke("mpesa-stk-push", {
    body: { bookingId, phone, amount: booking.fare_paid },
  });
  return {
    payment_triggered: !payError,
    note: payError
      ? "The payment prompt failed to send — ask the passenger to try again."
      : "STK push sent — tell the passenger to check their phone and enter their M-Pesa PIN there, then say when they're done so you can confirm with check_payment_status.",
  };
}

async function checkPaymentStatus(userId: string, bookingId: string) {
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id,status,seat_number,fare_paid,passenger_id,pickup_stage_id,dropoff_stage_id,trips(route_id,vehicle_id,routes(name,origin,destination),vehicles(plate_number,vehicle_type))",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.passenger_id !== userId) return { error: "Booking not found." };

  const { data: payment } = await supabase
    .from("payments")
    .select("status,mpesa_receipt")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const trip = booking.trips as any;
  return {
    booking_status: booking.status,
    payment_status: payment?.status ?? "pending",
    mpesa_receipt: payment?.mpesa_receipt ?? null,
    seat_number: booking.seat_number,
    fare: booking.fare_paid,
    route_name: trip?.routes?.name ?? null,
    origin: trip?.routes?.origin ?? null,
    destination: trip?.routes?.destination ?? null,
    vehicle_plate: trip?.vehicles?.plate_number ?? null,
    vehicle_type: trip?.vehicles?.vehicle_type ?? null,
  };
}

// ---- Gemini tool schema ----

const readOnlyDeclarations = [
  {
    name: "search_routes",
    description:
      "Search real matatu/bus routes by origin, destination, or route name. Returns actual routes from the database, never invented ones.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A place name or partial route name to search for, e.g. 'Kasarani' or 'CBD'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_available_trips",
    description:
      "Given a route_id (from search_routes), returns currently scheduled/boarding trips on that route with live seat availability and fare.",
    parameters: {
      type: "object",
      properties: {
        route_id: { type: "string", description: "The route id returned by search_routes." },
      },
      required: ["route_id"],
    },
  },
];

const bookingDeclarations = [
  {
    name: "book_seat",
    description:
      "Reserves the next available seat for the signed-in passenger on a given trip, and — if a phone number is provided — immediately sends a real M-Pesa STK push for the fare. NEVER ask the passenger to type their M-Pesa PIN or password anywhere in this chat; the STK push makes Safaricom prompt them for it on their own phone. If you don't have their phone number yet, ask for it in chat first, then call this.",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string", description: "The trip id from get_available_trips." },
        phone: {
          type: "string",
          description:
            "The passenger's M-Pesa phone number, e.g. 0712345678. Omit only if not yet known.",
        },
      },
      required: ["trip_id"],
    },
  },
  {
    name: "pay_for_booking",
    description:
      "Sends (or re-sends) a real M-Pesa STK push for an already-reserved booking. Use this if a seat was reserved without a phone number yet, or if a previous payment attempt failed.",
    parameters: {
      type: "object",
      properties: {
        booking_id: { type: "string", description: "The booking id from book_seat." },
        phone: { type: "string", description: "The passenger's M-Pesa phone number." },
      },
      required: ["booking_id", "phone"],
    },
  },
  {
    name: "check_payment_status",
    description:
      "Checks the real, current payment/booking status for a booking, and returns the full trip details (route, vehicle, seat, fare). Call this once the passenger says they've completed the M-Pesa prompt, to confirm and give them a final summary. Only state what this tool returns — never assume payment succeeded.",
    parameters: {
      type: "object",
      properties: {
        booking_id: { type: "string", description: "The booking id to check." },
      },
      required: ["booking_id"],
    },
  },
];

function buildTools(page: string | undefined, signedIn: boolean) {
  const canBook = signedIn && !!page && page.startsWith("passenger");
  return [
    {
      functionDeclarations: canBook
        ? [...readOnlyDeclarations, ...bookingDeclarations]
        : readOnlyDeclarations,
    },
  ];
}

const BASE_INSTRUCTION = `You are the Matu assistant for a Kenyan matatu/bus booking app.
Help the user by calling the provided tools to check real routes, fares, and seat availability.
Never invent route names, fares, seat counts, booking ids, or payment status — only state what the tools return.
Keep replies short (2-4 sentences), friendly, and in a Kenyan conversational tone.
If no matching route exists, say so plainly and suggest a different place name.

CRITICAL SAFETY RULE: you must NEVER ask the user to type their M-Pesa PIN or password into
this chat, and never accept one if they offer it unprompted — just remind them it's entered
on their own phone's Safaricom prompt, not here. Payment tools only trigger that native
prompt; they never collect the PIN themselves.`;

// Per-page framing, layered on top of BASE_INSTRUCTION. This is what makes the same
// assistant behave differently depending on which page it's mounted on: a passenger
// booking a seat needs different guidance than a driver or a SACCO admin glancing at
// the same chat bubble.
const PAGE_INSTRUCTIONS: Record<string, string> = {
  landing:
    "The user is an anonymous visitor on the public landing page — they may not have an account yet. Answer general questions about how Matu works (booking, drivers, SACCOs). You can still look up a real route/fare if they ask, but mention they'll need to sign up to actually book a seat.",
  passenger_search:
    "The user is a signed-in passenger searching for a ride. You can fully book for them: find the route, check available trips, then call book_seat once they confirm which trip and give you a phone number. After they say they've paid, call check_payment_status and give them a short summary (route, seat, fare, receipt if available). Always confirm the route/trip/fare with them before calling book_seat — don't book without their go-ahead.",
  passenger_route_details:
    "The user is a signed-in passenger already viewing a specific route's details page (its id is given below, if provided). Focus on THIS route. You can book for them the same way as on the search page — confirm details, then book_seat, then check_payment_status once they've paid.",
  passenger_history:
    "The user is a signed-in passenger viewing their booking history. They may ask about a past/upcoming trip (use check_payment_status if they give a booking id), or want to book a new trip — you can do that too, same flow as search.",
  driver_home:
    "The user is a matatu/bus driver browsing before starting a trip (not yet driving). They might ask about routes, typical fares, or where demand is, to plan their day. Do not try to book a seat for them — that's a passenger action.",
  driver_trip:
    "The user is a driver currently on an active trip. Keep answers very brief — they're likely driving. They might ask about their own route's stages or fare, or about a different route a passenger asked about.",
  sacco_admin:
    "The user is a SACCO (transport company) admin managing routes and vehicles, not booking a ride themselves. They might ask about how a route is set up, its fare, or check it exists correctly. Do not offer to book a seat — that's a passenger action.",
};

function buildSystemInstruction(page: string | undefined, details: string | undefined): string {
  const pageNote = (page && PAGE_INSTRUCTIONS[page]) || PAGE_INSTRUCTIONS.passenger_search;
  const detailNote = details ? `\nRelevant id for this page: ${details}` : "";
  return `${BASE_INSTRUCTION}\n\n${pageNote}${detailNote}`;
}

// deno-lint-ignore no-explicit-any
type GeminiContent = { role: string; parts: any[] };

async function callGemini(
  contents: GeminiContent[],
  systemInstruction: string,
  // deno-lint-ignore no-explicit-any
  toolList: any,
): Promise<any> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: toolList,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);

    const { message, history, page, details } = (await req.json()) as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      page?: string;
      details?: string;
    };

    const systemInstruction = buildSystemInstruction(page, details);
    const toolList = buildTools(page, !!user);

    // Cap history so one long-running chat can't spiral into unbounded token usage.
    const cappedHistory = (history ?? []).slice(-10);

    const contents: GeminiContent[] = [
      ...cappedHistory.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    let matchedRoutes: RouteRow[] = [];
    let finalText = "";

    // Tool-call loop, capped at 4 rounds (booking is a slightly longer chain: search ->
    // trips -> book -> confirm) so a runaway tool-call chain still can't spiral.
    for (let round = 0; round < 4; round++) {
      const data = await callGemini(contents, systemInstruction, toolList);
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const functionCalls = parts.filter((p: any) => p.functionCall);
      const textParts = parts.filter((p: any) => p.text);

      if (functionCalls.length === 0) {
        finalText = textParts
          .map((p: any) => p.text)
          .join(" ")
          .trim();
        break;
      }

      // Echo the model's function-call turn back into the conversation, then append
      // the tool results as a functionResponse turn, per Gemini's tool-calling format.
      contents.push({ role: "model", parts });

      const responseParts = [];
      for (const call of functionCalls) {
        const { name, args } = call.functionCall;
        let result: unknown;
        if (name === "search_routes") {
          const found = await searchRoutes(args.query ?? "");
          matchedRoutes = found;
          result = found;
        } else if (name === "get_available_trips") {
          result = await getAvailableTrips(args.route_id ?? "");
        } else if (name === "book_seat" && user) {
          result = await bookSeat(user.id, args.trip_id ?? "", args.phone);
        } else if (name === "pay_for_booking" && user) {
          result = await payForBooking(user.id, args.booking_id ?? "", args.phone ?? "");
        } else if (name === "check_payment_status" && user) {
          result = await checkPaymentStatus(user.id, args.booking_id ?? "");
        } else if (["book_seat", "pay_for_booking", "check_payment_status"].includes(name)) {
          result = { error: "The user isn't signed in, so this action isn't available." };
        } else {
          result = { error: `Unknown tool: ${name}` };
        }
        responseParts.push({
          functionResponse: { name, response: { result } },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    if (!finalText) {
      finalText =
        matchedRoutes.length > 0
          ? "Here's what I found — tap a route below to check seats and book."
          : "I couldn't find a matching route. Try a different place name?";
    }

    return new Response(
      JSON.stringify({ reply: finalText, matchedRoutes: matchedRoutes.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-assistant error:", err);
    return new Response(
      JSON.stringify({
        reply: "Sorry, I'm having trouble right now — please try again in a moment.",
        matchedRoutes: [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
