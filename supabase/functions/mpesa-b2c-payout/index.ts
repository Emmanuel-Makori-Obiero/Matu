import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY")!;
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET")!;
const MPESA_INITIATOR_NAME = Deno.env.get("MPESA_INITIATOR_NAME")!; // API operator username set up in Daraja
const MPESA_INITIATOR_PASSWORD_ENCRYPTED = Deno.env.get("MPESA_INITIATOR_PASSWORD_ENCRYPTED")!; // see README: generate with Safaricom's public cert
const MPESA_B2C_SHORTCODE = Deno.env.get("MPESA_B2C_SHORTCODE")!; // your B2C-enabled shortcode (separate application from the Paybill used for STK push)

// SANDBOX ONLY — same caveat as mpesa-stk-push. See README "Going to production" section
// for the full B2C go-live checklist (separate from the STK Push go-live).
const MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"; // -> https://api.safaricom.co.ke in production

const RESULT_URL = `${SUPABASE_URL}/functions/v1/mpesa-b2c-result`;
const TIMEOUT_URL = RESULT_URL; // Safaricom requires both; same handler covers both cases

const MIN_WITHDRAWAL = 50; // KES — keep payouts above M-Pesa's practical minimum transaction size

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
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: cors() });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors() });
    }

    // owner_type: 'driver' withdraws to their own phone. 'sacco' withdraws to the
    // sacco owner's phone (payout goes to whoever sends the request, so ownership is
    // verified below rather than trusting a client-supplied phone number blindly).
    const { owner_type, phone, amount } = await req.json();
    if (owner_type !== "driver" && owner_type !== "sacco") {
      return new Response(JSON.stringify({ error: "owner_type must be 'driver' or 'sacco'" }), {
        status: 400,
        headers: cors(),
      });
    }
    if (!phone || !amount || Number(amount) < MIN_WITHDRAWAL) {
      return new Response(
        JSON.stringify({ error: `Minimum withdrawal is KES ${MIN_WITHDRAWAL}` }),
        { status: 400, headers: cors() },
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve which wallet this request is allowed to withdraw from.
    let ownerId: string;
    if (owner_type === "driver") {
      ownerId = userData.user.id;
    } else {
      const { data: sacco, error: saccoError } = await admin
        .from("saccos")
        .select("id")
        .eq("owner_id", userData.user.id)
        .single();
      if (saccoError || !sacco) {
        return new Response(JSON.stringify({ error: "No sacco owned by this account" }), {
          status: 404,
          headers: cors(),
        });
      }
      ownerId = sacco.id;
    }

    const { data: wallet, error: walletError } = await admin
      .from("wallets")
      .select("id, balance")
      .eq("owner_type", owner_type)
      .eq("owner_id", ownerId)
      .single();
    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), { status: 404, headers: cors() });
    }
    if (Number(wallet.balance) < Number(amount)) {
      return new Response(JSON.stringify({ error: "Insufficient wallet balance" }), {
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

    // Debit the wallet BEFORE calling Safaricom, marking the ledger row 'pending'.
    // mpesa-b2c-result flips it to 'completed' on success, or 'reversed' (refunding
    // the wallet) on failure — never leave the withdrawal silently un-reconciled.
    const { data: txnId, error: debitError } = await admin.rpc("apply_wallet_transaction", {
      _wallet_id: wallet.id,
      _type: "withdrawal",
      _amount: amount,
      _direction: false,
      _phone: normalizedPhone,
    });
    if (debitError) {
      // Most likely cause: the wallets.balance >= 0 check constraint tripped due to a
      // race with another concurrent withdrawal request.
      return new Response(JSON.stringify({ error: "Could not reserve funds for withdrawal" }), {
        status: 409,
        headers: cors(),
      });
    }
    await admin.from("wallet_transactions").update({ status: "pending" }).eq("id", txnId);

    const authRes = await fetch(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: "Basic " + btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`) },
    });
    const authJson = await authRes.json();
    if (!authRes.ok || !authJson.access_token) {
      await reverseWithdrawal(admin, wallet.id, amount, txnId, "Could not authenticate with M-Pesa");
      return new Response(JSON.stringify({ error: "Could not reach M-Pesa" }), { status: 502, headers: cors() });
    }

    const b2cRes = await fetch(`${MPESA_BASE_URL}/mpesa/b2c/v3/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authJson.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        OriginatorConversationID: txnId,
        InitiatorName: MPESA_INITIATOR_NAME,
        SecurityCredential: MPESA_INITIATOR_PASSWORD_ENCRYPTED,
        CommandID: "BusinessPayment",
        Amount: Math.max(MIN_WITHDRAWAL, Math.round(Number(amount))),
        PartyA: MPESA_B2C_SHORTCODE,
        PartyB: normalizedPhone,
        Remarks: owner_type === "driver" ? "Matu driver withdrawal" : "Matu sacco withdrawal",
        QueueTimeOutURL: TIMEOUT_URL,
        ResultURL: RESULT_URL,
        Occasion: "Wallet withdrawal",
      }),
    });
    const b2cJson = await b2cRes.json();

    if (!b2cRes.ok || b2cJson.ResponseCode !== "0") {
      console.error("B2C request failed", b2cJson);
      await reverseWithdrawal(admin, wallet.id, amount, txnId, b2cJson.errorMessage ?? "B2C request rejected");
      return new Response(JSON.stringify({ error: "Withdrawal request failed" }), { status: 502, headers: cors() });
    }

    await admin
      .from("wallet_transactions")
      .update({ mpesa_conversation_id: b2cJson.ConversationID })
      .eq("id", txnId);

    return new Response(JSON.stringify({ success: true, transactionId: txnId }), {
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: cors() });
  }
});

// Refunds the wallet and marks the pending withdrawal row failed, used when we debited
// the wallet but the B2C call itself never made it to Safaricom (as opposed to
// Safaricom accepting the request and later reporting failure via mpesa-b2c-result,
// which handles its own reversal).
async function reverseWithdrawal(
  admin: ReturnType<typeof createClient>,
  walletId: string,
  amount: number,
  txnId: string,
  reason: string,
) {
  await admin.rpc("apply_wallet_transaction", {
    _wallet_id: walletId,
    _type: "adjustment",
    _amount: amount,
    _direction: true,
  });
  await admin
    .from("wallet_transactions")
    .update({ status: "reversed", failure_reason: reason })
    .eq("id", txnId);
}
