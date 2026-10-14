import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const COMPANY = "Sandbox Labs (Test)";
const BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/test-ats`;

const JOBS = [
  { id: "sbx-fe-001", title: "Frontend Engineer", department: "Engineering", location: "Remote - US", workplace: "remote", employment_type: "Full-time", salary_min: 110000, salary_max: 140000,
    description: "Build user interfaces with React and TypeScript. 2+ years of experience with JavaScript, HTML, CSS and REST APIs. Experience with testing (Jest, Cypress) is a plus." },
  { id: "sbx-da-002", title: "Data Analyst", department: "Analytics", location: "New York, NY (Hybrid)", workplace: "hybrid", employment_type: "Full-time", salary_min: 80000, salary_max: 100000,
    description: "Analyze product data using SQL, Python and Tableau. 1+ years of experience in data analysis, statistics and A/B testing. Strong communication skills." },
  { id: "sbx-pm-003", title: "Associate Product Manager", department: "Product", location: "Austin, TX", workplace: "onsite", employment_type: "Full-time", salary_min: 95000, salary_max: 115000,
    description: "Work with engineering and design on product management, agile delivery and stakeholder management. Comfortable with Jira, Figma and data analysis. New grads welcome." },
  { id: "sbx-be-004", title: "Senior Backend Engineer", department: "Engineering", location: "Remote", workplace: "remote", employment_type: "Full-time", salary_min: 150000, salary_max: 185000,
    description: "Design microservices in Go or Python on AWS with Docker and Kubernetes. 5+ years of backend experience, PostgreSQL, Redis, CI/CD. We are unable to sponsor visas for this role." },
  { id: "sbx-mk-005", title: "Marketing Coordinator", department: "Marketing", location: "Chicago, IL (Hybrid)", workplace: "hybrid", employment_type: "Full-time", salary_min: 55000, salary_max: 65000,
    description: "Support content marketing, social media, SEO and HubSpot campaigns. 1+ years of experience. Excellent copywriting and Google Analytics skills." },
  { id: "sbx-ops-006", title: "Operations Intern", department: "Operations", location: "Remote", workplace: "remote", employment_type: "Internship", salary_min: null, salary_max: null,
    description: "Summer internship supporting operations, logistics and Excel reporting. Students welcome." },
  { id: "sbx-captcha", title: "Customer Success Associate (CAPTCHA test)", department: "Support", location: "Remote", workplace: "remote", employment_type: "Full-time", salary_min: 60000, salary_max: 70000,
    description: "Test listing: this employer requires human verification at submission. Customer success, CRM, communication." },
  { id: "sbx-down", title: "QA Engineer (Outage test)", department: "Engineering", location: "Remote", workplace: "remote", employment_type: "Contract", salary_min: 90000, salary_max: 110000,
    description: "Test listing: the employer system is always unavailable, exercising retries. Testing, Selenium, Cypress." },
];

const QUESTIONS = [
  { label: "First Name", field: "first_name", required: true, type: "input_text" },
  { label: "Last Name", field: "last_name", required: true, type: "input_text" },
  { label: "Email", field: "email", required: true, type: "input_text" },
  { label: "Phone", field: "phone", required: false, type: "input_text" },
  { label: "Resume", field: "resume", required: true, type: "input_file" },
  { label: "LinkedIn Profile", field: "linkedin", required: false, type: "input_text" },
  { label: "Are you legally authorized to work in the United States?", field: "q_work_auth", required: true, type: "multi_value_single_select",
    options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] },
  { label: "Why are you interested in Sandbox Labs?", field: "q_why", required: false, type: "textarea" },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "Forbidden" }, 403);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    const i = parts.indexOf("test-ats");
    const route = parts.slice(i + 1);

    if (req.method === "GET" && route[0] === "jobs" && route.length === 1) {
      const posted = new Date(Date.now() - 3 * 86400000).toISOString();
      return json({ jobs: JOBS.map((j) => ({ ...j, company: COMPANY, url: `${BASE}/jobs/${j.id}`, posted_at: posted })) });
    }
    if (req.method === "GET" && route[0] === "jobs" && route[2] === "questions") {
      if (!JOBS.some((j) => j.id === route[1])) return json({ error: "Not found" }, 404);
      return json({ questions: QUESTIONS });
    }
    if (req.method === "POST" && route[0] === "apply") {
      const body = await req.json().catch(() => null);
      const job = JOBS.find((j) => j.id === body?.job_external_id);
      if (!job) return json({ error: "Unknown job" }, 404);
      if (typeof body?.idempotency_key !== "string" || !body.idempotency_key) return json({ error: "Missing idempotency key" }, 400);
      if (job.id === "sbx-captcha") return json({ error: "captcha_required", message: "Human verification (CAPTCHA) required" }, 403);
      if (job.id === "sbx-down") return json({ error: "Service unavailable" }, 503);
      const email = String(body?.applicant?.email ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "A valid email is required" }, 422);
      const missing = QUESTIONS.filter((q) => q.required && q.type !== "input_file" && !["first_name", "last_name", "email"].includes(q.field))
        .filter((q) => !(body.answers || []).some((a: { field: string; answer: string }) => a.field === q.field && String(a.answer).trim()));
      if (missing.length) return json({ error: `Missing required answers: ${missing.map((m) => m.label).join(", ")}` }, 422);

      const { data: existing } = await admin.from("test_ats_submissions").select("receipt_id, received_at").eq("idempotency_key", body.idempotency_key).maybeSingle();
      if (existing) return json({ ...existing, duplicate: true });
      const receipt_id = `SBX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const { data: saved, error } = await admin.from("test_ats_submissions").insert({
        receipt_id, job_external_id: job.id, idempotency_key: body.idempotency_key, applicant_email: email,
        payload: { applicant: body.applicant, answers: body.answers, cover_letter_length: String(body.cover_letter ?? "").length, resume_name: body.resume_name },
      }).select("receipt_id, received_at").single();
      if (error) throw error;
      return json({ ...saved, message: "Application received by Sandbox Labs (Test)" }, 201);
    }
    if (req.method === "GET" && route[0] === "receipts" && route[1]) {
      const { data } = await admin.from("test_ats_submissions").select("receipt_id, job_external_id, received_at").eq("receipt_id", route[1]).maybeSingle();
      return data ? json(data) : json({ error: "Not found" }, 404);
    }
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("test-ats failed", err);
    return json({ error: "Test ATS error" }, 500);
  }
});
