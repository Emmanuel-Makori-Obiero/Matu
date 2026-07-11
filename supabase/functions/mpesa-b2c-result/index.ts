import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Unlike mpesa-callback, Safaricom's B2C ResultURL/QueueTimeOutURL don't support a
// query-string secret in the same simple way in all Daraja configurations, so this
// endpoint verifies the OriginatorConversationID against a wallet_transactions row we
// already created (in 'pending' status) rather than trusting the body outright. A
// forged callback can only affect a transaction ID that was genuinely initiated by us.
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const result = body?.Result;
    if (!result) return new Response(JSON.stringify({ ok: true }), { status: 200 });

    const txnId = result.OriginatorConversationID;
    const resultCode = result.ResultCode;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: txn } = await admin
      .from("wallet_transactions")
      .select("id, wallet_id, amount, status")
      .eq("id", txnId)
      .eq("type", "withdrawal")
      .maybeSingle();

    if (!txn || txn.status !== "pending") {
      // Unknown transaction, or one we've already resolved (Safaricom retries these
      // callbacks) — acknowledge without doing anything further.
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (resultCode === 0) {
      const items: { Key: string; Value: string | number }[] =
        result.ResultParameters?.ResultParameter ?? [];
      const get = (key: string) => items.find((i) => i.Key === key)?.Value;
      const receipt = get("TransactionReceipt");

      await admin
        .from("wallet_transactions")
        .update({ status: "completed", mpesa_receipt: receipt ? String(receipt) : null })
        .eq("id", txnId);
    } else {
      // Payout failed on Safaricom's side after we'd already debited the wallet in
      // mpesa-b2c-payout — refund it and mark the ledger row reversed rather than
      // leaving the driver/sacco permanently short.
      await admin.rpc("apply_wallet_transaction", {
        _wallet_id: txn.wallet_id,
        _type: "adjustment",
        _amount: txn.amount,
        _direction: true,
      });
      await admin
        .from("wallet_transactions")
        .update({ status: "reversed", failure_reason: result.ResultDesc ?? "Payout failed" })
        .eq("id", txnId);
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
