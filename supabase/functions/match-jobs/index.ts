import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { scoreJob, type CandidateInput, type JobInput } from "./scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Parsed = {
  skills?: string[];
  experience?: { title?: string }[];
  estimated_years?: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: profile }, { data: prefs }, { data: resumes }, { data: sources }] = await Promise.all([
      admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      admin.from("candidate_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      admin.from("resumes").select("id, parsed, is_primary, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
      admin.from("job_sources").select("provider, board_token").eq("user_id", user.id).eq("active", true),
    ]);
    if (!profile || !prefs) return json({ error: "Complete your profile first" }, 400);
    if (!sources?.length) return json({ matched: 0, message: "Add a job source first" });

    const resume = (resumes || []).find((r) => r.is_primary) || (resumes || [])[0];
    const parsed = (resume?.parsed || {}) as Parsed;
    const candidate: CandidateInput = {
      skills: (parsed.skills || []).slice(0, 200),
      experience_titles: (parsed.experience || []).map((e) => e.title || "").filter(Boolean),
      years_experience: profile.years_experience || parsed.estimated_years || 0,
      target_titles: prefs.target_titles,
      locations: prefs.locations,
      work_arrangements: prefs.work_arrangements,
      seniority_levels: prefs.seniority_levels,
      industries: prefs.industries,
      keywords: prefs.keywords,
      employment_types: prefs.employment_types,
      excluded_companies: prefs.excluded_companies,
      min_salary: prefs.min_salary,
      requires_sponsorship: profile.requires_sponsorship,
      willing_to_relocate: profile.willing_to_relocate,
    };

    let matched = 0;
    for (const s of sources) {
      const { data: jobs, error } = await admin
        .from("jobs")
        .select("id, title, company, description, location, work_arrangement, seniority, employment_type, department, salary_min, salary_max")
        .eq("provider", s.provider)
        .eq("board_token", s.board_token)
        .eq("status", "active")
        .limit(2000);
      if (error) throw error;
      const rows = (jobs || []).map((j) => {
        const r = scoreJob(j as JobInput, candidate, prefs.weights);
        return {
          user_id: user.id,
          job_id: j.id,
          resume_id: resume?.id ?? null,
          score: r.score,
          eligible: r.eligible,
          ineligible_reasons: r.ineligible_reasons,
          breakdown: r.breakdown,
          explanation: r.explanation,
          computed_at: new Date().toISOString(),
        };
      });
      for (let i = 0; i < rows.length; i += 500) {
        const { error: upErr } = await admin.from("job_matches").upsert(rows.slice(i, i + 500), { onConflict: "user_id,job_id" });
        if (upErr) throw upErr;
      }
      matched += rows.length;
    }

    await admin.from("audit_logs").insert({ user_id: user.id, actor_id: user.id, action: "matching.run", entity: "job_matches", details: { matched } });
    return json({ matched });
  } catch (err) {
    console.error("match-jobs failed", err);
    return json({ error: "Matching failed. Please try again." }, 500);
  }
});
