// Zoom webhook receiver.
// Handles Zoom's endpoint URL validation challenge and `recording.completed`
// events, attaching recording links to the matching live session.
// Configure ZOOM_WEBHOOK_SECRET_TOKEN with the app's "Secret Token".
import { createClient } from "jsr:@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN");
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const rawBody = await req.text();

  // Verify Zoom's signature: v0=HMAC(secret, "v0:{timestamp}:{body}")
  const timestamp = req.headers.get("x-zm-request-timestamp") ?? "";
  const signature = req.headers.get("x-zm-signature") ?? "";
  const expected = `v0=${await hmacSha256Hex(secret, `v0:${timestamp}:${rawBody}`)}`;
  if (signature !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const event = JSON.parse(rawBody);

  // Zoom validates new endpoints with a challenge round-trip.
  if (event.event === "endpoint.url_validation") {
    const plainToken: string = event.payload.plainToken;
    return Response.json({
      plainToken,
      encryptedToken: await hmacSha256Hex(secret, plainToken),
    });
  }

  if (event.event === "recording.completed") {
    const meeting = event.payload?.object;
    const meetingId = String(meeting?.id ?? "");
    const shareUrl: string | undefined = meeting?.share_url;
    if (meetingId && shareUrl) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error } = await supabase
        .from("live_sessions")
        .update({ recording_url: shareUrl })
        .eq("zoom_meeting_id", meetingId);
      if (error) {
        console.error("Failed to store recording:", error.message);
        return new Response("Storage error", { status: 500 });
      }
    }
  }

  return new Response("OK", { status: 200 });
});
