import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY")!;
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---- Safaricom Daraja environment ----
// Driven entirely by secrets now — no code edit needed to go live. Defaults below are
// Safaricom's PUBLIC SANDBOX values (safe, well-known, checked into git deliberately),
// used only when the corresponding secret hasn't been set yet.
//
// Sandbox STK pushes never reach a real phone (only Safaricom's official test MSISDN
// 254708374149), and Safaricom's sandbox commonly fires back a success callback on its
// own without any real payment happening — so bookings will confirm as "paid" with no
// money actually moving until this is switched to production.
//
// TO GO LIVE (no code changes, secrets only):
//   1. Complete Safaricom Daraja's "Go Live" process to get PRODUCTION credentials:
//      a production Consumer Key/Secret, a production shortcode, and a production
//      passkey (NOT the public sandbox passkey used as the default below).
//   2. Set these Supabase Edge Function secrets:
//        MPESA_ENV=production
//        MPESA_CONSUMER_KEY=<production consumer key>
//        MPESA_CONSUMER_SECRET=<production consumer secret>
//        MPESA_SHORTCODE=<production shortcode>
//        MPESA_PASSKEY=<production passkey>
//   3. Redeploy this function (secret changes require a redeploy to take effect).
const MPESA_ENV = Deno.env.get("MPESA_ENV") ?? "sandbox";
const MPESA_BASE_URL =
  MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
const SHORTCODE = Deno.env.get("MPESA_SHORTCODE") ?? "174379";
const PASSKEY =
  Deno.env.get("MPESA_PASSKEY") ??
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
if (
  MPESA_ENV === "production" &&
  (!Deno.env.get("MPESA_SHORTCODE") || !Deno.env.get("MPESA_PASSKEY"))
) {
  throw new Error(
    "MPESA_ENV=production but MPESA_SHORTCODE/MPESA_PASSKEY secrets are not set. Refusing to " +
      "start rather than silently fall back to sandbox values in a production environment.",
  );
}

// Shared secret appended to the callback URL so mpesa-callback can verify a request
// actually originated from a payment WE initiated, instead of trusting any POST body
// unconditionally (previously anyone who found the callback URL could fabricate a
// "payment succeeded" callback for any booking, for free).
const MPESA_CALLBACK_SECRET = Deno.env.get("MPESA_CALLBACK_SECRET")!;
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/mpesa-callback?secret=${encodeURIComponent(MPESA_CALLBACK_SECRET)}`;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

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

    // Three payment purposes share this function: passenger fare (bookingId), sacco
    // vehicle subscriptions (purpose: "sacco_subscription" + reference_id), and the
    // driver's SACCO-join fee (purpose: "sacco_join_fee" + reference_id, pointing at a
    // driver_join_requests row). Everything below branches on which shape was sent, but
    // the actual STK push call is identical.
    const { bookingId, phone, amount, purpose, reference_id } = await req.json();
    const isSubscription = purpose === "sacco_subscription";
    const isJoinFee = purpose === "sacco_join_fee";
    const isWalletTopup = purpose === "wallet_topup";
    const needsReferenceId = isSubscription || isJoinFee;

    if (
      !phone ||
      !amount ||
      (!needsReferenceId && !isWalletTopup && !bookingId) ||
      (needsReferenceId && !reference_id)
    ) {
      return new Response(JSON.stringify({ error: "Missing required payment details" }), {
        status: 400,
        headers: cors(),
      });
    }

    let normalizedPhone = String(phone).replace(/\s+/g, "").replace(/^\+/, "");
    if (normalizedPhone.startsWith("0")) normalizedPhone = "254" + normalizedPhone.slice(1);
    if (!/^254\d{9}$/.test(normalizedPhone)) {
      return new Response(JSON.stringify({ error: "Enter a valid Safaricom number" }), {
        status: 400,
        headers: cors(),
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let accountRef: string;

    if (isJoinFee) {
      // Confirm this join request belongs to the caller before we let them pay against
      // it (mirrors the subscription ownership check below).
      const { data: joinRequest, error: joinRequestError } = await admin
        .from("driver_join_requests")
        .select("id, driver_id")
        .eq("id", reference_id)
        .single();
      if (joinRequestError || !joinRequest || joinRequest.driver_id !== userData.user.id) {
        return new Response(JSON.stringify({ error: "Join request not found" }), {
          status: 404,
          headers: cors(),
        });
      }
      accountRef = `MatuJoin-${String(reference_id).slice(0, 8)}`;
    } else if (isSubscription) {
      // Confirm this subscription row belongs to a sacco the caller owns, and grab it
      // so we can stamp the checkout ID onto it after the STK push succeeds.
      const { data: sub, error: subError } = await admin
        .from("sacco_subscriptions")
        .select("id, sacco_id, saccos!inner(owner_id)")
        .eq("id", reference_id)
        .single();
      if (
        subError ||
        !sub ||
        (sub as unknown as { saccos: { owner_id: string } }).saccos.owner_id !== userData.user.id
      ) {
        return new Response(JSON.stringify({ error: "Subscription not found" }), {
          status: 404,
          headers: cors(),
        });
      }
      accountRef = `MatuSub-${String(reference_id).slice(0, 8)}`;
    } else if (isWalletTopup) {
      accountRef = `MatuTopup-${String(userData.user.id).slice(0, 8)}`;
    } else {
      const { data: booking, error: bookingError } = await admin
        .from("bookings")
        .select("id, passenger_id")
        .eq("id", bookingId)
        .single();
      if (bookingError || !booking || booking.passenger_id !== userData.user.id) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: cors(),
        });
      }
      accountRef = `Matu-${String(bookingId).slice(0, 8)}`;
    }

    const authRes = await fetch(
      `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: "Basic " + btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`),
        },
      },
    );
    const authJson = await authRes.json();
    if (!authRes.ok || !authJson.access_token) {
      console.error("Safaricom auth failed", authJson);
      return new Response(JSON.stringify({ error: "Could not reach M-Pesa" }), {
        status: 502,
        headers: cors(),
      });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = btoa(`${SHORTCODE}${PASSKEY}${timestamp}`);

    const stkRes = await fetch(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authJson.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.max(1, Math.round(Number(amount))),
        PartyA: normalizedPhone,
        PartyB: SHORTCODE,
        PhoneNumber: normalizedPhone,
        CallBackURL: CALLBACK_URL,
        AccountReference: accountRef,
        TransactionDesc: isJoinFee
          ? "Matu SACCO join fee"
          : isSubscription
            ? "Matu sacco subscription"
            : isWalletTopup
              ? "Matu wallet top-up"
              : "Matu fare",
      }),
    });
    const stkJson = await stkRes.json();

    if (!stkRes.ok || stkJson.ResponseCode !== "0") {
      console.error("STK push failed", stkJson);
      return new Response(
        JSON.stringify({ error: stkJson.errorMessage ?? "Payment request failed" }),
        { status: 502, headers: cors() },
      );
    }

    if (isJoinFee) {
      const { error: updateError } = await admin
        .from("driver_join_requests")
        .update({ mpesa_checkout_request_id: stkJson.CheckoutRequestID })
        .eq("id", reference_id);
      if (updateError) console.error("Failed to stamp join request checkout id", updateError);
    } else if (isSubscription) {
      const { error: updateError } = await admin
        .from("sacco_subscriptions")
        .update({ mpesa_checkout_request_id: stkJson.CheckoutRequestID })
        .eq("id", reference_id);
      if (updateError) console.error("Failed to stamp subscription checkout id", updateError);
    } else if (isWalletTopup) {
      const walletId = await admin.rpc("get_or_create_wallet", {
        _owner_type: "passenger",
        _owner_id: userData.user.id,
      });
      const { error: insertError } = await admin.from("wallet_transactions").insert({
        wallet_id: walletId.data,
        type: "topup",
        status: "pending",
        amount,
        mpesa_checkout_request_id: stkJson.CheckoutRequestID,
      });
      if (insertError) console.error("Failed to record wallet top-up", insertError);
    } else {
      const { error: insertError } = await admin.from("payments").insert({
        booking_id: bookingId,
        payer_id: userData.user.id,
        amount,
        status: "pending",
        mpesa_checkout_request_id: stkJson.CheckoutRequestID,
      });
      if (insertError) console.error("Failed to record payment", insertError);
    }

    return new Response(
      JSON.stringify({ success: true, checkoutRequestId: stkJson.CheckoutRequestID }),
      { headers: { ...cors(), "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: cors(),
    });
  }
});
