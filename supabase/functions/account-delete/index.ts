import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);
    const body = await req.json().catch(() => null);
    if (body?.confirm !== "DELETE") return json({ error: "Confirmation required" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { count } = await admin.from("organizations").select("id", { count: "exact", head: true }).eq("created_by", user.id);
    if ((count ?? 0) > 0) {
      return json({ error: "You created an organization. Transfer or remove it before deleting your account." }, 409);
    }

    const { data: files } = await admin.storage.from("resumes").list(user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from("resumes").remove(files.map((f) => `${user.id}/${f.name}`));

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ deleted: true });
  } catch (err) {
    console.error("account-delete failed", err);
    return json({ error: "Account deletion failed. Please try again." }, 500);
  }
});
