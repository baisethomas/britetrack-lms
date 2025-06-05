import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Parse CSV from request body
  const csv = await req.text();
  // TODO: Parse CSV and enroll students
  // Example: Use a CSV parser library or simple split logic

  // For each row, insert enrollment into Supabase (via REST or RPC)
  // Example: fetch("https://<project>.supabase.co/rest/v1/course_enrollments", ...)

  return new Response("Bulk enrollment processed", { status: 200 });
}); 