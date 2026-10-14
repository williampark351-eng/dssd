export const TECH_TERMS = [
  "sql", "python", "java", "javascript", "typescript", "react", "node.js", "aws", "azure", "gcp", "docker", "kubernetes",
  "tableau", "power bi", "excel", "salesforce", "figma", "rust", "c++", "c#", "ruby", "php", "swift", "kotlin",
  "terraform", "spark", "hadoop", "snowflake", "dbt", "airflow", "pandas", "tensorflow", "pytorch", "machine learning",
  "graphql", "postgres", "mongodb", "redis", "kafka", "jira", "hubspot", "sap", "quickbooks", "autocad", "matlab",
  "phd", "ph.d", "mba", "cpa", "pmp", "scrum master", "six sigma",
];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escape(term)}($|[^a-z0-9+#])`, "i").test(text);
}

const FIRST_PERSON = /\b(my|i've|i have|i had|i am (skilled|proficient|experienced|certified|an expert)|i (built|used|use|developed|led|managed|created|designed|know|earned|hold|worked|implemented|delivered|increased|reduced|grew|shipped|deployed)|me \w+ (experience|skills))\b|experience (with|in|using)|proficien|skilled|expertise|expert in|familiar with|background in|years/i;

function claimsTerm(output: string, term: string): boolean {
  return output.split(/(?<=[.!?\n])/).some((s) => hasTerm(s, term) && FIRST_PERSON.test(s));
}

/** Lists skills, credentials and figures in `output` that cannot be traced to the resume (or, when not claimed as the candidate's own, the job posting). */
export function ungroundedClaims(output: string, resumeText: string, jobText: string): string[] {
  const problems: string[] = [];
  for (const t of TECH_TERMS) {
    if (!hasTerm(output, t) || hasTerm(resumeText, t)) continue;
    if (!hasTerm(jobText, t) || claimsTerm(output, t)) problems.push(t);
  }
  const resumeDigits = resumeText.replace(/,/g, "");
  const jobDigits = jobText.replace(/,/g, "");
  for (const sentence of output.split(/(?<=[.!?\n])/)) {
    const personal = FIRST_PERSON.test(sentence);
    for (const raw of sentence.match(/\$?\d[\d,.]*\s?(%|\+|k\b)?/gi) ?? []) {
      const n = raw.replace(/[$,%+k\s]/gi, "").replace(/\.$/, "");
      if (!n || resumeDigits.includes(n)) continue;
      if (personal || !jobDigits.includes(n)) problems.push(raw.trim());
    }
  }
  return [...new Set(problems)];
}
