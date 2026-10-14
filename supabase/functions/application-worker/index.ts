import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildAnswers, chooseResume, coverLetter, greenhouseQuestions, standardQuestions, tailorResume,
  type LibraryAnswer, type PacketAnswer, type Profile, type Question, type ResumeRow,
} from "./packet.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const MAX_ATTEMPTS = 3;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
type AdapterResult =
  | { status: "submitted"; method: "provider_api" | "test_ats"; receipt_id: string | null; evidence: Row }
  | { status: "retry" | "failed" | "unknown" | "needs_user"; error: string; evidence?: Row };

class Ctx {
  constructor(public admin: SupabaseClient, public userId: string, public prefs: Row, public profile: Row) {}

  async transition(app: Row, to: string, patch: Row, message: string, data: Row = {}): Promise<Row | null> {
    const { data: rows, error } = await this.admin
      .from("applications")
      .update({ ...patch, state: to, updated_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("state", app.state)
      .select("*, job:jobs(*)");
    if (error) throw error;
    if (!rows?.length) return null;
    await this.admin.from("application_events").insert({
      application_id: app.id, user_id: this.userId, from_state: app.state, to_state: to, actor: "worker", message, data,
    });
    return rows[0];
  }

  async notify(title: string, body: string, kind = "info") {
    await this.admin.from("notifications").insert({ user_id: this.userId, title, body, kind, link: "queue" });
  }
}

async function fetchQuestions(job: Row): Promise<Question[]> {
  try {
    if (job.provider === "greenhouse") {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.board_token)}/jobs/${encodeURIComponent(job.external_id)}?questions=true`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (res.ok) {
        const qs = greenhouseQuestions(await res.json());
        if (qs.length) return qs;
      }
    }
    if (job.provider === "test_ats") {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/test-ats/jobs/${encodeURIComponent(job.external_id)}/questions`, {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body?.questions)) return body.questions as Question[];
      }
    }
  } catch (e) {
    console.error("question fetch failed", e);
  }
  return standardQuestions();
}

async function prepare(ctx: Ctx, app: Row): Promise<Row | null> {
  const preparing = await ctx.transition(app, "PREPARING", {}, "Preparing application packet");
  if (!preparing) return null;
  const job = preparing.job;

  const [{ data: resumes }, { data: library }, { data: match }] = await Promise.all([
    ctx.admin.from("resumes").select("id, name, target_category, is_primary, parsed, updated_at, file_path, file_name, reviewed").eq("user_id", ctx.userId),
    ctx.admin.from("answer_library").select("question, answer, approved, sensitive").eq("user_id", ctx.userId),
    ctx.admin.from("job_matches").select("eligible, score").eq("user_id", ctx.userId).eq("job_id", job.id).maybeSingle(),
  ]);

  const jobText = `${job.title}\n${job.description}`;
  const chosen = chooseResume((resumes || []) as ResumeRow[], job.title, jobText);
  if (!chosen) {
    await ctx.notify("Resume needed", `Upload and review a resume before we can prepare ${job.title} at ${job.company}.`, "action");
    return await ctx.transition(preparing, "NEEDS_USER_ACTION", {
      required_action: "Upload and review a resume in Resume Studio, then re-queue this application.",
      required_action_kind: "resume",
    }, "No usable resume found");
  }
  const full = (resumes || []).find((r) => r.id === chosen.id)!;
  const tailored = tailorResume(chosen.parsed, jobText);
  const profile = ctx.profile as Profile;
  const letter = ctx.prefs.generate_cover_letters ? coverLetter(profile, tailored.parsed, job, tailored.relevantSkills) : "";
  const questions = await fetchQuestions(job);
  const { answers, pending } = buildAnswers(questions, profile, (library || []) as LibraryAnswer[], letter);

  const patch = {
    resume_id: chosen.id,
    resume_snapshot: { id: chosen.id, name: chosen.name, file_path: full.file_path, file_name: full.file_name, parsed: tailored.parsed, reviewed: full.reviewed },
    tailoring_notes: tailored.notes,
    cover_letter: letter,
    answers,
    prepared_at: new Date().toISOString(),
  };

  if (pending > 0) {
    await ctx.notify("Your input is needed", `${job.company} asks ${pending} question(s) we don't have approved answers for.`, "action");
    return await ctx.transition(preparing, "NEEDS_USER_ACTION", {
      ...patch,
      required_action: `Answer ${pending} required question(s). We never guess answers for you.`,
      required_action_kind: "questions",
    }, "Packet prepared; waiting on unanswered questions", { pending });
  }

  const sensitiveFilled = answers.some((a) => a.sensitive && a.answer.trim());
  const autoOk = app.mode === "auto" && ctx.prefs.apply_mode === "auto" && ctx.prefs.auto_apply_consent_at &&
    match?.eligible !== false && (match?.score ?? app.match_score) >= ctx.prefs.auto_min_score && full.reviewed && !sensitiveFilled;
  if (autoOk) {
    return await ctx.transition(preparing, "QUEUED", patch, "Packet prepared; meets your auto-apply criteria");
  }

  let note: string | null = null;
  if (app.mode === "auto") {
    note = !full.reviewed
      ? "Auto-apply paused for this job because the selected resume has not been reviewed."
      : sensitiveFilled
      ? "This application includes sensitive questions. Confirm those answers yourself before it is sent."
      : `Did not meet your auto-apply criteria (score ${match?.score ?? app.match_score}, minimum ${ctx.prefs.auto_min_score}). Review it yourself.`;
  }
  await ctx.notify("Ready for review", `${job.title} at ${job.company} is prepared and waiting for you.`);
  return await ctx.transition(preparing, "READY_FOR_REVIEW", { ...patch, required_action: note, required_action_kind: note ? "review" : null }, "Packet ready for review");
}

function splitName(full: string) {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { first: first ?? "", last: rest.join(" ") };
}

async function resumeBlob(ctx: Ctx, app: Row): Promise<{ blob: Blob; name: string } | null> {
  const path = app.resume_snapshot?.file_path;
  if (!path) return null;
  const { data } = await ctx.admin.storage.from("resumes").download(path);
  return data ? { blob: data, name: app.resume_snapshot?.file_name || "resume.pdf" } : null;
}

function classify(status: number, body: string): AdapterResult {
  if (status === 429 || status >= 500) return { status: "retry", error: `Employer system temporarily unavailable (${status})` };
  if (status === 401 || status === 403) {
    if (/captcha|challenge|bot/i.test(body)) return { status: "needs_user", error: "The employer requires human verification. Please submit this one yourself." };
    return { status: "failed", error: "The employer integration rejected our credentials. Submit manually or ask the employer to re-authorize." };
  }
  return { status: "failed", error: `The employer rejected the application: ${body.slice(0, 200)}` };
}

function answerValue(a: PacketAnswer): string {
  if (a.options?.length) return a.options.find((o) => o.label === a.answer)?.value ?? a.answer;
  return a.answer;
}

async function submitGreenhouse(ctx: Ctx, app: Row, apiKey: string): Promise<AdapterResult> {
  const job = app.job;
  const form = new FormData();
  const { first, last } = splitName(ctx.profile.full_name);
  form.set("first_name", first);
  form.set("last_name", last);
  form.set("email", ctx.profile.email);
  if (ctx.profile.phone) form.set("phone", ctx.profile.phone);
  const file = await resumeBlob(ctx, app);
  if (file) form.set("resume", file.blob, file.name);
  if (app.cover_letter) form.set("cover_letter_text", app.cover_letter);
  for (const a of (app.answers || []) as PacketAnswer[]) {
    if (["first_name", "last_name", "email", "phone", "resume", "cover_letter", "cover_letter_text"].includes(a.field)) continue;
    if (a.answer && a.type !== "input_file") form.set(a.field, answerValue(a));
  }
  return await post(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.board_token)}/jobs/${encodeURIComponent(job.external_id)}`, {
    method: "POST", body: form, headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}` },
  }, "greenhouse", (b) => (b?.id ? String(b.id) : null));
}

async function submitLever(ctx: Ctx, app: Row, apiKey: string): Promise<AdapterResult> {
  const job = app.job;
  const form = new FormData();
  form.set("name", ctx.profile.full_name);
  form.set("email", ctx.profile.email);
  if (ctx.profile.phone) form.set("phone", ctx.profile.phone);
  if (ctx.profile.linkedin_url) form.set("urls[LinkedIn]", ctx.profile.linkedin_url);
  if (app.cover_letter) form.set("comments", app.cover_letter);
  const file = await resumeBlob(ctx, app);
  if (file) form.set("resume", file.blob, file.name);
  return await post(
    `https://api.lever.co/v0/postings/${encodeURIComponent(job.board_token)}/${encodeURIComponent(job.external_id)}/apply?key=${encodeURIComponent(apiKey)}`,
    { method: "POST", body: form }, "lever", (b) => (b?.applicationId ? String(b.applicationId) : null),
  );
}

async function submitTestAts(ctx: Ctx, app: Row): Promise<AdapterResult> {
  return await post(`${SUPABASE_URL}/functions/v1/test-ats/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      job_external_id: app.job.external_id,
      idempotency_key: app.id,
      applicant: { name: ctx.profile.full_name, email: ctx.profile.email, phone: ctx.profile.phone },
      answers: (app.answers || []).map((a: PacketAnswer) => ({ field: a.field, answer: a.answer })),
      cover_letter: app.cover_letter,
      resume_name: app.resume_snapshot?.file_name ?? null,
    }),
  }, "test_ats", (b) => (b?.receipt_id ? String(b.receipt_id) : null));
}

async function post(url: string, init: RequestInit, provider: string, receiptOf: (b: Row) => string | null): Promise<AdapterResult> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30000) });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { status: "unknown", error: "The employer system did not respond in time. The application may or may not have been received." };
    }
    return { status: "retry", error: "Could not reach the employer system" };
  }
  const text = await res.text();
  if (!res.ok) return classify(res.status, text);
  let body: Row = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    status: "submitted",
    method: provider === "test_ats" ? "test_ats" : "provider_api",
    receipt_id: receiptOf(body),
    evidence: { type: "provider_response", provider, http_status: res.status, response: JSON.stringify(body).slice(0, 2000), received_at: new Date().toISOString() },
  };
}

async function verifyTestReceipt(receiptId: string): Promise<Row | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/test-ats/receipts/${encodeURIComponent(receiptId)}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.receipt_id === receiptId ? body : null;
}

async function submit(ctx: Ctx, app: Row): Promise<void> {
  const job = app.job;
  if (job.status !== "active") {
    await ctx.transition(app, "BLOCKED", { last_error: "This listing has expired or was removed by the employer." }, "Listing expired");
    return;
  }
  const { data: dupes } = await ctx.admin
    .from("applications").select("id, job:jobs!inner(dedupe_key)")
    .eq("user_id", ctx.userId).neq("id", app.id).not("submitted_at", "is", null).eq("job.dedupe_key", job.dedupe_key).limit(1);
  if (dupes?.length) {
    await ctx.transition(app, "BLOCKED", { last_error: "You already applied to this role through another listing." }, "Duplicate submission prevented");
    return;
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await ctx.admin.from("applications").select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId).gte("submitted_at", dayStart.toISOString()).in("submission_method", ["provider_api", "test_ats"]);
  if ((count ?? 0) >= ctx.prefs.daily_quota) {
    const tomorrow = new Date(dayStart.getTime() + 86400000).toISOString();
    await ctx.admin.from("applications").update({
      next_attempt_at: tomorrow, required_action: `Daily limit of ${ctx.prefs.daily_quota} reached. This will continue tomorrow.`,
    }).eq("id", app.id);
    await ctx.admin.from("application_events").insert({
      application_id: app.id, user_id: ctx.userId, from_state: "QUEUED", to_state: "QUEUED", actor: "worker", message: "Daily submission limit reached",
    });
    return;
  }

  let adapter: (() => Promise<AdapterResult>) | null = null;
  if (job.provider === "test_ats") adapter = () => submitTestAts(ctx, app);
  else if (job.provider === "greenhouse" || job.provider === "lever") {
    const { data: cred } = await ctx.admin.from("provider_credentials").select("api_key")
      .eq("provider", job.provider).eq("board_token", job.board_token).maybeSingle();
    if (cred?.api_key) adapter = job.provider === "greenhouse" ? () => submitGreenhouse(ctx, app, cred.api_key) : () => submitLever(ctx, app, cred.api_key);
  }
  if (!adapter) {
    await ctx.notify("Submit this one yourself", `${job.company} does not have an authorized submission integration. Your packet is ready.`, "action");
    await ctx.transition(app, "NEEDS_USER_ACTION", {
      required_action: "This employer has not authorized automated submissions. Open the application page, submit using your prepared packet, then record it here.",
      required_action_kind: "manual_submit",
    }, "No authorized integration; manual submission required");
    return;
  }

  const submitting = await ctx.transition(app, "SUBMITTING", { attempts: (app.attempts ?? 0) + 1, last_error: null, required_action: null }, "Submitting through authorized integration");
  if (!submitting) return;
  const result = await adapter();

  if (result.status === "submitted") {
    const submitted = await ctx.transition(submitting, "SUBMITTED", {
      submitted_at: new Date().toISOString(), submission_method: result.method, receipt_id: result.receipt_id, confirmation_evidence: result.evidence,
    }, "Employer system accepted the application", { receipt_id: result.receipt_id });
    if (submitted && result.method === "test_ats" && result.receipt_id) {
      const receipt = await verifyTestReceipt(result.receipt_id);
      if (receipt) {
        await ctx.transition(submitted, "CONFIRMED", {
          confirmed_at: new Date().toISOString(),
          confirmation_evidence: { ...result.evidence, verification: { type: "receipt_lookup", receipt, verified_at: new Date().toISOString() } },
        }, "Receipt verified with the receiving system");
      }
    }
    await ctx.notify("Application submitted", `${job.title} at ${job.company} was accepted by the employer system.`, "success");
    return;
  }
  if (result.status === "retry" && submitting.attempts < MAX_ATTEMPTS) {
    const wait = 2 ** submitting.attempts * 60000;
    await ctx.transition(submitting, "QUEUED", { last_error: result.error, next_attempt_at: new Date(Date.now() + wait).toISOString() }, `Retry scheduled: ${result.error}`);
    return;
  }
  if (result.status === "unknown") {
    await ctx.notify("Please verify a submission", `We couldn't confirm whether ${job.company} received your application.`, "warning");
    await ctx.transition(submitting, "UNKNOWN_SUBMISSION_RESULT", {
      last_error: result.error, required_action: "Check your email or the employer's portal. Record it as submitted if it went through; otherwise cancel. We will not resubmit automatically.",
      required_action_kind: "verify",
    }, result.error);
    return;
  }
  if (result.status === "needs_user") {
    await ctx.transition(submitting, "NEEDS_USER_ACTION", { last_error: result.error, required_action: result.error, required_action_kind: "manual_submit" }, result.error);
    return;
  }
  await ctx.notify("Application failed", `${job.title} at ${job.company}: ${result.error}`, "error");
  await ctx.transition(submitting, "FAILED", { last_error: result.error }, result.error);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const [{ data: prefs }, { data: profile }] = await Promise.all([
      admin.from("candidate_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    if (!prefs || !profile) return json({ error: "Complete your profile first" }, 400);
    if (prefs.automation_paused) return json({ paused: true, processed: 0 });

    const ctx = new Ctx(admin, user.id, prefs, profile);
    const now = new Date().toISOString();
    const { data: apps, error } = await admin.from("applications").select("*, job:jobs(*)")
      .eq("user_id", user.id).eq("state", "QUEUED").or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order("created_at", { ascending: true }).limit(10);
    if (error) throw error;

    let processed = 0;
    for (const app of apps || []) {
      const { data: fresh } = await admin.from("candidate_preferences").select("automation_paused").eq("user_id", user.id).maybeSingle();
      if (fresh?.automation_paused) break;
      try {
        let current: Row | null = app;
        if (!current.prepared_at) current = await prepare(ctx, current);
        if (current && current.state === "QUEUED" && current.prepared_at) {
          const approved = Boolean(current.user_approved_at);
          const auto = current.mode === "auto" && prefs.apply_mode === "auto" && prefs.auto_apply_consent_at;
          if (approved || auto) await submit(ctx, current);
          else await ctx.transition(current, "READY_FOR_REVIEW", {}, "Waiting for your approval");
        }
        processed++;
      } catch (e) {
        console.error("application processing failed", app.id, e);
        const { data: latest } = await admin.from("applications").select("state").eq("id", app.id).maybeSingle();
        const unsafe = latest?.state === "SUBMITTING";
        await admin.from("applications").update({
          state: unsafe ? "UNKNOWN_SUBMISSION_RESULT" : "FAILED",
          last_error: "An unexpected error occurred while processing this application.",
          required_action: unsafe ? "Verify with the employer whether this was received before retrying." : null,
          updated_at: new Date().toISOString(),
        }).eq("id", app.id);
        await admin.from("application_events").insert({
          application_id: app.id, user_id: user.id, from_state: latest?.state ?? null, to_state: unsafe ? "UNKNOWN_SUBMISSION_RESULT" : "FAILED",
          actor: "worker", message: "Unexpected processing error",
        });
      }
    }
    return json({ processed, paused: false });
  } catch (err) {
    console.error("application-worker failed", err);
    return json({ error: "The application queue could not be processed. Please try again." }, 500);
  }
});
