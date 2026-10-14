import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildAnswers, chooseResume, coverLetter, formGaps, greenhouseQuestions, isProfileField, standardQuestions, tailorResume,
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
  | { status: "submitted"; receipt_id: string | null; evidence: Row }
  | { status: "retry" | "failed" | "unknown" | "needs_user"; error: string; evidence?: Row };

class Ctx {
  constructor(public admin: SupabaseClient, public userId: string, public prefs: Row, public profile: Row) {}

  async transition(app: Row, to: string, patch: Row, message: string, data: Row = {}, guard: Row = {}): Promise<Row | null> {
    const { data: rows, error } = await this.admin
      .from("applications")
      .update({ ...patch, state: to, updated_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("state", app.state)
      .match(guard)
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

async function greenhouseForm(job: Row): Promise<Question[] | null> {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.board_token)}/jobs/${encodeURIComponent(job.external_id)}?questions=true`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return null;
    const qs = greenhouseQuestions(await res.json());
    return qs.length ? qs : null;
  } catch (e) {
    console.error("question fetch failed", e);
    return null;
  }
}

async function fetchQuestions(job: Row): Promise<Question[]> {
  if (job.provider === "greenhouse") return (await greenhouseForm(job)) ?? standardQuestions();
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
  if (!data || data.size === 0) return null;
  return { blob: data, name: app.resume_snapshot?.file_name || "resume.pdf" };
}

function classify(status: number, body: string): AdapterResult {
  if (status === 429 || status === 503) return { status: "retry", error: `Employer system temporarily unavailable (${status})` };
  if (status >= 500) {
    return { status: "unknown", error: `The employer system returned an error (${status}) after receiving the request. It may or may not have been recorded.` };
  }
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

function greenhouseRequest(ctx: Ctx, app: Row, apiKey: string, file: { blob: Blob; name: string }, form: Question[]) {
  const job = app.job;
  const body = new FormData();
  const { first, last } = splitName(ctx.profile.full_name);
  body.set("first_name", first);
  body.set("last_name", last);
  body.set("email", ctx.profile.email);
  if (ctx.profile.phone) body.set("phone", ctx.profile.phone);
  body.set("resume", file.blob, file.name);
  if (app.cover_letter) body.set("cover_letter_text", app.cover_letter);
  const allowed = new Set(form.map((q) => q.field));
  for (const a of (app.answers || []) as PacketAnswer[]) {
    if (isProfileField(a.field) || !allowed.has(a.field)) continue;
    if (a.answer && a.type !== "input_file") body.set(a.field, answerValue(a));
  }
  return () => post(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.board_token)}/jobs/${encodeURIComponent(job.external_id)}`, {
    method: "POST", body, headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}` },
  }, (b) => (b?.id ? String(b.id) : null));
}

async function post(url: string, init: RequestInit, receiptOf: (b: Row) => string | null): Promise<AdapterResult> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30000) });
  } catch (e) {
    console.error("submission request failed", e);
    return { status: "unknown", error: "The connection to the employer system was interrupted. The application may or may not have been received." };
  }
  let text = "";
  try {
    text = await res.text();
  } catch {
    if (res.ok) return { status: "unknown", error: "The employer system's reply was cut off. The application may or may not have been received." };
  }
  if (!res.ok) return classify(res.status, text);
  let body: Row = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    status: "submitted",
    receipt_id: receiptOf(body),
    evidence: { type: "provider_response", provider: "greenhouse", http_status: res.status, response: JSON.stringify(body).slice(0, 2000), received_at: new Date().toISOString() },
  };
}

async function toManual(ctx: Ctx, app: Row, reason: string, kind = "manual_submit") {
  await ctx.notify("Finish this one yourself", `${app.job.title} at ${app.job.company}: ${reason}`, "action");
  await ctx.transition(app, "NEEDS_USER_ACTION", {
    user_approved_at: null,
    required_action: `${reason} Open the application page, submit using your prepared packet, then record it here.`,
    required_action_kind: kind,
  }, reason);
}

async function prepareSend(ctx: Ctx, app: Row): Promise<(() => Promise<AdapterResult>) | string> {
  const job = app.job;
  if (job.provider === "lever") {
    return "Lever's application system can't tell us this employer's custom questions, so we won't send an incomplete application.";
  }
  if (job.provider !== "greenhouse") return "We don't have an authorized way to submit to this employer's application system.";

  const { data: cred } = await ctx.admin.from("provider_credentials").select("api_key")
    .eq("provider", "greenhouse").eq("board_token", job.board_token).maybeSingle();
  if (!cred?.api_key) return "This employer has not authorized automated submissions.";

  const form = await greenhouseForm(job);
  if (!form) return "We couldn't load the employer's current application form, so we won't guess at its questions.";
  const gaps = formGaps(form, (app.answers || []) as PacketAnswer[], { phone: Boolean(ctx.profile.phone), coverLetter: Boolean(app.cover_letter) });
  if (gaps.length) {
    return `The employer's form has required items we can't fill automatically (${gaps.slice(0, 3).join(", ")}${gaps.length > 3 ? ", ..." : ""}).`;
  }

  const file = await resumeBlob(ctx, app);
  if (!file) return "Your resume file couldn't be attached.";
  return greenhouseRequest(ctx, app, cred.api_key, file, form);
}

async function submit(ctx: Ctx, app: Row): Promise<void> {
  const job = app.job;
  const send = await prepareSend(ctx, app);
  if (typeof send === "string") {
    await toManual(ctx, app, send, send.startsWith("Your resume") ? "resume" : "manual_submit");
    return;
  }

  const { data: claim, error } = await ctx.admin.rpc("claim_application_for_submit", { p_app: app.id, p_user: ctx.userId });
  if (error) throw error;
  if (claim?.result !== "claimed" || !claim.attempt_id) return;

  const { data: submitting } = await ctx.admin.from("applications").select("*, job:jobs(*)")
    .eq("id", app.id).eq("submission_attempt_id", claim.attempt_id).eq("state", "SUBMITTING").maybeSingle();
  if (!submitting) return;
  const guard = { submission_attempt_id: claim.attempt_id };

  const result = await send();

  if (result.status === "submitted") {
    await ctx.transition(submitting, "SUBMITTED", {
      submitted_at: new Date().toISOString(), submission_method: "provider_api", evidence_level: "provider_accepted",
      receipt_id: result.receipt_id, confirmation_evidence: { ...result.evidence, attempt_id: claim.attempt_id },
    }, "Employer system accepted the application", { receipt_id: result.receipt_id, attempt_id: claim.attempt_id }, guard);
    await ctx.notify("Application sent", `${job.title} at ${job.company} was accepted by the employer's application system.`, "success");
    return;
  }
  if (result.status === "retry" && submitting.attempts < MAX_ATTEMPTS) {
    const wait = 2 ** submitting.attempts * 60000;
    await ctx.transition(submitting, "QUEUED", { last_error: result.error, next_attempt_at: new Date(Date.now() + wait).toISOString() }, `Retry scheduled: ${result.error}`, { attempt_id: claim.attempt_id }, guard);
    return;
  }
  if (result.status === "unknown") {
    await ctx.notify("Please check a submission", `We couldn't confirm whether ${job.company} received your application.`, "warning");
    await ctx.transition(submitting, "UNKNOWN_SUBMISSION_RESULT", {
      last_error: result.error,
      required_action: "Check your email or the employer's portal. Record it as submitted if it went through; otherwise cancel. We will not resend it automatically.",
      required_action_kind: "verify",
    }, result.error, { attempt_id: claim.attempt_id }, guard);
    return;
  }
  if (result.status === "needs_user") {
    await ctx.transition(submitting, "NEEDS_USER_ACTION", { last_error: result.error, required_action: result.error, required_action_kind: "manual_submit" }, result.error, { attempt_id: claim.attempt_id }, guard);
    return;
  }
  await ctx.notify("Application not accepted", `${job.title} at ${job.company}: ${result.error}`, "error");
  await ctx.transition(submitting, "FAILED", { last_error: result.error }, result.error, { attempt_id: claim.attempt_id }, guard);
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
          if (current.user_approved_at || current.mode === "auto") await submit(ctx, current);
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
          required_action_kind: unsafe ? "verify" : null,
          updated_at: new Date().toISOString(),
        }).eq("id", app.id).eq("state", latest?.state ?? "QUEUED");
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
