export type Question = {
  label: string;
  field: string;
  required: boolean;
  type: string;
  options?: { label: string; value: string }[];
};

export type PacketAnswer = {
  question: string;
  field: string;
  answer: string;
  source: "profile" | "library" | "generated" | "user" | "pending";
  required: boolean;
  sensitive: boolean;
  type: string;
  options?: { label: string; value: string }[];
};

export type Profile = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  portfolio_url: string;
};

export type LibraryAnswer = { question: string; answer: string; approved: boolean; sensitive: boolean };

export type Experience = { title?: string; company?: string; start?: string; end?: string; bullets?: string[] };
export type Parsed = {
  summary?: string;
  skills?: string[];
  experience?: Experience[];
  education?: { degree?: string; school?: string }[];
  [k: string]: unknown;
};

export type ResumeRow = { id: string; name: string; target_category: string; is_primary: boolean; parsed: Parsed; updated_at: string };

const SENSITIVE_RE = /\b(gender|sex|race|ethnic|hispanic|latino|veteran|disab|sponsor|visa|authori[sz]ed to work|work authori|salary|compensation|pay expectation|criminal|convict|felony|age|date of birth|pronoun|religio|sexual orientation|transgender|citizenship|clearance)/i;

const STOP = new Set(["the", "a", "an", "you", "your", "do", "are", "is", "of", "to", "in", "for", "and", "or", "what", "please", "have", "will", "this", "with", "us"]);

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function isSensitive(label: string): boolean {
  return SENSITIVE_RE.test(label);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mentions(text: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  return new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(t)}($|[^a-z0-9+#])`, "i").test(text.toLowerCase());
}

function standardAnswer(q: Question, p: Profile, coverLetter: string): { answer: string; source: PacketAnswer["source"] } | null {
  const f = q.field.toLowerCase();
  const l = q.label.toLowerCase();
  const [first, ...rest] = p.full_name.trim().split(/\s+/);
  if (f === "first_name" || /^first name/.test(l)) return { answer: first ?? "", source: "profile" };
  if (f === "last_name" || /^last name/.test(l)) return { answer: rest.join(" "), source: "profile" };
  if (f === "name" || l === "full name" || l === "name") return { answer: p.full_name, source: "profile" };
  if (f === "email" || /^e-?mail/.test(l)) return { answer: p.email, source: "profile" };
  if (f === "phone" || /^phone/.test(l)) return { answer: p.phone, source: "profile" };
  if (f === "resume" || f === "resume_text" || /^resume/.test(l)) return { answer: "[resume file attached]", source: "profile" };
  if (f === "cover_letter" || f === "cover_letter_text" || /^cover letter/.test(l)) return { answer: coverLetter, source: "generated" };
  if (/linkedin/.test(f + l)) return { answer: p.linkedin_url, source: "profile" };
  if (/website|portfolio|github/.test(f + l)) return { answer: p.portfolio_url, source: "profile" };
  if (/^(location|city)/.test(l)) return { answer: p.location, source: "profile" };
  return null;
}

export function buildAnswers(questions: Question[], profile: Profile, library: LibraryAnswer[], coverLetter: string) {
  const approved = library.filter((a) => a.approved && a.answer.trim());
  const answers: PacketAnswer[] = questions.map((q) => {
    const sensitive = isSensitive(q.label);
    const std = sensitive ? null : standardAnswer(q, profile, coverLetter);
    if (std && (std.answer.trim() || !q.required)) {
      return { question: q.label, field: q.field, answer: std.answer, source: std.source, required: q.required, sensitive, type: q.type, options: q.options };
    }
    let best: LibraryAnswer | null = null;
    let bestScore = 0;
    for (const a of approved) {
      const s = similarity(q.label, a.question);
      if (s > bestScore) {
        bestScore = s;
        best = a;
      }
    }
    const threshold = sensitive ? 0.75 : 0.55;
    if (best && bestScore >= threshold) {
      let answer = best.answer;
      if (q.options?.length) {
        const opt = q.options.find((o) => o.label.toLowerCase() === answer.toLowerCase().trim());
        if (!opt) answer = "";
      }
      if (answer) return { question: q.label, field: q.field, answer, source: "library", required: q.required, sensitive, type: q.type, options: q.options };
    }
    return { question: q.label, field: q.field, answer: "", source: "pending", required: q.required, sensitive, type: q.type, options: q.options };
  });
  const pending = answers.filter((a) => a.required && !a.answer.trim()).length;
  return { answers, pending };
}

export function chooseResume(resumes: ResumeRow[], jobTitle: string, jobText: string): ResumeRow | null {
  const usable = resumes.filter((r) => (r.parsed?.experience?.length ?? 0) > 0 || (r.parsed?.skills?.length ?? 0) > 0);
  if (!usable.length) return null;
  let best = usable.find((r) => r.is_primary) ?? usable[0];
  let bestScore = -1;
  for (const r of usable) {
    const cat = `${r.target_category} ${r.name}`;
    const titleSim = similarity(cat, jobTitle);
    const skillHits = (r.parsed.skills || []).filter((s) => mentions(jobText, s)).length;
    const score = titleSim * 10 + skillHits + (r.is_primary ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export function tailorResume(parsed: Parsed, jobText: string) {
  const notes: string[] = [];
  const skills = parsed.skills || [];
  const relevant = skills.filter((s) => mentions(jobText, s));
  const others = skills.filter((s) => !mentions(jobText, s));
  if (relevant.length) notes.push(`Moved ${relevant.length} skills mentioned in the posting to the top: ${relevant.slice(0, 6).join(", ")}`);

  const experience = (parsed.experience || []).map((e) => {
    const bullets = e.bullets || [];
    const scored = bullets.map((b, i) => ({ b, i, s: skills.filter((s) => mentions(b, s) && mentions(jobText, s)).length }));
    const reordered = [...scored].sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.b);
    if (reordered.some((b, i) => b !== bullets[i])) notes.push(`Prioritized the most relevant achievements under ${e.title || "a role"}${e.company ? ` at ${e.company}` : ""}`);
    return { ...e, bullets: reordered };
  });
  if (!notes.length) notes.push("No reordering needed; your resume content is used as written");
  notes.push("No new skills, titles, dates or achievements were added");
  return { parsed: { ...parsed, skills: [...relevant, ...others], experience }, notes, relevantSkills: relevant };
}

export function coverLetter(profile: Profile, parsed: Parsed, job: { title: string; company: string }, relevantSkills: string[]): string {
  const name = profile.full_name.trim() || "the applicant";
  const recent = (parsed.experience || [])[0];
  const lines: string[] = [];
  lines.push(`Dear ${job.company} Hiring Team,`);
  lines.push("");
  lines.push(`I am writing to apply for the ${job.title} role at ${job.company}.`);
  if (recent?.title) {
    lines[lines.length - 1] += ` In my ${recent.end && /present|current|now/i.test(recent.end) ? "current" : "recent"} role as ${recent.title}${recent.company ? ` at ${recent.company}` : ""}, I have built experience that maps closely to what your team is looking for.`;
  }
  if (relevantSkills.length) {
    lines.push("");
    lines.push(`The posting highlights ${relevantSkills.slice(0, 4).join(", ")}, all of which I use in my work.`);
  }
  const highlight = recent?.bullets?.[0];
  if (highlight) {
    lines.push(`One example: ${highlight.replace(/\.$/, "")}.`);
  }
  lines.push("");
  lines.push(`I would welcome the chance to discuss how I can contribute to ${job.company}. Thank you for your consideration.`);
  lines.push("");
  lines.push("Sincerely,");
  lines.push(name);
  return lines.join("\n");
}

export function standardQuestions(): Question[] {
  return [
    { label: "First Name", field: "first_name", required: true, type: "input_text" },
    { label: "Last Name", field: "last_name", required: true, type: "input_text" },
    { label: "Email", field: "email", required: true, type: "input_text" },
    { label: "Phone", field: "phone", required: false, type: "input_text" },
    { label: "Resume", field: "resume", required: true, type: "input_file" },
    { label: "LinkedIn Profile", field: "linkedin", required: false, type: "input_text" },
  ];
}

// deno-lint-ignore no-explicit-any
export function greenhouseQuestions(payload: any): Question[] {
  const qs = Array.isArray(payload?.questions) ? payload.questions : [];
  const out: Question[] = [];
  for (const q of qs) {
    for (const f of q.fields || []) {
      out.push({
        label: String(q.label ?? f.name),
        field: String(f.name),
        required: Boolean(q.required),
        type: String(f.type ?? "input_text"),
        options: Array.isArray(f.values) && f.values.length
          ? f.values.map((v: { label: string; value: unknown }) => ({ label: String(v.label), value: String(v.value) }))
          : undefined,
      });
    }
  }
  return out.slice(0, 100);
}
