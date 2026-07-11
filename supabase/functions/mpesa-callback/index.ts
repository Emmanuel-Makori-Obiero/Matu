import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MPESA_CALLBACK_SECRET = Deno.env.get("MPESA_CALLBACK_SECRET")!;

Deno.serve(async (req) => {
  try {
    // This endpoint is public (Safaricom calls it directly, so it can't require our
    // normal user auth). Without SOME verification, anyone who found this URL could
    // POST a fabricated { CheckoutRequestID, ResultCode: 0 } and confirm any booking as
    // paid for free. mpesa-stk-push appends this shared secret to the CallBackURL it
    // gives Safaricom, so a real callback always carries it — reject anything that
    // doesn't match instead of trusting the body unconditionally.
    const url = new URL(req.url);
    const providedSecret = url.searchParams.get("secret");
    if (!MPESA_CALLBACK_SECRET || providedSecret !== MPESA_CALLBACK_SECRET) {
      console.error("mpesa-callback: rejected request with missing/invalid secret");
      // Still return 200 with a benign body — Safaricom retries on non-2xx, and we
      // don't want to leak *why* it was rejected to whoever/whatever sent this.
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const body = await req.json();
    const callback = body?.Body?.stkCallback;
    if (!callback) return new Response(JSON.stringify({ ok: true }), { status: 200 });

    const checkoutRequestId = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // A single checkout ID could belong to a fare payment, a sacco subscription, or a
    // driver's SACCO-join fee — try payments first, then sacco_subscriptions, and
    // finally driver_join_requests, only falling through when the previous table had no
    // matching row (bookingId column set is a full name match to the correct column,
    // unlike the previous version of this function).
    if (resultCode === 0) {
      const items: { Name: string; Value: string | number }[] =
        callback.CallbackMetadata?.Item ?? [];
      const get = (name: string) => items.find((i) => i.Name === name)?.Value;
      const receipt = get("MpesaReceiptNumber");

      const { data: payment } = await admin
        .from("payments")
        .update({ status: "held", mpesa_receipt: receipt ? String(receipt) : null })
        .eq("mpesa_checkout_request_id", checkoutRequestId)
        .select("id, booking_id")
        .maybeSingle();

      if (payment?.booking_id) {
        await admin.from("bookings").update({ status: "confirmed" }).eq("id", payment.booking_id);
      } else {
        const { data: subscription } = await admin
          .from("sacco_subscriptions")
          .update({ status: "active", mpesa_receipt: receipt ? String(receipt) : null })
          .eq("mpesa_checkout_request_id", checkoutRequestId)
          .select("id")
          .maybeSingle();

        if (!subscription) {
          await admin
            .from("driver_join_requests")
            .update({ join_fee_status: "held" })
            .eq("mpesa_checkout_request_id", checkoutRequestId);
        }
      }
    } else {
      const { data: payment } = await admin
        .from("payments")
        .update({ status: "failed" })
        .eq("mpesa_checkout_request_id", checkoutRequestId)
        .select("id")
        .maybeSingle();

      if (!payment) {
        const { data: subscription } = await admin
          .from("sacco_subscriptions")
          .update({
            status: "failed",
            failure_reason: callback.ResultDesc ?? "Payment was not completed",
          })
          .eq("mpesa_checkout_request_id", checkoutRequestId)
          .select("id")
          .maybeSingle();

        if (!subscription) {
          await admin
            .from("driver_join_requests")
            .update({
              join_fee_status: "failed",
              join_fee_failure_reason: callback.ResultDesc ?? "Payment was not completed",
            })
            .eq("mpesa_checkout_request_id", checkoutRequestId);
        }
      }
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
