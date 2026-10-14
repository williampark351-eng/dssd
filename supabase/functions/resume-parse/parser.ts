export type ExperienceEntry = { title: string; company: string; location: string; start: string; end: string; bullets: string[] };
export type EducationEntry = { degree: string; school: string; start: string; end: string; details: string };
export type ParsedResume = {
  contact: { name: string; email: string; phone: string; linkedin: string; website: string; location: string };
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  certifications: string[];
  accomplishments: string[];
  estimated_years: number;
};

const SECTIONS: [keyof Omit<ParsedResume, "contact" | "estimated_years"> | "ignore", RegExp][] = [
  ["summary", /^(professional\s+)?(summary|profile|objective|about( me)?)$/i],
  ["experience", /^(professional\s+|work\s+|relevant\s+)?(experience|employment( history)?|work history|career history)$/i],
  ["education", /^(education|academic background|education & training)$/i],
  ["skills", /^((technical|core|key)\s+)?(skills|competencies|technologies|tools|skills & tools)$/i],
  ["certifications", /^(certifications?|licenses?( & certifications)?|certificates)$/i],
  ["accomplishments", /^(accomplishments|achievements|awards|honors|awards & honors|key achievements)$/i],
  ["ignore", /^(projects|volunteer(ing)?|interests|references|languages|publications)$/i],
];

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now)`, "i");
const BULLET_RE = /^\s*([•●▪◦\-*–·]|\d+\.)\s+/;
const DEGREE_RE = /\b(b\.?s\.?|b\.?a\.?|bachelor|master|m\.?s\.?|m\.?a\.?|mba|ph\.?d|doctor|associate|diploma|certificate|bsc|msc|b\.?eng|m\.?eng)\b/i;
const SCHOOL_RE = /\b(university|college|institute|school|academy|polytechnic)\b/i;

function cleanLine(l: string): string {
  return l.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function headerOf(line: string): string | null {
  const t = line.replace(/[:|]+$/, "").trim();
  if (t.length > 40) return null;
  for (const [name, re] of SECTIONS) if (re.test(t)) return name;
  return null;
}

function yearOf(d: string): number | null {
  if (/present|current|now/i.test(d)) return new Date().getFullYear() + new Date().getMonth() / 12;
  const y = d.match(/\d{4}/);
  if (!y) return null;
  const m = d.match(new RegExp(MONTH, "i"));
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const slash = d.match(/^(\d{1,2})\//);
  const mi = m ? months.indexOf(m[0].slice(0, 3).toLowerCase()) : slash ? Number(slash[1]) - 1 : 0;
  return Number(y[0]) + Math.max(0, mi) / 12;
}

function splitTitleCompany(text: string): { title: string; company: string; location: string } {
  const parts = text.split(/\s+(?:at|@)\s+|\s*[|,–—]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  return { title: parts[0] ?? "", company: parts[1] ?? "", location: parts.slice(2).join(", ") };
}

function parseExperience(lines: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;
  let pendingHeader: string[] = [];
  for (const line of lines) {
    const range = line.match(RANGE_RE);
    if (range) {
      const rest = cleanLine(line.replace(range[0], "").replace(/[|,–—-]\s*$/, ""));
      const headerText = [...pendingHeader, rest].filter(Boolean).join(" | ");
      const { title, company, location } = splitTitleCompany(headerText);
      current = { title, company, location, start: range[1], end: range[2], bullets: [] };
      entries.push(current);
      pendingHeader = [];
    } else if (BULLET_RE.test(line)) {
      if (current) current.bullets.push(line.replace(BULLET_RE, "").trim());
    } else if (current && current.bullets.length === 0 && !current.company && line.length < 80) {
      current.company = line;
    } else if (current && current.bullets.length && line.length > 60) {
      current.bullets[current.bullets.length - 1] += ` ${line}`;
    } else {
      pendingHeader.push(line);
      if (pendingHeader.length > 2) pendingHeader.shift();
    }
  }
  return entries.slice(0, 30);
}

function parseEducation(lines: string[]): EducationEntry[] {
  const out: EducationEntry[] = [];
  let current: EducationEntry | null = null;
  for (const line of lines) {
    const range = line.match(RANGE_RE);
    const year = line.match(/\b(19|20)\d{2}\b/);
    if (SCHOOL_RE.test(line) && !(current && !current.school)) {
      current = { degree: "", school: cleanLine(line.replace(RANGE_RE, "")), start: range?.[1] ?? "", end: range?.[2] ?? year?.[0] ?? "", details: "" };
      out.push(current);
    } else if (DEGREE_RE.test(line)) {
      if (current && !current.degree) current.degree = cleanLine(line.replace(RANGE_RE, ""));
      else {
        current = { degree: cleanLine(line.replace(RANGE_RE, "")), school: "", start: range?.[1] ?? "", end: range?.[2] ?? year?.[0] ?? "", details: "" };
        out.push(current);
      }
      if (current && !current.end && year) current.end = year[0];
    } else if (current && SCHOOL_RE.test(line) && !current.school) {
      current.school = cleanLine(line);
    } else if (current) {
      current.details = cleanLine(`${current.details} ${line.replace(BULLET_RE, "")}`);
    }
  }
  return out.slice(0, 10);
}

function parseList(lines: string[]): string[] {
  const items = lines
    .flatMap((l) => l.replace(BULLET_RE, "").replace(/^[A-Za-z &/]{2,30}:\s*/, "").split(/\s*[,;|•·]\s*/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);
  return [...new Map(items.map((s) => [s.toLowerCase(), s])).values()].slice(0, 150);
}

export function estimateYears(experience: ExperienceEntry[]): number {
  const spans = experience
    .map((e) => [yearOf(e.start), yearOf(e.end)] as const)
    .filter((s): s is readonly [number, number] => s[0] !== null && s[1] !== null && s[1] >= s[0])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of spans) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else curEnd = Math.max(curEnd, e);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return Math.round(total);
}

export function parseResumeText(raw: string): ParsedResume {
  const lines = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const text = lines.join("\n");
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
  const phone = text.match(/(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] ?? "";
  const linkedin = text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i)?.[0] ?? "";
  const website = text.match(/https?:\/\/(?!(www\.)?linkedin)[^\s,|]+/i)?.[0] ?? "";

  const buckets: Record<string, string[]> = { header: [] };
  let section = "header";
  for (const line of lines) {
    const h = headerOf(line);
    if (h) {
      section = h;
      buckets[section] = buckets[section] || [];
      continue;
    }
    (buckets[section] = buckets[section] || []).push(line);
  }

  const header = buckets.header || [];
  const name = header.find((l) => !l.includes("@") && !/\d{3}/.test(l) && l.split(" ").length <= 5 && l.length < 50) ?? "";
  const location = header.find((l) => /^[A-Za-z .'-]+,\s*[A-Z]{2}\b/.test(l))?.match(/^[A-Za-z .'-]+,\s*[A-Z]{2}/)?.[0]
    ?? header.join(" | ").match(/([A-Z][a-zA-Z .'-]+,\s*[A-Z]{2})\b/)?.[1] ?? "";

  const experience = parseExperience(buckets.experience || []);
  return {
    contact: { name, email, phone: phone.trim(), linkedin, website, location },
    summary: (buckets.summary || []).join(" ").slice(0, 2000),
    experience,
    education: parseEducation(buckets.education || []),
    skills: parseList(buckets.skills || []),
    certifications: (buckets.certifications || []).map((l) => l.replace(BULLET_RE, "")).slice(0, 30),
    accomplishments: (buckets.accomplishments || []).map((l) => l.replace(BULLET_RE, "")).slice(0, 30),
    estimated_years: estimateYears(experience),
  };
}
