export type BoardProvider = "greenhouse" | "lever" | "ashby" | "workday";
export type DetectedBoard = { provider: BoardProvider; token: string; url: string };

const TOKEN_RE = /^[A-Za-z0-9._-]{1,100}$/;
const RESERVED = new Set(["embed", "v1", "boards", "api", "jobs", "job_board", "posting-api", "job-board"]);
const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

const firstSegment = (u: URL) => decodeURIComponent(u.pathname.split("/").filter(Boolean)[0] ?? "");
const ok = (provider: BoardProvider, token: string, url: string): DetectedBoard | null =>
  TOKEN_RE.test(token) && !RESERVED.has(token.toLowerCase()) ? { provider, token: provider === "workday" ? token : token.toLowerCase(), url } : null;

export function parseBoardUrl(raw: string): DetectedBoard | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const clean = `${u.origin}${u.pathname}`.slice(0, 2000);

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    if (segs[0] === "embed") return ok("greenhouse", u.searchParams.get("for") ?? "", clean);
    return ok("greenhouse", firstSegment(u), clean);
  }
  if (host === "boards-api.greenhouse.io" && segs[0] === "v1" && segs[1] === "boards") return ok("greenhouse", segs[2] ?? "", clean);
  if (host === "jobs.lever.co") return ok("lever", firstSegment(u), clean);
  if (host === "api.lever.co" && segs[0] === "v0" && segs[1] === "postings") return ok("lever", segs[2] ?? "", clean);
  if (host === "jobs.ashbyhq.com") return ok("ashby", firstSegment(u), clean);
  if (host === "api.ashbyhq.com" && segs[0] === "posting-api" && segs[1] === "job-board") return ok("ashby", segs[2] ?? "", clean);

  const wd = host.match(/^([a-z0-9-]+)\.(wd\d{1,3})\.myworkdayjobs\.com$/);
  if (wd) {
    const site = (segs[0] === "wday" ? segs[3] : segs.find((s) => !/^[a-z]{2}(-[A-Za-z]{2})?$/.test(s))) ?? "";
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(site) || site === "job" || site === "wday") return null;
    return { provider: "workday", token: `${wd[1]}.${wd[2]}/${site}`, url: `https://${host}/${site}` };
  }
  return null;
}

const SPEC_RE = /^(greenhouse|lever|ashby|workday):(\S{1,200})$/i;
const WORKDAY_TOKEN_RE = /^[a-z0-9-]{1,60}\.wd\d{1,3}\/[A-Za-z0-9_.-]{1,80}$/i;

export function parseBoardSpec(raw: string): DetectedBoard | null {
  const m = raw.trim().match(SPEC_RE);
  if (!m) return null;
  const provider = m[1].toLowerCase() as BoardProvider;
  if (provider === "workday") {
    if (!WORKDAY_TOKEN_RE.test(m[2])) return null;
    const [tenantWd, site] = m[2].split("/");
    return { provider, token: `${tenantWd.toLowerCase()}/${site}`, url: `https://${tenantWd.toLowerCase()}.myworkdayjobs.com/${site}` };
  }
  return ok(provider, m[2], "");
}

export function looksLikeCompanyName(raw: string): boolean {
  const t = raw.trim();
  return t.length >= 2 && t.length <= 60 && !SPEC_RE.test(t) && !/^https?:/i.test(t) && (/\s/.test(t) || !t.includes(".")) && /[a-z]/i.test(t);
}

export function companyGuesses(name: string): DetectedBoard[] {
  const lower = name.toLowerCase().trim().replace(/\b(inc|llc|ltd|corp|corporation|co)\.?$/, "").trim();
  const flat = lower.replace(/[^a-z0-9]/g, "");
  const dashed = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tokens = [...new Set([flat, dashed].filter((t) => t.length >= 2))];
  return tokens.flatMap((t) => (["greenhouse", "lever", "ashby"] as const).map((p) => ok(p, t, "")))
    .filter((b): b is DetectedBoard => b !== null);
}

const JOB_SITE_MESSAGES: [RegExp, string][] = [
  [/(^|\.)(joinhandshake|handshake)\.com$/, "Handshake doesn't offer a public jobs feed: postings are only visible to signed-in students and its terms don't allow automated collection. Open the posting in Handshake and, if it says \"Apply externally\", paste that employer link here. You can also type the company's name and we'll look for its own job board."],
  [/(^|\.)linkedin\.com$/, "LinkedIn has no public jobs feed and its terms ban automated access. Open the job there and, if Apply takes you to the company's site, paste that link here, or type the company's name."],
  [/(^|\.)(indeed|glassdoor|ziprecruiter|monster|dice|wellfound|simplyhired)\.com$/, "Job search sites like this don't offer a public feed. Paste a link from the company's own careers page, or type the company's name."],
];

export function jobSiteMessage(raw: string): string | null {
  let host: string;
  try { host = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`).hostname.toLowerCase(); } catch { return null; }
  return JOB_SITE_MESSAGES.find(([re]) => re.test(host))?.[1] ?? null;
}

const ATS_URL_RE = /https?:\/\/(?:boards|job-boards|boards-api)\.greenhouse\.io\/[^\s"'<>\\)]+|https?:\/\/(?:jobs|api)\.lever\.co\/[^\s"'<>\\)]+|https?:\/\/(?:jobs|api)\.ashbyhq\.com\/[^\s"'<>\\)]+|https?:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^\s"'<>\\)]+/gi;

export function findBoardsInHtml(html: string): DetectedBoard[] {
  const found = new Map<string, DetectedBoard>();
  const text = html.replace(/&amp;/g, "&").replace(/\\\//g, "/");
  for (const m of text.matchAll(ATS_URL_RE)) {
    const b = parseBoardUrl(m[0]);
    if (b) found.set(`${b.provider}:${b.token}`, b);
    if (found.size >= 10) break;
  }
  return [...found.values()];
}

export function findCareerLinks(html: string, base: URL): URL[] {
  const out = new Map<string, URL>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    if (!/career|jobs|join-us|work-with-us|openings/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], base);
      if (u.hostname === base.hostname && u.href !== base.href) out.set(u.href, u);
    } catch { /* not a URL */ }
    if (out.size >= 2) break;
  }
  return [...out.values()];
}

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  const v4 = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v.includes(":")) return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
  return true;
}

export function isAllowedPublicUrl(u: URL): boolean {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || /\.(local|internal|localhost|lan|home|corp)$/.test(host)) return false;
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return !isPrivateAddress(host);
  return true;
}

async function resolvesPublic(host: string): Promise<boolean> {
  if (/^[\d.]+$/.test(host)) return !isPrivateAddress(host);
  const addrs: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try { addrs.push(...await Deno.resolveDns(host, type)); } catch { /* no records of this type */ }
  }
  return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a));
}

export async function fetchPublicHtml(start: URL): Promise<{ html: string; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedPublicUrl(url) || !(await resolvesPublic(url.hostname))) throw new Error("That address isn't a public website we can read.");
    const res = await fetch(url, {
      redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "ApplylineBoardFinder/1.0 (+job board discovery)" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new Error("The page redirected without a destination.");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`The page responded with status ${res.status}.`); }
    if (!/html|xml/i.test(res.headers.get("content-type") ?? "")) { await res.body?.cancel(); throw new Error("That link isn't a web page."); }
    const reader = res.body?.getReader();
    if (!reader) return { html: "", finalUrl: url };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    const buf = new Uint8Array(Math.min(size, MAX_HTML_BYTES));
    let off = 0;
    for (const c of chunks) { const part = c.subarray(0, buf.length - off); buf.set(part, off); off += part.length; if (off >= buf.length) break; }
    return { html: new TextDecoder().decode(buf), finalUrl: url };
  }
  throw new Error("The page redirected too many times.");
}

export async function discoverFromUrl(raw: string): Promise<{ boards: DetectedBoard[]; via: "url" | "career_page" }> {
  const direct = parseBoardSpec(raw) ?? parseBoardUrl(raw);
  if (direct) return { boards: [direct], via: "url" };
  let start: URL;
  try { start = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { throw new Error("That doesn't look like a web address."); }
  const { html, finalUrl } = await fetchPublicHtml(start);
  const redirected = parseBoardUrl(finalUrl.href);
  if (redirected) return { boards: [redirected], via: "career_page" };
  let boards = findBoardsInHtml(html);
  if (!boards.length) {
    for (const link of findCareerLinks(html, finalUrl)) {
      try {
        const next = await fetchPublicHtml(link);
        const hit = parseBoardUrl(next.finalUrl.href);
        boards = hit ? [hit] : findBoardsInHtml(next.html);
        if (boards.length) break;
      } catch { /* try the next link */ }
    }
  }
  return { boards, via: "career_page" };
}
