// Sends an email for a notification, then records it in the notifications table.
// Invoke with the service role key (e.g. from a database webhook or admin tooling):
//   POST { user_id, title, body, href?, type? }
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Only callers holding the service role key may send notifications.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: {
    user_id?: string;
    title?: string;
    body?: string;
    href?: string;
    type?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const { user_id, title, body = "", href = null, type = "announcement" } = payload;
  if (!user_id || !title) {
    return new Response("user_id and title are required", { status: 400 });
  }

  const { data: user, error: userError } =
    await supabase.auth.admin.getUserById(user_id);
  if (userError || !user?.user?.email) {
    return new Response("User not found", { status: 404 });
  }

  const { error: insertError } = await supabase.from("notifications").insert({
    user_id,
    title,
    body,
    href,
    type,
  });
  if (insertError) {
    return new Response(`Failed to record notification: ${insertError.message}`, {
      status: 500,
    });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("NOTIFICATION_FROM_EMAIL") ??
          "BriteTrack <notifications@britetrack.app>",
        to: [user.user.email],
        subject: title,
        text: body || title,
      }),
    });
    if (!res.ok) {
      console.error("Resend error:", await res.text());
      // The in-app notification was recorded; report partial success.
      return Response.json({ ok: true, email_sent: false }, { status: 202 });
    }
  }

  return Response.json({ ok: true, email_sent: Boolean(resendKey) });
});
