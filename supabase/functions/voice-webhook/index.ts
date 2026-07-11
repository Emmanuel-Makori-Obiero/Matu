// FILE: supabase/functions/voice-webhook/index.ts
// Twilio hits this the moment someone calls your Matu number. It doesn't do any
// AI itself — it just tells Twilio "open a live audio stream to voice-agent" and
// hangs up its own HTTP request. All the actual conversation happens over the
// WebSocket that Twilio then opens to voice-agent.
//
// Configure in Twilio Console: Phone Numbers -> your number -> Voice Configuration
// -> "A call comes in" -> Webhook -> https://<project-ref>.supabase.co/functions/v1/voice-webhook

const PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_REF") ?? "";

Deno.serve(async (req) => {
  const form = await req.formData();
  const from = String(form.get("From") ?? "");

  // wss:// URL Twilio will open a bidirectional audio stream to. The caller's
  // number is passed through as a custom parameter so voice-agent can look up
  // their Matu account without a second round trip.
  const streamUrl = `wss://${PROJECT_REF}.functions.supabase.co/voice-agent`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callerPhone" value="${from}" />
    </Stream>
  </Connect>
</Response>`;

  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
});
