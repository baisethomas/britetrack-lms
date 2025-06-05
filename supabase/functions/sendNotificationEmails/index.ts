import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { user_id, title, message } = await req.json();

  // TODO: Look up user email from Supabase
  // TODO: Send email using a service like Resend, SendGrid, or Mailgun

  return new Response("Email sent", { status: 200 });
}); 