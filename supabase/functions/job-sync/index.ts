import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { normalizeAshby, normalizeGreenhouse, normalizeLever, normalizeTestAts, normalizeWorkday, type NormalizedJob } from "./normalize.ts";
import { companyGuesses, discoverFromUrl, jobSiteMessage, looksLikeCompanyName, type DetectedBoard } from "./discover.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Admin = ReturnType<typeof createClient>;

const TOKEN_RE = /^[A-Za-z0-9._-]{1,100}(\/[A-Za-z0-9._-]{1,80})?$/;
const WORKDAY_RE = /^([a-z0-9-]{1,60})\.(wd\d{1,3})\/([A-Za-z0-9_.-]{1,80})$/i;
const DIRECTORY_PROVIDERS = new Set(["greenhouse", "lever", "ashby", "workday"]);
const REFRESH_HOURS = 12;
const FOLLOWED_REFRESH_HOURS = 1;
const WORKDAY_PAGES = 3;
const WORKDAY_DETAILS = 40;
const SCHEDULED_BATCH = 20;
const SCHEDULED_BUDGET_MS = 110_000;
const DAILY_DISCOVERIES = 40;
const NOT_FOUND = "Board not found. Check the board name.";
async function getJson(url: string, headers: Record<string, string> = {}, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...headers }, redirect: "error", signal: AbortSignal.timeout(20000) });
  if (res.status === 404) throw new Error(NOT_FOUND);
  if (res.status === 429) throw new Error("The job board is rate limiting requests. It will be retried on the next refresh.");
  if (!res.ok) throw new Error(`Job board responded with status ${res.status}`);
  return await res.json();
}

const prettyName = (s: string) => s.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Workday has no official public API; this reads the same JSON its public career pages load.
async function fetchWorkday(admin: Admin, token: string, company: string): Promise<{ jobs: NormalizedJob[]; company: string }> {
  const m = token.match(WORKDAY_RE);
  if (!m) throw new Error("Invalid board name");
  const [, tenant, wd, site] = m;
  const host = `https://${tenant}.${wd}.myworkdayjobs.com`;
  const api = `${host}/wday/cxs/${tenant}/${site}`;
  const page = (offset: number) => getJson(`${api}/jobs`, { "Content-Type": "application/json", "Accept-Language": "en-US" }, {
    method: "POST", body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }),
  });
  const first = await page(0);
  if (!Array.isArray(first?.jobPostings)) throw new Error("Unexpected response from Workday");
  const more = first.jobPostings.length < 20 ? [] : await Promise.all(
    Array.from({ length: WORKDAY_PAGES - 1 }, (_, i) => page((i + 1) * 20).catch(() => ({}))),
  );
  // deno-lint-ignore no-explicit-any
  const listings = [first, ...more].flatMap((p: any) => Array.isArray(p?.jobPostings) ? p.jobPostings : []);

  const { data: existing } = await admin.from("jobs").select("external_id, description, company").eq("provider", "workday").eq("board_token", token);
  const known = new Map((existing ?? []).filter((e) => e.description).map((e) => [e.external_id as string, e.description as string]));
  // deno-lint-ignore no-explicit-any
  const details = new Map<string, any>();
  const missing = listings.filter((l) => typeof l?.externalPath === "string" && !known.has(l.externalPath)).slice(0, WORKDAY_DETAILS);
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(missing.slice(i, i + 5).map(async (l) => {
      try { details.set(l.externalPath, await getJson(`${api}${l.externalPath}`, { "Accept-Language": "en-US" })); } catch { /* listing still usable */ }
    }));
  }
  const fromDetail = [...details.values()].map((d) => d?.hiringOrganization?.name).find((n) => typeof n === "string" && n.trim());
  const name = company || (existing?.find((e) => e.company)?.company as string | undefined) || fromDetail || prettyName(tenant);
  return { jobs: normalizeWorkday(listings, details, known, { token, host, site, company: name }), company: name };
}

async function probeBoard(b: DetectedBoard): Promise<number | null> {
  const t = encodeURIComponent(b.token);
  const url = b.provider === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`
    : b.provider === "lever" ? `https://api.lever.co/v0/postings/${t}?mode=json`
    : `https://api.ashbyhq.com/posting-api/job-board/${t}`;
  try {
    const data = await getJson(url);
    const list = Array.isArray(data) ? data : data?.jobs;
    return Array.isArray(list) ? list.length : null;
  } catch {
    return null;
  }
}

async function fetchProvider(admin: Admin, provider: string, token: string, company: string): Promise<{ jobs: NormalizedJob[]; company: string }> {
  const t = encodeURIComponent(token);
  switch (provider) {
    case "greenhouse": {
      let name = company;
      if (!name) {
        try {
          const board = await getJson(`https://boards-api.greenhouse.io/v1/boards/${t}`);
          name = String(board?.name ?? token);
        } catch {
          name = token;
        }
      }
      const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`);
      return { jobs: normalizeGreenhouse(data, token, name), company: name };
    }
    case "lever": {
      const name = company || token;
      const data = await getJson(`https://api.lever.co/v0/postings/${t}?mode=json`);
      return { jobs: normalizeLever(data, token, name), company: name };
    }
    case "ashby": {
      const name = company || token;
      const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`);
      return { jobs: normalizeAshby(data, token, name), company: name };
    }
    case "test_ats": {
      const base = Deno.env.get("SUPABASE_URL")!;
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const data = await getJson(`${base}/functions/v1/test-ats/jobs?board=${t}`, { Authorization: `Bearer ${key}` });
      return { jobs: normalizeTestAts(data, token), company: company || "Sandbox Labs (Test)" };
    }
    case "workday":
      return await fetchWorkday(admin, token, company);
    default:
      throw new Error("Unsupported provider");
  }
}

async function syncBoard(admin: Admin, provider: string, token: string, company: string) {
  if (!TOKEN_RE.test(token)) throw new Error("Invalid board name");
  const started = new Date().toISOString();
  const { jobs, company: name } = await fetchProvider(admin, provider, token, company);
  const unique = new Map(jobs.slice(0, 3000).map((j) => [j.external_id, j]));
  const rows = [...unique.values()].map((j) => ({ ...j, status: "active", last_seen_at: started }));
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await admin.from("jobs").upsert(rows.slice(i, i + 300), { onConflict: "provider,board_token,external_id" });
    if (error) throw error;
  }
  const { data: expired, error } = await admin.from("jobs").update({ status: "expired" })
    .eq("provider", provider).eq("board_token", token).eq("status", "active").lt("last_seen_at", started).select("id");
  if (error) throw error;
  return { jobs: rows.length, expired: expired?.length ?? 0, company: name };
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message.slice(0, 400) : "Sync failed");

async function recordBoardResult(admin: Admin, provider: string, token: string, result: { jobs: number; company: string } | { error: string }) {
  const now = new Date().toISOString();
  const ok = !("error" in result);
  await admin.from("job_sources").update(ok
    ? { last_synced_at: now, last_error: null, last_job_count: result.jobs }
    : { last_synced_at: now, last_error: result.error }).eq("provider", provider).eq("board_token", token);
  if (!DIRECTORY_PROVIDERS.has(provider)) return;
  await admin.from("discovered_boards").upsert({ provider, board_token: token, discovered_via: "follow" }, { onConflict: "provider,board_token", ignoreDuplicates: true });
  await admin.from("discovered_boards").update(ok
    ? { status: "active", job_count: result.jobs, last_checked_at: now, last_error: null }
    : { status: result.error === NOT_FOUND ? "not_found" : "error", last_checked_at: now, last_error: result.error }).eq("provider", provider).eq("board_token", token);
  if (ok && result.company) {
    await admin.from("discovered_boards").update({ company_name: result.company }).eq("provider", provider).eq("board_token", token).eq("company_name", "");
  }
}

async function syncUserSources(admin: Admin, userId: string, sourceId: string | null) {
  let q = admin.from("job_sources").select("*").eq("user_id", userId).eq("active", true);
  if (sourceId) q = q.eq("id", sourceId);
  const { data: sources, error } = await q;
  if (error) throw error;
  const results: { source_id: string; provider: string; jobs: number; expired: number; error?: string }[] = [];
  for (const s of sources || []) {
    try {
      const r = await syncBoard(admin, s.provider, s.board_token, s.company_name);
      await recordBoardResult(admin, s.provider, s.board_token, r);
      if (!s.company_name) await admin.from("job_sources").update({ company_name: r.company }).eq("id", s.id);
      results.push({ source_id: s.id, provider: s.provider, jobs: r.jobs, expired: r.expired });
    } catch (e) {
      console.error("source sync failed", s.id, e);
      await recordBoardResult(admin, s.provider, s.board_token, { error: errorMessage(e) });
      results.push({ source_id: s.id, provider: s.provider, jobs: 0, expired: 0, error: errorMessage(e) });
    }
  }
  await admin.from("audit_logs").insert({ user_id: userId, actor_id: userId, action: "jobs.sync", entity: "job_sources", details: { results } });
  return { results };
}

type BoardOutcome = { provider: string; board_token: string; company: string; status: "added" | "already_following" | "unsupported" | "error"; jobs: number; message?: string; source_id?: string };

async function followBoard(admin: Admin, userId: string, b: DetectedBoard, via: string): Promise<BoardOutcome> {
  await admin.from("discovered_boards").upsert({
    provider: b.provider, board_token: b.token, source_url: b.url, discovered_via: via,
    status: "active",
  }, { onConflict: "provider,board_token", ignoreDuplicates: true });
  const { data: existing } = await admin.from("job_sources").select("id, company_name").eq("user_id", userId).eq("provider", b.provider).eq("board_token", b.token).maybeSingle();
  let sourceId = existing?.id as string | undefined;
  if (!sourceId) {
    const { data, error } = await admin.from("job_sources").insert({ user_id: userId, provider: b.provider, board_token: b.token }).select("id").maybeSingle();
    if (error || !data) throw error ?? new Error("Could not save the board");
    sourceId = data.id;
  }
  try {
    const r = await syncBoard(admin, b.provider, b.token, (existing?.company_name as string) ?? "");
    await recordBoardResult(admin, b.provider, b.token, r);
    await admin.from("job_sources").update({ company_name: r.company }).eq("id", sourceId).eq("company_name", "");
    return { provider: b.provider, board_token: b.token, company: r.company, status: existing ? "already_following" : "added", jobs: r.jobs, source_id: sourceId };
  } catch (e) {
    const message = errorMessage(e);
    await recordBoardResult(admin, b.provider, b.token, { error: message });
    if (!existing && message === NOT_FOUND) await admin.from("job_sources").delete().eq("id", sourceId);
    return { provider: b.provider, board_token: b.token, company: b.token, status: "error", jobs: 0, message };
  }
}

async function discover(admin: Admin, userId: string, rawUrls: unknown) {
  const urls = (Array.isArray(rawUrls) ? rawUrls : []).filter((u): u is string => typeof u === "string" && u.trim().length >= 2 && u.length <= 2000).map((u) => u.trim()).slice(0, 10);
  if (!urls.length) return { status: 400, body: { error: "Paste at least one link." } };
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("action", "jobs.discover").gte("created_at", since);
  if ((count ?? 0) >= DAILY_DISCOVERIES) return { status: 429, body: { error: `You've reached today's limit of ${DAILY_DISCOVERIES} board searches. Try again tomorrow.` } };

  const results: { input: string; boards: BoardOutcome[]; error?: string }[] = [];
  let budget = 10;
  for (const input of urls) {
    try {
      const blocked = jobSiteMessage(input);
      if (blocked) { results.push({ input, boards: [], error: blocked }); continue; }
      if (looksLikeCompanyName(input)) {
        const guesses = companyGuesses(input);
        const counts = await Promise.all(guesses.map(probeBoard));
        const best = guesses.map((b, i) => ({ b, n: counts[i] })).filter((x) => x.n !== null).sort((x, y) => (y.n ?? 0) - (x.n ?? 0))[0];
        if (!best) { results.push({ input, boards: [], error: `We couldn't find a Greenhouse, Lever or Ashby board for "${input}". Paste a link to their careers page or one of their job posts instead (Workday companies need a link).` }); continue; }
        const outcome = await followBoard(admin, userId, best.b, "url");
        budget -= 1;
        results.push({ input, boards: [outcome] });
        if (budget <= 0) break;
        continue;
      }
      const { boards, via } = await discoverFromUrl(input);
      if (!boards.length) { results.push({ input, boards: [], error: "No Greenhouse, Lever, Ashby or Workday board was found on that page. Some career sites load listings in a way we can't read; try pasting a link to one of their job posts instead." }); continue; }
      const outcomes: BoardOutcome[] = [];
      for (const b of boards.slice(0, budget)) outcomes.push(await followBoard(admin, userId, b, via));
      budget -= outcomes.length;
      results.push({ input, boards: outcomes });
    } catch (e) {
      console.error("discover failed", input, e);
      results.push({ input, boards: [], error: e instanceof Error && e.message.length < 200 ? e.message : "We couldn't read that page." });
    }
    if (budget <= 0) break;
  }
  await admin.from("audit_logs").insert({
    user_id: userId, actor_id: userId, action: "jobs.discover", entity: "job_sources",
    details: { inputs: urls.length, boards: results.flatMap((r) => r.boards.map((b) => `${b.provider}:${b.board_token}:${b.status}`)) },
  });
  return { status: 200, body: { results } };
}

function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function scheduledRefresh(admin: Admin) {
  const startedAt = Date.now();
  const { data: run } = await admin.from("discovery_runs").insert({}).select("id").maybeSingle();

  const { data: followed } = await admin.from("job_sources").select("provider, board_token, company_name").eq("active", true).in("provider", [...DIRECTORY_PROVIDERS]).limit(5000);
  const seen = new Map((followed ?? []).map((s) => [`${s.provider}:${s.board_token}`, { provider: s.provider, board_token: s.board_token, company_name: s.company_name ?? "", discovered_via: "follow" }]));
  if (seen.size) await admin.from("discovered_boards").upsert([...seen.values()], { onConflict: "provider,board_token", ignoreDuplicates: true });

  const followedCutoff = new Date(Date.now() - FOLLOWED_REFRESH_HOURS * 3600_000).toISOString();
  const directoryCutoff = Date.now() - REFRESH_HOURS * 3600_000;
  const { data: candidates, error } = await admin.from("discovered_boards").select("provider, board_token, company_name, last_checked_at")
    .in("status", ["active", "error"]).in("provider", [...DIRECTORY_PROVIDERS])
    .or(`last_checked_at.is.null,last_checked_at.lt.${followedCutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(500);
  if (error) throw error;
  const due = (candidates ?? []).filter((b) => !b.last_checked_at || seen.has(`${b.provider}:${b.board_token}`) || Date.parse(b.last_checked_at) < directoryCutoff)
    .slice(0, SCHEDULED_BATCH);

  let checked = 0, jobsSeen = 0, errors = 0;
  for (const b of due) {
    if (Date.now() - startedAt > SCHEDULED_BUDGET_MS) break;
    try {
      const r = await syncBoard(admin, b.provider, b.board_token, b.company_name ?? "");
      await recordBoardResult(admin, b.provider, b.board_token, r);
      jobsSeen += r.jobs;
    } catch (e) {
      errors++;
      console.error("scheduled board refresh failed", b.provider, b.board_token, e);
      await recordBoardResult(admin, b.provider, b.board_token, { error: errorMessage(e) });
    }
    checked++;
  }
  if (run?.id) await admin.from("discovery_runs").update({ finished_at: new Date().toISOString(), boards_checked: checked, jobs_seen: jobsSeen, errors }).eq("id", run.id);
  return { boards_checked: checked, jobs_seen: jobsSeen, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    if (body?.mode === "scheduled") {
      const provided = req.headers.get("x-cron-token") ?? "";
      const { data: cfg } = await admin.from("discovery_config").select("cron_token").eq("id", 1).maybeSingle();
      if (!cfg || !sameSecret(provided, cfg.cron_token as string)) return json({ error: "Not authorized" }, 401);
      return json(await scheduledRefresh(admin));
    }

    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    if (body?.mode === "discover") {
      const { status, body: out } = await discover(admin, user.id, body.urls);
      return json(out, status);
    }
    return json(await syncUserSources(admin, user.id, typeof body?.source_id === "string" ? body.source_id : null));
  } catch (err) {
    console.error("job-sync failed", err);
    return json({ error: "Job sync failed. Please try again." }, 500);
  }
});
