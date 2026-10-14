export type Weights = {
  experience: number;
  skills: number;
  title: number;
  location: number;
  seniority: number;
  compensation: number;
  other: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  experience: 25,
  skills: 25,
  title: 15,
  location: 10,
  seniority: 10,
  compensation: 10,
  other: 5,
};

export type JobInput = {
  title: string;
  company: string;
  description: string;
  location: string;
  work_arrangement: string;
  seniority: string;
  employment_type: string;
  department: string;
  salary_min: number | null;
  salary_max: number | null;
};

export type CandidateInput = {
  skills: string[];
  experience_titles: string[];
  years_experience: number;
  target_titles: string[];
  locations: string[];
  work_arrangements: string[];
  seniority_levels: string[];
  industries: string[];
  keywords: string[];
  employment_types: string[];
  excluded_companies: string[];
  min_salary: number;
  requires_sponsorship: boolean;
  willing_to_relocate: boolean;
};

export type MatchResult = {
  score: number;
  eligible: boolean;
  ineligible_reasons: string[];
  breakdown: Record<keyof Weights, number>;
  explanation: { reasons: string[]; satisfied: string[]; missing: string[]; unknown: string[] };
};

export const SKILL_DICTIONARY = [
  "javascript", "typescript", "python", "java", "c++", "c#", "go", "golang", "rust", "ruby", "php", "kotlin", "swift", "scala",
  "sql", "postgresql", "mysql", "mongodb", "redis", "graphql", "rest", "react", "vue", "angular", "next.js", "node.js",
  "django", "flask", "spring", "rails", ".net", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd",
  "linux", "git", "machine learning", "deep learning", "nlp", "pytorch", "tensorflow", "pandas", "spark", "airflow",
  "tableau", "power bi", "excel", "looker", "data analysis", "statistics", "a/b testing", "etl", "dbt", "snowflake",
  "figma", "ux research", "product management", "agile", "scrum", "jira", "salesforce", "hubspot", "seo", "sem",
  "content marketing", "copywriting", "social media", "google analytics", "crm", "sales", "account management",
  "customer success", "project management", "stakeholder management", "budgeting", "financial modeling", "accounting",
  "gaap", "quickbooks", "recruiting", "operations", "supply chain", "logistics", "communication", "leadership",
  "public speaking", "negotiation", "html", "css", "tailwind", "ios", "android", "security", "networking", "devops",
  "microservices", "api design", "testing", "cypress", "jest", "selenium", "r", "matlab", "sas", "autocad", "solidworks",
];

const STOPWORDS = new Set([
  "and", "or", "the", "a", "an", "of", "for", "to", "in", "at", "with", "on", "i", "ii", "iii", "iv", "-", "&", "/",
  "senior", "sr", "junior", "jr", "lead", "principal", "staff", "head", "intern", "associate", "entry", "level",
]);

const SENIORITY_ORDER = ["intern", "entry", "mid", "senior", "lead", "executive"];

export function normalize(text: string): string {
  return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsTerm(haystack: string, term: string): boolean {
  const t = normalize(term);
  if (!t) return false;
  const re = new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(t)}($|[^a-z0-9+#])`, "i");
  return re.test(haystack);
}

export function titleTokens(title: string): string[] {
  return normalize(title)
    .replace(/[^a-z0-9+#. ]/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function inferSeniority(title: string, years?: number): string {
  const t = normalize(title);
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\b(vp|vice president|director|chief|cto|ceo|cfo|head of)\b/.test(t)) return "executive";
  if (/\b(lead|principal|staff|manager)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|entry|graduate|new grad|associate)\b/.test(t)) return "entry";
  if (years !== undefined) {
    if (years < 2) return "entry";
    if (years < 5) return "mid";
    if (years < 9) return "senior";
    return "lead";
  }
  return "mid";
}

export function requiredYears(description: string): number | null {
  const matches = [...normalize(description).matchAll(/(\d{1,2})\s*\+?\s*(?:-|to)?\s*(?:\d{1,2})?\s*\+?\s*years?/g)];
  const values = matches.map((m) => Number(m[1])).filter((n) => n > 0 && n <= 15);
  return values.length ? Math.min(...values) : null;
}

export function deniesSponsorship(description: string): boolean {
  const d = normalize(description);
  return /(not|unable to|cannot|can't|will not|won't|do not|does not)\s+(be able to\s+)?(provide\s+|offer\s+)?(visa\s+)?sponsor/.test(d) ||
    /without (the need for )?(visa )?sponsorship/.test(d) ||
    /no (visa )?sponsorship/.test(d) ||
    /not (eligible|available) for (visa )?sponsorship/.test(d) ||
    /sponsorship (is )?not (available|provided|offered)/.test(d);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function normalizeWeights(w: Partial<Weights> | null | undefined): Weights {
  const merged = { ...DEFAULT_WEIGHTS, ...(w || {}) } as Weights;
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) {
    const v = Number(merged[k]);
    merged[k] = Number.isFinite(v) && v >= 0 ? Math.min(v, 100) : DEFAULT_WEIGHTS[k];
  }
  return merged;
}

export function scoreJob(job: JobInput, c: CandidateInput, rawWeights?: Partial<Weights>): MatchResult {
  const weights = normalizeWeights(rawWeights);
  const text = normalize(`${job.title} ${job.description} ${job.department}`);
  const reasons: string[] = [];
  const satisfied: string[] = [];
  const missing: string[] = [];
  const unknown: string[] = [];
  const ineligible: string[] = [];

  if (c.excluded_companies.some((x) => normalize(x) === normalize(job.company))) {
    ineligible.push(`${job.company} is on your excluded companies list`);
  }
  if (c.requires_sponsorship && deniesSponsorship(job.description)) {
    ineligible.push("Posting states visa sponsorship is not available");
  }
  const jobRemote = job.work_arrangement === "remote";
  const prefLocs = c.locations.map(normalize).filter(Boolean);
  const locMatch = prefLocs.some((l) => normalize(job.location).includes(l) || l.includes(normalize(job.location)));
  if (job.work_arrangement === "onsite" && prefLocs.length && !locMatch && !c.willing_to_relocate) {
    ineligible.push(`On-site in ${job.location || "an unlisted location"} and you are not open to relocation`);
  }

  // Experience
  const req = requiredYears(job.description);
  let experience = 0.7;
  if (req === null) unknown.push("Years of experience not stated");
  else if (c.years_experience >= req) {
    experience = 1;
    satisfied.push(`${req}+ years experience (you have ${c.years_experience})`);
  } else {
    experience = clamp(c.years_experience / req);
    missing.push(`Asks for ${req}+ years experience (you have ${c.years_experience})`);
  }

  // Skills
  const candidateSkills = c.skills.map(normalize).filter(Boolean);
  const matchedSkills = candidateSkills.filter((s) => containsTerm(text, s));
  const lackingSkills = SKILL_DICTIONARY.filter((s) => containsTerm(text, s) && !candidateSkills.includes(s));
  const totalSkills = matchedSkills.length + lackingSkills.length;
  const skills = totalSkills ? matchedSkills.length / totalSkills : 0.5;
  if (matchedSkills.length) satisfied.push(`Skills: ${matchedSkills.slice(0, 8).join(", ")}`);
  if (lackingSkills.length) missing.push(`Not on your resume: ${lackingSkills.slice(0, 6).join(", ")}`);
  if (!totalSkills) unknown.push("No recognizable skill requirements");

  // Title
  const jobTokens = titleTokens(job.title);
  const titleSources = [...c.target_titles, ...c.experience_titles];
  let title = 0;
  for (const t of titleSources) {
    const toks = titleTokens(t);
    if (!toks.length || !jobTokens.length) continue;
    const overlap = jobTokens.filter((x) => toks.includes(x)).length;
    title = Math.max(title, overlap / jobTokens.length);
  }
  if (!titleSources.length) title = 0.5;
  if (title >= 0.6) reasons.push(`Title aligns with your target roles`);

  // Location
  let location = 0.7;
  const prefArr = c.work_arrangements.map(normalize);
  if (jobRemote && (prefArr.includes("remote") || !prefArr.length)) location = 1;
  else if (locMatch && (!prefArr.length || prefArr.includes(job.work_arrangement))) location = 1;
  else if (locMatch) location = 0.8;
  else if (job.work_arrangement === "unknown") location = 0.6;
  else if (prefArr.length && !prefArr.includes(job.work_arrangement)) location = 0.3;
  else if (prefLocs.length) location = c.willing_to_relocate ? 0.5 : 0.2;
  if (location >= 0.8) reasons.push(jobRemote ? "Remote role matches your preferences" : "Location fits your preferences");

  // Seniority
  const jobLevel = job.seniority || inferSeniority(job.title);
  const candLevels = c.seniority_levels.length ? c.seniority_levels : [inferSeniority("", c.years_experience)];
  const jIdx = SENIORITY_ORDER.indexOf(jobLevel);
  const diffs = candLevels.map((l) => Math.abs(SENIORITY_ORDER.indexOf(l) - jIdx)).filter((d) => Number.isFinite(d));
  const diff = diffs.length ? Math.min(...diffs) : 1;
  let seniority = diff === 0 ? 1 : diff === 1 ? 0.6 : 0.2;
  if (c.requires_sponsorship && !deniesSponsorship(job.description)) {
    unknown.push("Sponsorship availability not stated");
    seniority *= 0.9;
  }
  if (diff === 0) satisfied.push(`Seniority level (${jobLevel})`);
  else if (diff >= 2) missing.push(`Seniority (${jobLevel}) differs from your level`);

  // Compensation
  let compensation = 1;
  if (c.min_salary > 0) {
    const top = job.salary_max ?? job.salary_min;
    if (!top) {
      compensation = 0.6;
      unknown.push("Salary not disclosed");
    } else if (top >= c.min_salary) {
      satisfied.push(`Pay meets your minimum`);
    } else {
      compensation = clamp(top / c.min_salary) * 0.7;
      missing.push(`Posted pay is below your minimum`);
    }
  }

  // Other
  const otherPrefs = [...c.keywords, ...c.industries];
  let other = 0.7;
  if (otherPrefs.length) {
    const hits = otherPrefs.filter((k) => containsTerm(text, k) || containsTerm(normalize(job.company), k));
    other = hits.length / otherPrefs.length;
    if (hits.length) reasons.push(`Mentions ${hits.slice(0, 3).join(", ")}`);
  }
  if (c.employment_types.length && job.employment_type) {
    const ok = c.employment_types.some((t) => normalize(job.employment_type).includes(normalize(t)));
    other = (other + (ok ? 1 : 0)) / 2;
  }

  const breakdown = { experience, skills, title, location, seniority, compensation, other };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const raw = (Object.keys(weights) as (keyof Weights)[]).reduce((sum, k) => sum + weights[k] * breakdown[k], 0);
  const eligible = ineligible.length === 0;
  const score = eligible ? Math.round((raw / totalWeight) * 100) : 0;

  if (matchedSkills.length >= 3) reasons.unshift(`${matchedSkills.length} of your skills are mentioned`);
  if (experience === 1 && req !== null) reasons.push("You meet the experience requirement");

  const rounded = Object.fromEntries(
    Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 100)]),
  ) as Record<keyof Weights, number>;

  return {
    score,
    eligible,
    ineligible_reasons: ineligible,
    breakdown: rounded,
    explanation: { reasons, satisfied, missing, unknown },
  };
}
