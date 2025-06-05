import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  // Validate Zoom webhook secret if set
  const zoomSecret = Deno.env.get("ZOOM_WEBHOOK_SECRET");
  const signature = req.headers.get("x-zoom-signature");
  if (zoomSecret && signature !== zoomSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const event = await req.json();

  // Example: handle recording.completed event
  if (event.event === "recording.completed") {
    // TODO: Update your DB or storage with recording info
    // event.payload contains meeting/recording details
  }

  return new Response("OK", { status: 200 });
}); 