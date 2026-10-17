import type { ParsedResume } from "./parser.ts";

export type QualityCheck = { id: string; label: string; passed: boolean; detail: string };
export type ResumeQuality = { score: number; grade: "excellent" | "good" | "fair" | "poor"; checks: QualityCheck[] };

/** Rule-based structural check of how machine-readable a resume is (formatting/completeness only — not a judgment of the person). */
export function scoreQuality(parsed: ParsedResume, rawText: string): ResumeQuality {
  const words = rawText.split(/\s+/).filter(Boolean).length;
  const bullets = parsed.experience.flatMap((e) => e.bullets);
  const quantified = bullets.filter((b) => /\d/.test(b)).length;
  const dated = parsed.experience.filter((e) => e.start && e.end).length;

  const checks: QualityCheck[] = [
    { id: "email", label: "Contact email", passed: !!parsed.contact.email, detail: parsed.contact.email || "No email address found" },
    { id: "phone", label: "Phone number", passed: !!parsed.contact.phone, detail: parsed.contact.phone || "No phone number found" },
    {
      id: "roles",
      label: "Work history",
      passed: parsed.experience.length >= 2,
      detail: parsed.experience.length === 0 ? "No roles detected" : `${parsed.experience.length} role${parsed.experience.length === 1 ? "" : "s"} detected`,
    },
    {
      id: "dates",
      label: "Role dates",
      passed: parsed.experience.length > 0 && dated >= Math.min(2, parsed.experience.length),
      detail: dated === 0 ? "Roles are missing start and end dates" : `${dated} of ${parsed.experience.length} roles have full dates`,
    },
    {
      id: "quantified",
      label: "Numbers in achievements",
      passed: quantified >= 2,
      detail: quantified === 0 ? "No bullets contain numbers or metrics" : `${quantified} bullet${quantified === 1 ? "" : "s"} include numbers`,
    },
    {
      id: "skills",
      label: "Skills section",
      passed: parsed.skills.length >= 5,
      detail: parsed.skills.length === 0 ? "No skills detected" : `${parsed.skills.length} skills detected`,
    },
    { id: "education", label: "Education", passed: parsed.education.length >= 1, detail: parsed.education.length === 0 ? "No education entries found" : `${parsed.education.length} entr${parsed.education.length === 1 ? "y" : "ies"}` },
    {
      id: "length",
      label: "Readable length",
      passed: words >= 150 && words <= 2000,
      detail: words < 150 ? `Very short (${words} words)` : words > 2000 ? `Very long (${words} words) — consider trimming to 1-2 pages` : `${words} words`,
    },
  ];

  const weights: Record<string, number> = { email: 15, phone: 10, roles: 20, dates: 15, quantified: 15, skills: 10, education: 10, length: 5 };
  const score = checks.reduce((t, c) => t + (c.passed ? weights[c.id] ?? 0 : 0), 0);
  const grade = score >= 85 ? "excellent" : score >= 65 ? "good" : score >= 45 ? "fair" : "poor";
  return { score, grade, checks };
}
