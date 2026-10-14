import { estimateYears, type EducationEntry, type ExperienceEntry, type ParsedResume } from "./parser.ts";

function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
}

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Keeps only the AI-extracted values that literally appear in the resume text; falls back to the rule-based parse otherwise. */
export function groundParsed(ai: unknown, raw: string, fallback: ParsedResume): { parsed: ParsedResume; dropped: number } {
  const source = ` ${canon(raw)} `;
  let dropped = 0;
  const inText = (s: string) => {
    const c = canon(s);
    const ok = c.length > 0 && source.includes(` ${c} `);
    if (s && !ok) dropped++;
    return ok;
  };
  const keep = (s: string) => (inText(s) ? s : "");
  const a = (ai && typeof ai === "object" ? ai : {}) as Record<string, unknown>;
  const contact = (a.contact && typeof a.contact === "object" ? a.contact : {}) as Record<string, unknown>;

  const experience: ExperienceEntry[] = list(a.experience).flatMap((e) => {
    const r = (e ?? {}) as Record<string, unknown>;
    const title = str(r.title, 200);
    const company = str(r.company, 200);
    if (!title || !inText(title) || (company && !inText(company))) return [];
    return [{
      title, company,
      location: keep(str(r.location, 200)),
      start: keep(str(r.start, 40)),
      end: /^(present|current|now)$/i.test(str(r.end)) && /present|current|now/i.test(raw) ? str(r.end) : keep(str(r.end, 40)),
      bullets: list(r.bullets).map((b) => str(b, 1000)).filter(inText).slice(0, 20),
    }];
  }).slice(0, 15);

  const education: EducationEntry[] = list(a.education).flatMap((e) => {
    const r = (e ?? {}) as Record<string, unknown>;
    const degree = str(r.degree, 200);
    const school = str(r.school, 200);
    if ((!degree && !school) || (degree && !inText(degree)) || (school && !inText(school))) return [];
    return [{ degree, school, start: keep(str(r.start, 40)), end: keep(str(r.end, 40)), details: keep(str(r.details, 1000)) }];
  }).slice(0, 10);

  const strings = (v: unknown, max: number) => [...new Map(list(v).map((s) => str(s, 200)).filter(inText).map((s) => [s.toLowerCase(), s])).values()].slice(0, max);
  const skills = strings(a.skills, 150);
  const summary = keep(str(a.summary, 2000));
  const certifications = strings(a.certifications, 30);
  const accomplishments = strings(a.accomplishments, 30);

  const parsed: ParsedResume = {
    contact: {
      name: keep(str(contact.name, 100)) || fallback.contact.name,
      email: keep(str(contact.email, 200)) || fallback.contact.email,
      phone: keep(str(contact.phone, 40)) || fallback.contact.phone,
      linkedin: keep(str(contact.linkedin, 300)) || fallback.contact.linkedin,
      website: keep(str(contact.website, 300)) || fallback.contact.website,
      location: keep(str(contact.location, 100)) || fallback.contact.location,
    },
    summary: summary || fallback.summary,
    experience: experience.length >= fallback.experience.length ? experience : fallback.experience,
    education: education.length >= fallback.education.length ? education : fallback.education,
    skills: skills.length ? [...new Map([...skills, ...fallback.skills].map((s) => [s.toLowerCase(), s])).values()].slice(0, 150) : fallback.skills,
    certifications: certifications.length ? certifications : fallback.certifications,
    accomplishments: accomplishments.length ? accomplishments : fallback.accomplishments,
    estimated_years: 0,
  };
  parsed.estimated_years = estimateYears(parsed.experience);
  return { parsed, dropped };
}
