export type NormalizedJob = {
  provider: string;
  board_token: string;
  external_id: string;
  title: string;
  company: string;
  location: string;
  work_arrangement: "remote" | "hybrid" | "onsite" | "unknown";
  department: string;
  employment_type: string;
  seniority: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string;
  url: string;
  apply_url: string | null;
  posted_at: string | null;
  dedupe_key: string;
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function htmlToText(html: string): string {
  const decoded = decodeEntities(decodeEntities(html || ""));
  return decoded
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, 20000);
}

export function detectArrangement(...parts: (string | null | undefined)[]): NormalizedJob["work_arrangement"] {
  const t = parts.filter(Boolean).join(" ").toLowerCase();
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bremote\b|work from home|distributed/.test(t)) return "remote";
  if (/\bon[- ]?site\b|in[- ]office|in person/.test(t)) return "onsite";
  return "unknown";
}

export function inferLevel(title: string): string {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\b(vp|vice president|director|chief|head of)\b/.test(t)) return "executive";
  if (/\b(lead|principal|staff|manager)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|entry|graduate|new grad|associate)\b/.test(t)) return "entry";
  return "mid";
}

export function parseSalary(text: string): { min: number | null; max: number | null } {
  const m = text.match(/\$\s?(\d{2,3}(?:[,.]\d{3})?)\s*(k|K)?\s*(?:-|–|to)\s*\$?\s?(\d{2,3}(?:[,.]\d{3})?)\s*(k|K)?/);
  if (!m) return { min: null, max: null };
  const toNum = (v: string, k?: string) => {
    let n = Number(v.replace(/[,.]/g, ""));
    if (k || n < 1000) n *= 1000;
    return n;
  };
  const min = toNum(m[1], m[2] || m[4]);
  const max = toNum(m[3], m[4]);
  if (min < 10000 || max > 2000000 || max < min) return { min: null, max: null };
  return { min, max };
}

export function dedupeKey(company: string, title: string, location: string): string {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${n(company)}|${n(title)}|${n(location)}`;
}

function safeUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function finish(j: Omit<NormalizedJob, "dedupe_key" | "seniority"> & { seniority?: string }): NormalizedJob | null {
  if (!j.external_id || !j.title || !j.url) return null;
  return {
    ...j,
    title: j.title.slice(0, 300),
    company: j.company.slice(0, 200),
    location: j.location.slice(0, 300),
    seniority: j.seniority || inferLevel(j.title),
    dedupe_key: dedupeKey(j.company, j.title, j.location),
  };
}

// deno-lint-ignore no-explicit-any
type Any = any;

export function normalizeGreenhouse(payload: Any, token: string, company: string): NormalizedJob[] {
  const jobs: Any[] = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.map((j) => {
    const description = htmlToText(String(j.content ?? ""));
    const location = String(j.location?.name ?? "");
    const salary = parseSalary(description);
    const url = safeUrl(j.absolute_url);
    const id = String(j.id ?? "");
    // Company career sites often embed the Greenhouse form in a frame; the hosted page shows the form directly.
    const hostedForm = /^\d+$/.test(id) ? `https://job-boards.greenhouse.io/${encodeURIComponent(token)}/jobs/${id}` : null;
    return finish({
      provider: "greenhouse",
      board_token: token,
      external_id: String(j.id ?? ""),
      title: String(j.title ?? ""),
      company,
      location,
      work_arrangement: detectArrangement(location, j.title),
      department: String(j.departments?.[0]?.name ?? ""),
      employment_type: "",
      salary_min: salary.min,
      salary_max: salary.max,
      salary_currency: salary.min ? "USD" : null,
      description,
      url: url ?? "",
      apply_url: hostedForm ?? url,
      posted_at: j.updated_at ?? null,
    });
  }).filter((j): j is NormalizedJob => j !== null);
}

export function normalizeLever(payload: Any, token: string, company: string): NormalizedJob[] {
  const jobs: Any[] = Array.isArray(payload) ? payload : [];
  return jobs.map((j) => {
    const description = [j.descriptionPlain, ...(j.lists || []).map((l: Any) => `${l.text}\n${htmlToText(l.content || "")}`), j.additionalPlain]
      .filter(Boolean).join("\n\n").slice(0, 20000);
    const location = String(j.categories?.location ?? "");
    const workplace = String(j.workplaceType ?? "");
    const fromText = parseSalary(description);
    return finish({
      provider: "lever",
      board_token: token,
      external_id: String(j.id ?? ""),
      title: String(j.text ?? ""),
      company,
      location,
      work_arrangement: workplace === "remote" || workplace === "hybrid" ? workplace : workplace === "onsite" ? "onsite" : detectArrangement(location),
      department: String(j.categories?.team ?? j.categories?.department ?? ""),
      employment_type: String(j.categories?.commitment ?? ""),
      salary_min: Number(j.salaryRange?.min) || fromText.min,
      salary_max: Number(j.salaryRange?.max) || fromText.max,
      salary_currency: j.salaryRange?.currency ?? (fromText.min ? "USD" : null),
      description,
      url: safeUrl(j.hostedUrl) ?? "",
      apply_url: safeUrl(j.applyUrl),
      posted_at: j.createdAt ? new Date(Number(j.createdAt)).toISOString() : null,
    });
  }).filter((j): j is NormalizedJob => j !== null);
}

export function normalizeAshby(payload: Any, token: string, company: string): NormalizedJob[] {
  const jobs: Any[] = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.filter((j) => j.isListed !== false).map((j) => {
    const description = String(j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? "")).slice(0, 20000);
    const location = String(j.location ?? "");
    const comp = (j.compensation?.summaryComponents || []).find((c: Any) => c.compensationType === "Salary");
    const workplace = String(j.workplaceType ?? "").toLowerCase();
    return finish({
      provider: "ashby",
      board_token: token,
      external_id: String(j.id ?? ""),
      title: String(j.title ?? ""),
      company,
      location,
      work_arrangement: j.isRemote ? "remote" : workplace === "hybrid" ? "hybrid" : workplace === "onsite" ? "onsite" : detectArrangement(location),
      department: String(j.department ?? j.team ?? ""),
      employment_type: String(j.employmentType ?? ""),
      salary_min: comp?.minValue ? Math.round(comp.minValue) : null,
      salary_max: comp?.maxValue ? Math.round(comp.maxValue) : null,
      salary_currency: comp?.currencyCode ?? null,
      description,
      url: safeUrl(j.jobUrl) ?? "",
      apply_url: safeUrl(j.applyUrl),
      posted_at: j.publishedAt ?? null,
    });
  }).filter((j): j is NormalizedJob => j !== null);
}

export function normalizeTestAts(payload: Any, token: string): NormalizedJob[] {
  const jobs: Any[] = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.map((j) => finish({
    provider: "test_ats",
    board_token: token,
    external_id: String(j.id ?? ""),
    title: String(j.title ?? ""),
    company: String(j.company ?? "Sandbox Labs (Test)"),
    location: String(j.location ?? ""),
    work_arrangement: detectArrangement(j.location, j.workplace),
    department: String(j.department ?? ""),
    employment_type: String(j.employment_type ?? ""),
    salary_min: j.salary_min ?? null,
    salary_max: j.salary_max ?? null,
    salary_currency: j.salary_min ? "USD" : null,
    description: String(j.description ?? ""),
    url: safeUrl(j.url) ?? "",
    apply_url: safeUrl(j.url) ?? "",
    posted_at: j.posted_at ?? null,
  })).filter((j): j is NormalizedJob => j !== null);
}

// Workday only says "Posted Today" / "Posted 3 Days Ago"; anchor to start of day so the value is stable between syncs.
export function workdayPostedAt(text: string, now = Date.now()): string | null {
  const t = (text || "").toLowerCase();
  let days: number | null = null;
  if (t.includes("today")) days = 0;
  else if (t.includes("yesterday")) days = 1;
  else {
    const m = t.match(/(\d+)\+?\s*days?\s*ago/);
    if (m) days = Number(m[1]);
  }
  if (days !== null) return new Date((Math.floor(now / 864e5) - days) * 864e5).toISOString();
  const parsed = Date.parse(t.replace(/^posted\s*(on)?\s*/, ""));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export type WorkdayContext = { token: string; host: string; site: string; company: string; now?: number };

export function normalizeWorkday(listings: Any[], details: Map<string, Any>, known: Map<string, string>, ctx: WorkdayContext): NormalizedJob[] {
  const seen = new Set<string>();
  const out: NormalizedJob[] = [];
  for (const l of listings) {
    const path = typeof l?.externalPath === "string" ? l.externalPath : "";
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const info = details.get(path)?.jobPostingInfo ?? {};
    const description = info.jobDescription ? htmlToText(String(info.jobDescription)) : known.get(path) ?? "";
    const location = String(info.location ?? l.locationsText ?? "");
    const salary = parseSalary(description);
    const jobPath = path.startsWith("/job/") ? path : `/job${path.startsWith("/") ? "" : "/"}${path}`;
    const url = safeUrl(info.externalUrl) ?? safeUrl(`${ctx.host}/en-US/${ctx.site}${jobPath}`);
    const job = finish({
      provider: "workday",
      board_token: ctx.token,
      external_id: path.slice(0, 500),
      title: String(info.title ?? l.title ?? ""),
      company: ctx.company,
      location,
      work_arrangement: detectArrangement(String(info.remoteType ?? ""), location, String(l.remoteType ?? "")),
      department: "",
      employment_type: String(info.timeType ?? l.timeType ?? ""),
      salary_min: salary.min,
      salary_max: salary.max,
      salary_currency: salary.min ? "USD" : null,
      description,
      url: url ?? "",
      apply_url: url ? `${url.replace(/\/$/, "")}/apply` : null,
      posted_at: (info.startDate && !Number.isNaN(Date.parse(String(info.startDate))) ? new Date(String(info.startDate)).toISOString() : null)
        ?? workdayPostedAt(String(l.postedOn ?? ""), ctx.now),
    });
    if (job) out.push(job);
  }
  return out;
}
