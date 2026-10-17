# GoldenHire Resume ATS + Resume Scanner — One Code Stack

Original source files combined in one document. Each section gives its original relative path. This is a source-code bundle, not a directly executable single-file program. Copy sections back to their matching paths to reconstruct the project.

## File index

- `package.json`
- `src/lib/jobposter-auth.ts`
- `src/lib/python-parser.ts`
- `src/lib/supabase.ts`
- `src/lib/zip-extract.ts`
- `src/pages/ResumeScannerPage.tsx`
- `src/pages/combine/CandidateResume.tsx`
- `src/pages/jobposter/CandidatesTab.tsx`
- `src/pages/jobposter/PythonImportModal.tsx`
- `src/pages/jobposter/ResumesChatPanel.tsx`
- `src/pages/jobposter/ResumesSection.tsx`
- `supabase/functions/_shared/adminAuth.ts`
- `supabase/functions/_shared/aiGuard.ts`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/cron.ts`
- `supabase/functions/_shared/email.ts`
- `supabase/functions/_shared/qwenTranscribe.ts`
- `supabase/functions/_shared/rateLimit.ts`
- `supabase/functions/_shared/season.ts`
- `supabase/functions/_shared/secrets.ts`
- `supabase/functions/_shared/storageFetch.ts`
- `supabase/functions/_shared/userAuth.ts`
- `supabase/functions/admin-candidates/index.ts`
- `supabase/functions/bulk-import-candidates/index.ts`
- `supabase/functions/extract-card-from-resume/index.ts`
- `supabase/functions/extract-resume-text/index.ts`
- `supabase/functions/pipeline-stats/index.ts`
- `supabase/functions/resumes-chat/index.ts`
- `supabase/functions/scan-resume-public/index.ts`
- `supabase/functions/scan-resume/index.ts`
- `supabase/functions/scan-talent-resume/index.ts`
- `supabase/functions/upload-resumes/index.ts`
- `supabase/migrations/20260513173211_add_resume_scan_reports.sql`
- `supabase/migrations/20260527033146_create_resumes_bank_table.sql`
- `supabase/migrations/20260527151542_create_candidate_profiles_and_upload_batches.sql`
- `supabase/migrations/20260527194718_add_ats_score_to_candidate_profiles.sql`
- `supabase/migrations/20260611142037_add_enrichment_columns_to_candidate_profiles.sql`
- `README_EXTRACTED.md`

---

## FILE: `package.json`

```json
{
  "name": "golden-hire",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0",
    "typecheck": "tsc --noEmit -p tsconfig.app.json",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@huggingface/transformers": "^3.8.1",
    "@react-three/drei": "^9.114.3",
    "@react-three/fiber": "^8.17.10",
    "@supabase/supabase-js": "^2.45.0",
    "@types/three": "^0.169.0",
    "fflate": "^0.8.3",
    "kokoro-js": "^1.2.1",
    "lucide-react": "^0.460.0",
    "qrcode": "^1.5.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.169.0",
    "xlsx": "^0.18.5",
    "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/qrcode": "^1.5.6",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.39.5",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.7",
    "globals": "^17.13.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.5.4",
    "typescript-eslint": "^8.71.0",
    "vite": "^5.4.8",
    "vitest": "^2.1.9"
  }
}
```

---

## FILE: `src/lib/jobposter-auth.ts`

```typescript
const STORAGE_KEY = 'gh_jobposter_token';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface StoredToken {
  token: string;
  expires_at: number;
}

export function readStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.token || !parsed.expires_at || parsed.expires_at < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveToken(token: string, expires_at: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expires_at }));
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAdminToken(): string | null {
  const stored = readStoredToken();
  return stored?.token ?? null;
}

export async function authenticateJobposter(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/jobposter-auth`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? 'Incorrect password' };
    }
    const expiresAt = data.expires_at ?? Date.now() + 8 * 60 * 60 * 1000;
    saveToken(data.token, expiresAt);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error. Try again.' };
  }
}
```

---

## FILE: `src/lib/python-parser.ts`

```typescript
/**
 * Safe Python literal parser — converts Python data structures to JavaScript
 * without executing any code. Treats the file as plain text only.
 */

// Tokenizer for Python literals
type Token =
  | { type: 'lbrace' }
  | { type: 'rbrace' }
  | { type: 'lbracket' }
  | { type: 'rbracket' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'colon' }
  | { type: 'comma' }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'none' }
  | { type: 'ident'; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    // Whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Comments
    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    // Single-char tokens
    if (ch === '{') { tokens.push({ type: 'lbrace' }); i++; continue; }
    if (ch === '}') { tokens.push({ type: 'rbrace' }); i++; continue; }
    if (ch === '[') { tokens.push({ type: 'lbracket' }); i++; continue; }
    if (ch === ']') { tokens.push({ type: 'rbracket' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === ':') { tokens.push({ type: 'colon' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }

    // Triple-quoted strings
    if ((src.slice(i, i + 3) === '"""' || src.slice(i, i + 3) === "'''") ||
        (src[i] === 'f' && (src.slice(i + 1, i + 4) === '"""' || src.slice(i + 1, i + 4) === "'''" )) ||
        (src[i] === 'r' && (src.slice(i + 1, i + 4) === '"""' || src.slice(i + 1, i + 4) === "'''" )) ||
        (src[i] === 'b' && (src.slice(i + 1, i + 4) === '"""' || src.slice(i + 1, i + 4) === "'''" ))) {
      // Skip prefix
      let start = i;
      if (src[i] === 'f' || src[i] === 'r' || src[i] === 'b') i++;
      const quote = src.slice(i, i + 3);
      i += 3;
      let val = '';
      while (i < src.length) {
        if (src.slice(i, i + 3) === quote) { i += 3; break; }
        if (src[i] === '\\') {
          val += handleEscape(src, i);
          i += 2;
          if (src[i - 1] === 'x') i += 2;
          else if (src[i - 1] === 'u') i += 4;
          else if (src[i - 1] === 'U') i += 8;
        } else {
          val += src[i]; i++;
        }
        if (i - start > 500000) break; // safety
      }
      tokens.push({ type: 'string', value: val });
      continue;
    }

    // Regular strings
    if (ch === '"' || ch === "'" ||
        ((ch === 'f' || ch === 'r' || ch === 'b') && (src[i + 1] === '"' || src[i + 1] === "'"))) {
      let qi = i;
      if (ch === 'f' || ch === 'r' || ch === 'b') qi++;
      const q = src[qi];
      i = qi + 1;
      let val = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') {
          val += handleEscape(src, i);
          i += 2;
        } else {
          val += src[i]; i++;
        }
      }
      if (i < src.length) i++; // skip closing quote
      tokens.push({ type: 'string', value: val });
      continue;
    }

    // Numbers (int, float, negative)
    if (/[\d.]/.test(ch) || (ch === '-' && i + 1 < src.length && /[\d.]/.test(src[i + 1]))) {
      let num = '';
      if (ch === '-') { num += '-'; i++; }
      while (i < src.length && /[\d._eE+\-]/.test(src[i])) {
        if (src[i] !== '_') num += src[i];
        i++;
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    // Identifiers (True, False, None, variable names)
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) {
        ident += src[i]; i++;
      }
      if (ident === 'True') tokens.push({ type: 'boolean', value: true });
      else if (ident === 'False') tokens.push({ type: 'boolean', value: false });
      else if (ident === 'None') tokens.push({ type: 'none' });
      else tokens.push({ type: 'ident', value: ident });
      continue;
    }

    // Skip unknown chars
    i++;
  }

  return tokens;
}

function handleEscape(src: string, i: number): string {
  const next = src[i + 1];
  switch (next) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case '\\': return '\\';
    case "'": return "'";
    case '"': return '"';
    case '0': return '\0';
    case 'x': return String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16) || 0);
    case 'u': return String.fromCodePoint(parseInt(src.slice(i + 2, i + 6), 16) || 0);
    default: return next || '';
  }
}

// Recursive descent parser
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(): Token | undefined { return this.tokens[this.pos]; }
  advance(): Token | undefined { return this.tokens[this.pos++]; }

  parseValue(): unknown {
    const tok = this.peek();
    if (!tok) return null;

    switch (tok.type) {
      case 'lbrace': return this.parseDict();
      case 'lbracket': return this.parseList();
      case 'lparen': return this.parseTuple();
      case 'string': this.advance(); return tok.value;
      case 'number': this.advance(); return tok.value;
      case 'boolean': this.advance(); return tok.value;
      case 'none': this.advance(); return null;
      case 'ident': {
        // Could be a function call like dict(...) or set(...) — skip it
        this.advance();
        if (this.peek()?.type === 'lparen') {
          return this.parseCallArgs();
        }
        return tok.value;
      }
      default:
        this.advance();
        return null;
    }
  }

  parseDict(): Record<string, unknown> {
    this.advance(); // skip {
    const obj: Record<string, unknown> = {};
    while (this.peek() && this.peek()!.type !== 'rbrace') {
      const key = this.parseValue();
      if (this.peek()?.type === 'colon') {
        this.advance(); // skip :
        const val = this.parseValue();
        if (key != null) obj[String(key)] = val;
      }
      if (this.peek()?.type === 'comma') this.advance();
    }
    if (this.peek()?.type === 'rbrace') this.advance();
    return obj;
  }

  parseList(): unknown[] {
    this.advance(); // skip [
    const arr: unknown[] = [];
    while (this.peek() && this.peek()!.type !== 'rbracket') {
      arr.push(this.parseValue());
      if (this.peek()?.type === 'comma') this.advance();
    }
    if (this.peek()?.type === 'rbracket') this.advance();
    return arr;
  }

  parseTuple(): unknown[] {
    this.advance(); // skip (
    const arr: unknown[] = [];
    while (this.peek() && this.peek()!.type !== 'rparen') {
      arr.push(this.parseValue());
      if (this.peek()?.type === 'comma') this.advance();
    }
    if (this.peek()?.type === 'rparen') this.advance();
    return arr;
  }

  parseCallArgs(): unknown {
    this.advance(); // skip (
    // Try to parse as dict-like kwargs or list of values
    const arr: unknown[] = [];
    while (this.peek() && this.peek()!.type !== 'rparen') {
      // Check for key=value pattern
      if (this.peek()?.type === 'ident' && this.tokens[this.pos + 1]?.type === 'colon') {
        // Not likely kwargs use = not :, just parse value
      }
      arr.push(this.parseValue());
      if (this.peek()?.type === 'comma') this.advance();
    }
    if (this.peek()?.type === 'rparen') this.advance();
    return arr.length === 1 ? arr[0] : arr;
  }
}

export function parsePythonLiteral(src: string): unknown {
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  return parser.parseValue();
}

export interface DetectedVariable {
  name: string;
  startIndex: number;
  content: string;
  recordCount: number;
  preview: Record<string, unknown>[];
}

const CANDIDATE_FIELDS = new Set([
  'name', 'full_name', 'candidate_name', 'first_name', 'last_name',
  'email', 'phone', 'location', 'skills', 'education', 'experience',
  'raw_text', 'resume_text', 'text', 'source_file', 'candidate_id',
  'linkedin', 'github', 'website', 'work_experience', 'jobs',
  'school', 'degrees', 'skill_list', 'technical_skills',
  'years_experience', 'title', 'current_title', 'summary',
  'certifications', 'projects', 'achievements',
]);

function isCandidateRecord(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  const matches = keys.filter((k) => CANDIDATE_FIELDS.has(k.toLowerCase()));
  return matches.length >= 2;
}

export function detectCandidateLists(fileContent: string): DetectedVariable[] {
  const results: DetectedVariable[] = [];

  // Find top-level assignments: VARNAME = [...]
  const assignPattern = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[/gm;
  let match: RegExpExecArray | null;

  while ((match = assignPattern.exec(fileContent)) !== null) {
    const varName = match[1];
    const startIdx = match.index + match[0].length - 1; // points to [

    // Extract the balanced bracket content
    const listContent = extractBalanced(fileContent, startIdx, '[', ']');
    if (!listContent) continue;

    try {
      const parsed = parsePythonLiteral(listContent);
      if (!Array.isArray(parsed) || parsed.length === 0) continue;

      // Check if items look like candidate records
      const candidateItems = parsed.filter(isCandidateRecord);
      if (candidateItems.length < 1) continue;

      results.push({
        name: varName,
        startIndex: match.index,
        content: listContent,
        recordCount: parsed.length,
        preview: parsed.slice(0, 3) as Record<string, unknown>[],
      });
    } catch {
      // Parse failed for this variable, skip
    }
  }

  // Sort by record count descending — largest first
  results.sort((a, b) => b.recordCount - a.recordCount);

  return results;
}

function extractBalanced(src: string, start: number, open: string, close: string): string | null {
  if (src[start] !== open) return null;
  let depth = 0;
  let i = start;
  let inString = false;
  let stringChar = '';
  let isTriple = false;

  while (i < src.length) {
    // Handle triple-quoted strings
    if (!inString && (src.slice(i, i + 3) === '"""' || src.slice(i, i + 3) === "'''")) {
      inString = true;
      isTriple = true;
      stringChar = src.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (inString && isTriple && src.slice(i, i + 3) === stringChar) {
      inString = false;
      isTriple = false;
      i += 3;
      continue;
    }

    // Handle regular strings
    if (!inString && (src[i] === '"' || src[i] === "'")) {
      inString = true;
      isTriple = false;
      stringChar = src[i];
      i++;
      continue;
    }
    if (inString && !isTriple && src[i] === stringChar && src[i - 1] !== '\\') {
      inString = false;
      i++;
      continue;
    }

    if (inString) { i++; continue; }

    // Handle comments
    if (src[i] === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    if (src[i] === open) depth++;
    if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i++;

    // Safety limit
    if (i - start > 10_000_000) return null;
  }

  return null;
}

// Field name normalization
const FIELD_MAP: Record<string, string> = {
  full_name: 'full_name', name: 'full_name', candidate_name: 'full_name',
  first_name: 'first_name', last_name: 'last_name',
  email: 'email', phone: 'phone', location: 'location',
  linkedin: 'linkedin', github: 'github', website: 'website',
  resume_text: 'raw_text', raw_text: 'raw_text', text: 'raw_text',
  work_experience: 'experience', experience: 'experience', jobs: 'experience',
  skill_list: 'skills', skills: 'skills', technical_skills: 'skills',
  school: 'education', education: 'education', degrees: 'education',
  certifications: 'certifications', certs: 'certifications',
  source_file: 'source_file_name', source_file_name: 'source_file_name',
  candidate_id: 'candidate_id_external', id: 'candidate_id_external',
  title: 'current_title', current_title: 'current_title', job_title: 'current_title',
  summary: 'candidate_summary', profile_summary: 'candidate_summary',
  years_experience: 'years_experience', yoe: 'years_experience',
  projects: 'projects', achievements: 'achievements',
  sections: 'sections',
};

export interface NormalizedCandidate {
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  current_title: string;
  years_experience: number | null;
  skills: string[];
  education: string;
  experience: unknown;
  certifications: string[];
  raw_text: string;
  source_file_name: string;
  candidate_id_external: string;
  candidate_summary: string;
  seniority_level: string;
  functional_area: string;
  confidence_score: number;
  reasoning: string;
}

const SENIORITY_KEYWORDS: Record<string, string[]> = {
  'Senior': ['senior', 'sr.', 'lead', 'staff', 'principal', 'architect', 'manager', 'director', 'vp', 'head of', 'chief'],
  'Mid-level': ['mid', 'intermediate', 'software engineer', 'developer', 'analyst', 'specialist'],
  'Entry/Junior': ['junior', 'jr.', 'intern', 'entry', 'associate', 'graduate', 'trainee', 'new grad'],
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Software Engineering': ['software', 'developer', 'engineer', 'frontend', 'backend', 'fullstack', 'full-stack', 'web dev', 'mobile dev', 'ios', 'android', 'react', 'java', 'python', 'javascript', 'typescript', 'node'],
  'AI / Machine Learning': ['machine learning', 'ml', 'deep learning', 'ai', 'artificial intelligence', 'nlp', 'computer vision', 'data scientist', 'tensorflow', 'pytorch'],
  'Data Analytics': ['data analyst', 'analytics', 'business intelligence', 'bi ', 'tableau', 'power bi', 'sql analyst', 'data engineering'],
  'DevOps / Cloud / SRE': ['devops', 'sre', 'cloud', 'infrastructure', 'kubernetes', 'docker', 'aws', 'azure', 'gcp', 'platform', 'reliability'],
  'Cybersecurity': ['security', 'cyber', 'infosec', 'penetration', 'vulnerability', 'soc ', 'compliance'],
  'Product': ['product manager', 'product owner', 'product lead', 'pm '],
  'Sales': ['sales', 'account executive', 'bdr', 'sdr', 'business development', 'revenue'],
  'Operations': ['operations', 'project manager', 'program manager', 'scrum master'],
};

export function inferSeniority(candidate: Record<string, unknown>): { level: string; confidence: number; reasoning: string } {
  const title = String(candidate.current_title || candidate.title || '').toLowerCase();
  const yoe = typeof candidate.years_experience === 'number' ? candidate.years_experience : null;
  const rawText = String(candidate.raw_text || candidate.resume_text || candidate.text || '').toLowerCase();
  const allText = `${title} ${rawText}`.slice(0, 5000);

  // Years-based inference
  if (yoe !== null) {
    if (yoe >= 7) return { level: 'Senior', confidence: 85, reasoning: `${yoe} years experience indicates senior level` };
    if (yoe >= 4) return { level: 'Mid-level', confidence: 80, reasoning: `${yoe} years experience indicates mid-level` };
    if (yoe >= 2) return { level: 'Entry/Junior', confidence: 75, reasoning: `${yoe} years experience indicates entry/junior level` };
    return { level: 'Entry/Junior', confidence: 70, reasoning: `${yoe} years or less experience` };
  }

  // Title-based inference
  for (const [level, keywords] of Object.entries(SENIORITY_KEYWORDS)) {
    for (const kw of keywords) {
      if (title.includes(kw)) {
        return { level, confidence: 75, reasoning: `Title "${title}" contains "${kw}"` };
      }
    }
  }

  // Text-based inference
  const seniorSignals = ['managed team', 'led team', 'architected', 'promoted to', 'leadership', '10+ years', '8+ years'];
  const midSignals = ['3+ years', '4+ years', '5 years', 'independently'];
  const juniorSignals = ['intern', 'bootcamp', 'recently graduated', 'entry level', 'new grad'];

  if (seniorSignals.some((s) => allText.includes(s))) return { level: 'Senior', confidence: 60, reasoning: 'Text contains senior-level signals' };
  if (juniorSignals.some((s) => allText.includes(s))) return { level: 'Entry/Junior', confidence: 60, reasoning: 'Text contains entry-level signals' };
  if (midSignals.some((s) => allText.includes(s))) return { level: 'Mid-level', confidence: 55, reasoning: 'Text contains mid-level signals' };

  return { level: 'Mid-level', confidence: 40, reasoning: 'Default assignment — insufficient signals' };
}

export function inferCategory(candidate: Record<string, unknown>): string {
  const title = String(candidate.current_title || candidate.title || '').toLowerCase();
  const skills = Array.isArray(candidate.skills) ? candidate.skills.join(' ').toLowerCase() : '';
  const rawText = String(candidate.raw_text || candidate.resume_text || '').toLowerCase().slice(0, 3000);
  const searchText = `${title} ${skills} ${rawText}`;

  let bestCategory = 'Other';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => searchText.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

export function normalizeCandidate(raw: Record<string, unknown>): NormalizedCandidate {
  const normalized: Record<string, unknown> = {};

  // Map fields
  for (const [rawKey, value] of Object.entries(raw)) {
    const mappedKey = FIELD_MAP[rawKey.toLowerCase()] || rawKey.toLowerCase();
    if (!normalized[mappedKey] || normalized[mappedKey] === '') {
      normalized[mappedKey] = value;
    }
  }

  // Compose full_name from first + last if needed
  if (!normalized.full_name && (normalized.first_name || normalized.last_name)) {
    normalized.full_name = `${normalized.first_name || ''} ${normalized.last_name || ''}`.trim();
  }

  // Normalize skills to array
  let skills: string[] = [];
  if (Array.isArray(normalized.skills)) {
    skills = normalized.skills.map(String).filter(Boolean);
  } else if (typeof normalized.skills === 'string') {
    skills = (normalized.skills as string).split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Normalize education to string
  let education = '';
  if (typeof normalized.education === 'string') {
    education = normalized.education;
  } else if (Array.isArray(normalized.education)) {
    education = normalized.education.map(String).join('; ');
  }

  // Normalize certifications
  let certs: string[] = [];
  if (Array.isArray(normalized.certifications)) {
    certs = normalized.certifications.map(String).filter(Boolean);
  } else if (typeof normalized.certifications === 'string') {
    certs = (normalized.certifications as string).split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Infer years
  let yoe: number | null = null;
  if (normalized.years_experience != null) {
    const parsed = parseFloat(String(normalized.years_experience));
    if (!isNaN(parsed)) yoe = parsed;
  }

  // Infer seniority and category
  const candidateForInference = { ...normalized, skills, years_experience: yoe };
  const seniority = inferSeniority(candidateForInference as Record<string, unknown>);
  const category = inferCategory(candidateForInference as Record<string, unknown>);

  return {
    full_name: String(normalized.full_name || 'Unknown'),
    first_name: normalized.first_name ? String(normalized.first_name) : undefined,
    last_name: normalized.last_name ? String(normalized.last_name) : undefined,
    email: String(normalized.email || ''),
    phone: String(normalized.phone || ''),
    location: String(normalized.location || ''),
    linkedin: String(normalized.linkedin || ''),
    github: String(normalized.github || ''),
    website: String(normalized.website || ''),
    current_title: String(normalized.current_title || ''),
    years_experience: yoe,
    skills,
    education,
    experience: normalized.experience || [],
    certifications: certs,
    raw_text: String(normalized.raw_text || ''),
    source_file_name: String(normalized.source_file_name || ''),
    candidate_id_external: String(normalized.candidate_id_external || ''),
    candidate_summary: String(normalized.candidate_summary || ''),
    seniority_level: seniority.level,
    functional_area: category,
    confidence_score: seniority.confidence,
    reasoning: seniority.reasoning,
  };
}
```

---

## FILE: `src/lib/supabase.ts`

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAdminToken } from './jobposter-auth';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key);

export function getSupabase() {
  return supabase;
}

let cachedAdminClient: SupabaseClient | null = null;
let cachedAdminToken: string | null = null;

export function adminSupabase(): SupabaseClient {
  const token = getAdminToken();
  if (!token) return supabase;
  if (cachedAdminClient && cachedAdminToken === token) return cachedAdminClient;
  cachedAdminToken = token;
  cachedAdminClient = createClient(url, key, {
    global: {
      headers: {
        'x-admin-token': token,
      },
    },
  });
  return cachedAdminClient;
}
```

---

## FILE: `src/lib/zip-extract.ts`

```typescript
import { unzipSync } from 'fflate';

export interface ExtractedFile {
  name: string;
  file: File;
}

const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'txt', 'csv', 'tsv', 'xlsx', 'xls', 'xlsm', 'rtf', 'json',
]);

function getExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    rtf: 'application/rtf',
    json: 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

export function isZipFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.zip');
}

export async function extractZip(zipFile: File): Promise<ExtractedFile[]> {
  const buffer = new Uint8Array(await zipFile.arrayBuffer());
  const unzipped = unzipSync(buffer);
  const results: ExtractedFile[] = [];

  for (const [path, data] of Object.entries(unzipped)) {
    if (data.length === 0) continue;

    const fileName = path.split('/').pop() || path;
    if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) continue;
    if (path.includes('__MACOSX/')) continue;

    const ext = getExtension(fileName);
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    const blob = new Blob([data], { type: getMimeType(ext) });
    const file = new File([blob], fileName, { type: getMimeType(ext) });
    results.push({ name: fileName, file });
  }

  return results;
}
```

---

## FILE: `src/pages/ResumeScannerPage.tsx`

```tsx
import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ScanLine,
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  Lightbulb,
  Target,
  MessageSquareQuote,
  HelpCircle,
  Wand2,
  X,
} from 'lucide-react';
import { isZipFile, extractZip } from '../lib/zip-extract';

interface ScannerProps {
  onBack: () => void;
}

interface CandidateAdvice {
  summary: string;
  match_score: number;
  fit_verdict: string;
  experience_highlights: string[];
  top_skills: string[];
  resume_strengths: string[];
  resume_improvements: string[];
  missing_keywords: string[];
  tailoring_tips: string[];
  cover_letter_hook: string;
  interview_prep: string[];
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function ResumeScannerPage({ onBack }: ScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [scanning, setScanning] = useState(false);
  const [advice, setAdvice] = useState<CandidateAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setError('Please upload a file under 10 MB.');
      return;
    }
    const ok = ['.pdf', '.doc', '.docx', '.txt', '.zip'].some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setError('Supported: PDF, DOC, DOCX, TXT, ZIP.');
      return;
    }
    setFile(f);
  }

  async function handleScan() {
    if (!file) {
      setError('Upload your resume first.');
      return;
    }
    setScanning(true);
    setError(null);
    setAdvice(null);
    try {
      let fileToScan = file;
      if (isZipFile(file)) {
        const extracted = await extractZip(file);
        const resume = extracted.find((e) => {
          const n = e.name.toLowerCase();
          return n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.doc') || n.endsWith('.txt');
        });
        if (!resume) {
          throw new Error('No resume file (PDF, DOCX, DOC, TXT) found inside the ZIP.');
        }
        fileToScan = resume.file;
      }
      const fd = new FormData();
      fd.append('file', fileToScan);
      fd.append('target_role', targetRole.trim());
      fd.append('job_description', jobDescription.trim());

      const res = await fetch(`${supabaseUrl}/functions/v1/scan-resume-public`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseAnonKey}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Scan failed. Try again.');
      }
      setAdvice(data.advice as CandidateAdvice);
      setTimeout(() => document.getElementById('scanner-results')?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed. Try again.');
    } finally {
      setScanning(false);
    }
  }

  function reset() {
    setFile(null);
    setAdvice(null);
    setError(null);
    setTargetRole('');
    setJobDescription('');
  }

  const score = advice?.match_score ?? 0;
  const scoreTone = score >= 75 ? 'emerald' : score >= 50 ? 'golden' : 'rose';
  const ringColor: Record<string, string> = {
    emerald: '#34d399',
    golden: '#f5b937',
    rose: '#fb7185',
  };

  return (
    <div className="min-h-screen bg-dark-950">
      <div className="fixed top-0 left-0 right-0 z-50 bg-dark-950/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto section-padding flex items-center justify-between py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/60 hover:text-golden-400 transition-colors duration-300 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
          <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
            <img src="/logo.webp" alt="Golden Hire" className="h-12 w-auto object-contain" />
          </a>
        </div>
      </div>

      <section className="pt-32 pb-10">
        <div className="max-w-4xl mx-auto section-padding text-center">
          <div className="inline-flex items-center gap-2 bg-golden-500/10 border border-golden-500/25 rounded-full px-3 py-1 mb-5">
            <Sparkles className="w-3.5 h-3.5 text-golden-400" />
            <span className="text-golden-300 text-[11px] font-bold uppercase tracking-widest">Free Candidate Resource</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4 leading-tight">
            Resume Scanner
          </h1>
          <p className="text-white/60 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Upload your resume and we'll grade it against any job description. Get a fit score,
            specific edits, missing keywords, and interview prep — in under a minute.
          </p>
        </div>
      </section>

      <section className="pb-20">
        <div className="max-w-4xl mx-auto section-padding">
          <div className="bg-gradient-to-br from-white/[0.04] to-white/[0.015] border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-sm">
            <div className="grid lg:grid-cols-[1.05fr,1fr] gap-6">
              <div>
                <p className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-golden-400" /> Your resume
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    pickFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={`relative cursor-pointer border-2 border-dashed rounded-2xl px-5 py-10 text-center transition-all ${
                    dragOver
                      ? 'border-golden-500/60 bg-golden-500/5'
                      : file
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-white/15 hover:border-golden-500/40 hover:bg-white/[0.02]'
                  }`}
                >
                  {file ? (
                    <>
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <p className="text-white text-sm font-semibold truncate">{file.name}</p>
                      <p className="text-white/40 text-xs mt-1">{formatBytes(file.size)} -- click to replace</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="absolute top-3 right-3 text-white/40 hover:text-red-400"
                        aria-label="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-white/40 mx-auto mb-2" />
                      <p className="text-white text-sm font-semibold">Drop your resume here</p>
                      <p className="text-white/40 text-xs mt-1">PDF, DOC, DOCX, or TXT &middot; up to 10 MB</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.zip,.rtf,.pptx,.xlsx,.csv"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-1.5">
                    Target Role <span className="text-white/30 normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Product Designer, RN, Sales Engineer"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-golden-500/40 transition-colors"
                  />
                </div>
              </div>

              <div>
                <p className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-golden-400" /> Job description
                  <span className="text-white/30 text-[11px] font-normal">(optional, but recommended)</span>
                </p>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder={`Paste the full job description here.\n\nWorks with any company's JD — the more detail, the more tailored your advice will be.`}
                  rows={11}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-golden-500/40 transition-colors resize-y min-h-[200px]"
                />
                <p className="text-white/40 text-[11px] mt-1.5">
                  Without a JD we'll give general advice for your inferred career path.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-5 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={handleScan}
                disabled={scanning || !file}
                className="inline-flex items-center gap-2 bg-golden-500 hover:bg-golden-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all shadow-lg shadow-golden-500/20"
              >
                {scanning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <ScanLine className="w-4 h-4" />
                    Scan my resume
                  </>
                )}
              </button>
              {(file || advice) && (
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-semibold text-sm px-5 py-3 rounded-xl transition-all"
                >
                  Start over
                </button>
              )}
            </div>

            <div className="mt-5 grid sm:grid-cols-3 gap-3 text-[12px] text-white/50">
              <Privacy icon="lock">Your resume is never stored or shared.</Privacy>
              <Privacy icon="zap">Results in 10–20 seconds.</Privacy>
              <Privacy icon="check">Works with any job description.</Privacy>
            </div>
          </div>

          {advice && (
            <div id="scanner-results" className="mt-8 space-y-5">
              <div className="bg-gradient-to-br from-golden-500/10 to-golden-500/0 border border-golden-500/25 rounded-3xl p-6 sm:p-8">
                <div className="flex items-start gap-5 flex-wrap">
                  <ScoreRing score={score} color={ringColor[scoreTone]} />
                  <div className="flex-1 min-w-[260px]">
                    <p className="text-golden-300 text-[11px] font-bold uppercase tracking-widest mb-1">Your Result</p>
                    <p className="text-white font-display font-bold text-xl mb-2 leading-snug">
                      {advice.fit_verdict}
                    </p>
                    <p className="text-white/75 text-sm leading-relaxed">{advice.summary}</p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <Card icon={<Briefcase className="w-4 h-4 text-golden-400" />} title="Experience highlights">
                  <BulletList items={advice.experience_highlights} />
                </Card>
                <Card icon={<Sparkles className="w-4 h-4 text-golden-400" />} title="Top skills">
                  <div className="flex flex-wrap gap-1.5">
                    {advice.top_skills.map((s, i) => (
                      <span key={i} className="bg-white/5 border border-white/10 rounded-md px-2.5 py-1 text-[12px] text-white/85">
                        {s}
                      </span>
                    ))}
                  </div>
                </Card>
                <Card icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} title="What your resume does well" tone="emerald">
                  <BulletList items={advice.resume_strengths} />
                </Card>
                <Card icon={<Wand2 className="w-4 h-4 text-golden-400" />} title="Specific improvements to make" tone="golden">
                  <BulletList items={advice.resume_improvements} />
                </Card>
                {advice.missing_keywords.length > 0 && (
                  <Card icon={<Target className="w-4 h-4 text-rose-400" />} title="Missing keywords" tone="rose">
                    <div className="flex flex-wrap gap-1.5">
                      {advice.missing_keywords.map((s, i) => (
                        <span key={i} className="bg-rose-500/10 border border-rose-500/25 rounded-md px-2.5 py-1 text-[12px] text-rose-200">
                          {s}
                        </span>
                      ))}
                    </div>
                  </Card>
                )}
                <Card icon={<Lightbulb className="w-4 h-4 text-golden-400" />} title="Tailoring tips">
                  <BulletList items={advice.tailoring_tips} />
                </Card>
              </div>

              {advice.cover_letter_hook && (
                <Card icon={<MessageSquareQuote className="w-4 h-4 text-golden-400" />} title="Cover letter / outreach hook">
                  <p className="text-white/85 text-sm italic leading-relaxed">"{advice.cover_letter_hook}"</p>
                </Card>
              )}

              {advice.interview_prep.length > 0 && (
                <Card icon={<HelpCircle className="w-4 h-4 text-golden-400" />} title="Interview prep">
                  <ol className="space-y-2 text-white/85 text-sm list-decimal list-inside">
                    {advice.interview_prep.map((q, i) => <li key={i} className="leading-relaxed">{q}</li>)}
                  </ol>
                </Card>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative w-[110px] h-[110px] flex-shrink-0">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
        <circle
          cx="55"
          cy="55"
          r={r}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 55 55)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-white font-display font-bold text-2xl leading-none">{score}</p>
        <p className="text-white/40 text-[10px] uppercase tracking-wider mt-0.5">match</p>
      </div>
    </div>
  );
}

function Card({ icon, title, tone = 'default', children }: {
  icon: React.ReactNode;
  title: string;
  tone?: 'default' | 'emerald' | 'golden' | 'rose';
  children: React.ReactNode;
}) {
  const ring: Record<string, string> = {
    default: 'border-white/10',
    emerald: 'border-emerald-500/20',
    golden: 'border-golden-500/20',
    rose: 'border-rose-500/20',
  };
  return (
    <div className={`bg-white/[0.03] border ${ring[tone]} rounded-2xl p-5`}>
      <p className="text-white/55 text-[11px] uppercase font-semibold tracking-wider mb-2.5 flex items-center gap-1.5">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-white/40 text-xs italic">None</p>;
  return (
    <ul className="space-y-1.5 text-[13px] text-white/85">
      {items.map((s, i) => <li key={i} className="leading-snug">- {s}</li>)}
    </ul>
  );
}

function Privacy({ icon, children }: { icon: 'lock' | 'zap' | 'check'; children: React.ReactNode }) {
  const dot = icon === 'lock' ? '#a1a1aa' : icon === 'zap' ? '#f5b937' : '#34d399';
  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />
      {children}
    </div>
  );
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
```

---

## FILE: `src/pages/combine/CandidateResume.tsx`

```tsx
import { useState } from 'react';
import { ArrowLeft, Upload, FileText, User, Mail, Linkedin } from 'lucide-react';
import { useCombine } from './CombineContext';
import { supabase } from '../../lib/supabase';

export default function CandidateResume() {
  const { navigate, selectedJob, setCandidate } = useCombine();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleContinue() {
    if (!name.trim() || !email.trim() || !resumeText.trim()) {
      setError('Please fill in all fields'); return;
    }
    setSubmitting(true); setError('');

    const { data, error: insertErr } = await supabase.from('combine_candidate_profiles')
      .insert({ name: name.trim(), email: email.trim(), resume_text: resumeText.trim(), linkedin_url: linkedinUrl.trim() || null, source: 'screening_link' })
      .select().single();

    if (insertErr || !data) {
      setError(insertErr?.message || 'Failed to save'); setSubmitting(false); return;
    }

    setCandidate(data);
    navigate('candidate_interests', { jobId: selectedJob?.id });
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] flex flex-col">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate('landing')} className="flex items-center gap-2 text-white/35 hover:text-white/60 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <div className="w-2 h-2 rounded-full bg-white/15" />
            <div className="w-2 h-2 rounded-full bg-white/15" />
            <div className="w-2 h-2 rounded-full bg-white/15" />
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-xl mx-auto px-6 py-10 w-full">
        {selectedJob && (
          <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl px-4 py-3 mb-8">
            <p className="text-[#D4AF37] text-xs font-semibold">Applying for</p>
            <p className="text-white text-sm font-medium mt-0.5">{selectedJob.title} at {selectedJob.company}</p>
          </div>
        )}

        <h1 className="text-white text-2xl font-bold mb-2">Start your screening</h1>
        <p className="text-white/35 text-sm mb-8 leading-relaxed">Share your resume and basic info. No account needed -- our AI screener will interview you next.</p>

        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-white/45 text-[11px] font-semibold mb-1.5">
                <User className="w-3 h-3" /> Full Name
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-[#141414] border border-white/8 rounded-lg px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#D4AF37]/25 transition-colors"
                placeholder="Your full name" />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-white/45 text-[11px] font-semibold mb-1.5">
                <Mail className="w-3 h-3" /> Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#141414] border border-white/8 rounded-lg px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#D4AF37]/25 transition-colors"
                placeholder="you@email.com" />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-white/45 text-[11px] font-semibold mb-1.5">
              <Linkedin className="w-3 h-3" /> LinkedIn (optional)
            </label>
            <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
              className="w-full bg-[#141414] border border-white/8 rounded-lg px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#D4AF37]/25 transition-colors"
              placeholder="https://linkedin.com/in/your-profile" />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-white/45 text-[11px] font-semibold mb-1.5">
              <FileText className="w-3 h-3" /> Resume
            </label>
            <div className="relative">
              <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={10}
                className="w-full bg-[#141414] border border-white/8 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#D4AF37]/25 resize-none leading-relaxed transition-colors"
                placeholder="Paste your resume text here (work experience, education, skills, etc.)" />
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-white/15 text-[10px]">
                <Upload className="w-3 h-3" /> Paste text
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/15 rounded-lg px-3 py-2">{error}</p>}

          <button onClick={handleContinue} disabled={submitting}
            className="w-full bg-[#D4AF37] hover:bg-[#C4A030] disabled:opacity-40 text-black font-bold py-3.5 rounded-xl text-sm transition-colors">
            {submitting ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## FILE: `src/pages/jobposter/CandidatesTab.tsx`

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Phone, FileText, MessageSquare, Trash2, Users, ChevronDown, ExternalLink, Paperclip, Calendar, Upload, Sparkles, RefreshCw, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Briefcase, CircleCheck as CheckCircle, Circle as XCircle, Clock, ClipboardList } from 'lucide-react';
import {
  fetchAllJobs,
  fetchApplications,
  deleteApplication,
  fetchAllJobQuestions,
  uploadApplicationFile,
  updateApplicationFiles,
  updateApplicationEmailStatus,
  fetchScanReportsByApplication,
  triggerResumeScan,
} from '../../lib/jobs-api';
import { sendPostmarkEmail } from '../../lib/postmark';
import { adminSupabase } from '../../lib/supabase';
import { isZipFile, extractZip } from '../../lib/zip-extract';
import type { Job, JobApplication, JobQuestion, ResumeScanReport } from '../../lib/types';

export default function CandidatesTab({ refreshKey, initialJobFilter }: { refreshKey: number; initialJobFilter?: string }) {
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [questions, setQuestions] = useState<JobQuestion[]>([]);
  const [reports, setReports] = useState<Record<string, ResumeScanReport>>({});
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobFilter, setJobFilter] = useState<string>(initialJobFilter || 'all');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [a, j, qs] = await Promise.all([
        fetchApplications(),
        fetchAllJobs(),
        fetchAllJobQuestions(),
      ]);
      setApps(a);
      setJobs(j);
      setQuestions(qs);
      const reportMap = await fetchScanReportsByApplication(a.map((x) => x.id)).catch(() => ({}));
      setReports(reportMap);
    } finally {
      setLoading(false);
    }
  }

  async function runScan(app: JobApplication) {
    if (!app.resume_url) return;
    setScanningId(app.id);
    try {
      const report = await triggerResumeScan(app.id);
      if (report) {
        setReports((prev) => ({ ...prev, [app.id]: report }));
      }
    } finally {
      setScanningId(null);
    }
  }

  useEffect(() => {
    if (initialJobFilter) setJobFilter(initialJobFilter);
  }, [initialJobFilter]);

  useEffect(() => {
    load();
  }, [refreshKey]);

  const jobMap = useMemo(() => {
    const map = new Map<string, Job>();
    jobs.forEach((j) => map.set(j.id, j));
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    if (jobFilter === 'all') return apps;
    if (jobFilter === 'general') return apps.filter((a) => !a.job_id);
    return apps.filter((a) => a.job_id === jobFilter);
  }, [apps, jobFilter]);

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [targetApp, setTargetApp] = useState<{ id: string; mode: 'resume' | 'attachment' } | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);

  async function sendStatusEmail(app: JobApplication, action: 'advanced' | 'rejected' | 'held') {
    const job = app.job_id ? jobMap.get(app.job_id) : null;
    const roleLabel = job?.title ?? 'the position';

    if (action !== 'held') {
      const subject = action === 'advanced'
        ? `Next steps — ${roleLabel}`
        : `Your application for ${roleLabel}`;

      const html = action === 'advanced'
        ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
            <div style="padding:32px 0;border-bottom:1px solid #eee;">
              <h1 style="font-size:20px;font-weight:700;margin:0 0 8px;">We'd love to connect, ${app.name.split(' ')[0]}!</h1>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0;">
                We were impressed with your application for <strong>${roleLabel}</strong> and would love to schedule a conversation.
              </p>
            </div>
            <div style="padding:24px 0;">
              <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 16px;">
                Please reply to this email with a few dates and times that work for you for a 20–30 minute call. We look forward to speaking with you!
              </p>
            </div>
            <div style="padding:20px 0;border-top:1px solid #eee;font-size:12px;color:#999;">
              Golden Hire Recruiting &mdash; william@goldenhire.com
            </div>
          </div>`
        : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
            <div style="padding:32px 0;border-bottom:1px solid #eee;">
              <h1 style="font-size:20px;font-weight:700;margin:0 0 8px;">Thank you for your application</h1>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0;">
                We appreciate your interest in the <strong>${roleLabel}</strong> position.
              </p>
            </div>
            <div style="padding:24px 0;">
              <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 16px;">
                After careful consideration, we will be pursuing other candidates at this time. We truly appreciate the time you invested in applying and wish you the very best in your search.
              </p>
            </div>
            <div style="padding:20px 0;border-top:1px solid #eee;font-size:12px;color:#999;">
              Golden Hire Recruiting &mdash; william@goldenhire.com
            </div>
          </div>`;

      await sendPostmarkEmail({ to: app.email, subject, html_body: html });
    }

    const updated = await updateApplicationEmailStatus(app.id, action);
    setApps((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
  }

  async function handleEmailAction(app: JobApplication, action: 'advanced' | 'rejected' | 'held') {
    setEmailingId(app.id);
    try {
      await sendStatusEmail(app, action);
    } finally {
      setEmailingId(null);
    }
  }

  async function handleSendScreening(app: JobApplication) {
    setEmailingId(app.id);
    try {
      const job = app.job_id ? jobMap.get(app.job_id) : null;
      const roleLabel = job?.title ?? 'the position';

      const { data: invitation, error: invErr } = await adminSupabase()
        .from('screening_invitations')
        .insert({
          application_id: app.id,
          candidate_name: app.name,
          candidate_email: app.email,
          job_title: roleLabel,
          company_name: 'Golden Hire',
          job_description: job?.description || '',
          resume_text: app.resume_name || '',
          max_stage: 'screen',
        })
        .select('id')
        .single();

      if (invErr || !invitation) throw invErr ?? new Error('Failed to create screening');

      const screenUrl = `${window.location.origin}/#/screen/${invitation.id}`;
      const firstName = app.name.split(' ')[0];

      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
        <div style="padding:32px 0;border-bottom:1px solid #eee;">
          <h1 style="font-size:20px;font-weight:700;margin:0 0 8px;">Thank you for applying, ${firstName}!</h1>
          <p style="color:#555;font-size:15px;line-height:1.6;margin:0;">
            We appreciate your interest in the <strong>${roleLabel}</strong> position at Golden Hire.
          </p>
        </div>
        <div style="padding:24px 0;">
          <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 16px;">
            To move forward, we'd love for you to complete a quick pre-screen and screen with our AI recruiter. If you've already interacted with our chatbot during your application, you may disregard this message.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 8px;">
            What to expect:
          </p>
          <ul style="font-size:13px;line-height:1.8;color:#555;margin:0 0 20px;padding-left:20px;">
            <li><strong>Pre-Screen</strong> — 5 quick questions to confirm basics (~3 min)</li>
            <li><strong>Screen</strong> — 5 questions on motivation and fit (~5 min)</li>
          </ul>
          <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 20px;">
            The whole process takes about 8-10 minutes. Our team will review your responses and follow up with next steps.
          </p>
          <a href="${screenUrl}" style="display:inline-block;background:#d4a520;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:14px;">
            Start Pre-Screen
          </a>
          <p style="font-size:12px;color:#888;margin-top:16px;">
            Your screening ID: <code>${invitation.id.slice(0, 8)}</code>
          </p>
        </div>
        <div style="padding:20px 0;border-top:1px solid #eee;font-size:12px;color:#999;">
          Golden Hire Recruiting
        </div>
      </div>`;

      await sendPostmarkEmail({
        to: app.email,
        subject: `Complete your pre-screen — ${roleLabel}`,
        html_body: html,
      });

      const updated = await updateApplicationEmailStatus(app.id, 'advanced');
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...updated, email_status: 'advanced' as const } : a)));
    } finally {
      setEmailingId(null);
    }
  }

  async function remove(app: JobApplication) {
    if (!confirm(`Remove ${app.name}'s application?`)) return;
    await deleteApplication(app.id);
    setApps((prev) => prev.filter((a) => a.id !== app.id));
  }

  function triggerResumeUpload(app: JobApplication) {
    setUploadError(null);
    setTargetApp({ id: app.id, mode: 'resume' });
    setTimeout(() => resumeInputRef.current?.click(), 0);
  }

  function triggerAttachmentUpload(app: JobApplication) {
    setUploadError(null);
    setTargetApp({ id: app.id, mode: 'attachment' });
    setTimeout(() => attachmentInputRef.current?.click(), 0);
  }

  async function handleResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    let file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !targetApp) return;
    if (isZipFile(file)) {
      const extracted = await extractZip(file);
      const resume = extracted.find((en) => {
        const n = en.name.toLowerCase();
        return n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.doc') || n.endsWith('.txt');
      });
      if (!resume) {
        setUploadError('No resume (PDF, DOCX, DOC, TXT) found in ZIP.');
        setTargetApp(null);
        return;
      }
      file = resume.file;
    }
    const app = apps.find((a) => a.id === targetApp.id);
    if (!app) return;
    setUploadingId(app.id);
    try {
      const att = await uploadApplicationFile(file, app.job_id);
      const updated = await updateApplicationFiles(app.id, {
        resume_name: att.name,
        resume_url: att.url,
      });
      setApps((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingId(null);
      setTargetApp(null);
    }
  }

  async function handleAttachmentFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !targetApp) return;
    const app = apps.find((a) => a.id === targetApp.id);
    if (!app) return;
    setUploadingId(app.id);
    try {
      const uploaded = [];
      for (const f of files) {
        uploaded.push(await uploadApplicationFile(f, app.job_id));
      }
      const updated = await updateApplicationFiles(app.id, {
        attachments: [...(app.attachments ?? []), ...uploaded],
      });
      setApps((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingId(null);
      setTargetApp(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-golden-500/30 border-t-golden-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-golden-500/10 border border-golden-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-golden-400" />
          </div>
          <div>
            <p className="text-white font-display font-bold text-lg">Submitted Candidates</p>
            <p className="text-white/50 text-xs">{apps.length} total applications</p>
          </div>
        </div>
        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-golden-500/40"
        >
          <option value="all">All roles</option>
          <option value="general">General inquiries</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      <input
        ref={resumeInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.zip,.rtf,.pptx,.xlsx,.csv"
        onChange={handleResumeFile}
      />
      <input
        ref={attachmentInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={handleAttachmentFiles}
      />

      {uploadError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-2.5 rounded-xl">
          {uploadError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-white/5 rounded-2xl bg-white/[0.02]">
          <Users className="w-10 h-10 text-white/20 mx-auto mb-4" />
          <p className="text-white/70 font-medium">No candidates yet</p>
          <p className="text-white/40 text-sm">Submissions from the job board and chatbot appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => {
            const job = app.job_id ? jobMap.get(app.job_id) : null;
            const isOpen = expanded === app.id;
            return (
              <div key={app.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : app.id)}
                  className="w-full text-left p-5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        app.source === 'chatbot'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                          : 'bg-golden-500/15 text-golden-400 border border-golden-500/25'
                      }`}>
                        {app.source === 'chatbot' ? 'Chatbot' : 'Form'}
                      </span>
                      {app.email_status && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          app.email_status === 'advanced'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                            : app.email_status === 'rejected'
                            ? 'bg-red-500/10 text-red-400 border-red-500/25'
                            : 'bg-white/10 text-white/50 border-white/15'
                        }`}>
                          {app.email_status === 'advanced' ? 'Emailed — Advancing' : app.email_status === 'rejected' ? 'Emailed — Declined' : 'On hold'}
                        </span>
                      )}
                      <span className="text-white/40 text-xs">
                        {new Date(app.submitted_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-white font-display font-bold text-base truncate">{app.name}</p>
                    <p className="text-white/55 text-xs truncate">
                      Applied for: <span className="text-golden-300">{job?.title ?? 'General inquiry'}</span>
                    </p>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <DetailRow icon={<Mail className="w-4 h-4" />} label="Email">
                        <a href={`mailto:${app.email}`} className="text-golden-300 hover:text-golden-200">{app.email}</a>
                      </DetailRow>
                      <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone">
                        <a href={`tel:${app.phone}`} className="text-white/80 hover:text-golden-300">{app.phone}</a>
                      </DetailRow>
                      <DetailRow icon={<FileText className="w-4 h-4" />} label="Resume">
                        {app.resume_url ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={app.resume_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-golden-300 hover:text-golden-200 underline-offset-2 hover:underline"
                            >
                              {app.resume_name || 'Open resume'}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              onClick={() => triggerResumeUpload(app)}
                              disabled={uploadingId === app.id}
                              className="text-white/40 hover:text-golden-400 text-[11px] underline-offset-2 hover:underline disabled:opacity-50"
                            >
                              Replace
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white/60">
                              {app.resume_name || 'No resume'}{app.resume_name ? ' (no file stored)' : ''}
                            </span>
                            <button
                              onClick={() => triggerResumeUpload(app)}
                              disabled={uploadingId === app.id}
                              className="inline-flex items-center gap-1 text-golden-300 hover:text-golden-200 text-[11px] font-semibold border border-golden-500/30 hover:border-golden-500/50 rounded-md px-2 py-0.5 disabled:opacity-50"
                            >
                              <Upload className="w-3 h-3" />
                              {uploadingId === app.id ? 'Uploading...' : 'Upload file'}
                            </button>
                          </div>
                        )}
                      </DetailRow>
                      {app.interview_slot && (
                        <DetailRow icon={<Calendar className="w-4 h-4" />} label="Interview slot">
                          <span className="text-white/80">{app.interview_slot}</span>
                        </DetailRow>
                      )}
                    </div>

                    <ScanReportCard
                      app={app}
                      report={reports[app.id]}
                      scanning={scanningId === app.id}
                      onScan={() => runScan(app)}
                    />

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-white/50 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5" /> Attachments
                        </p>
                        <button
                          onClick={() => triggerAttachmentUpload(app)}
                          disabled={uploadingId === app.id}
                          className="inline-flex items-center gap-1 text-golden-300 hover:text-golden-200 text-[11px] font-semibold border border-golden-500/30 hover:border-golden-500/50 rounded-md px-2 py-0.5 disabled:opacity-50"
                        >
                          <Upload className="w-3 h-3" />
                          {uploadingId === app.id ? 'Uploading...' : 'Add files'}
                        </button>
                      </div>
                      {Array.isArray(app.attachments) && app.attachments.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {app.attachments.map((att, i) => (
                            <a
                              key={i}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 bg-white/[0.03] border border-white/10 hover:border-golden-500/30 rounded-lg px-3 py-1.5 text-xs text-white/80 hover:text-golden-300 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {att.name}
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="text-white/30 text-xs italic">None yet</p>
                      )}
                    </div>

                    {Object.keys(app.answers ?? {}).length > 0 && (
                      <div>
                        <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Screening Answers</p>
                        <div className="space-y-2">
                          {Object.entries(app.answers).map(([qId, answer]) => {
                            const q = questions.find((qu) => qu.id === qId);
                            return (
                              <div key={qId} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                                <p className="text-white/50 text-xs mb-1">{q?.question ?? 'Question'}</p>
                                <p className="text-white/90 text-sm">{answer}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {Array.isArray(app.transcript) && app.transcript.length > 0 && (
                      <div>
                        <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" /> Chat Transcript
                        </p>
                        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-2 max-h-80 overflow-y-auto">
                          {app.transcript.map((m, i) => {
                            const role = String((m as { role?: string }).role ?? 'user');
                            const content = String((m as { content?: string }).content ?? '');
                            return (
                              <div key={i} className={`text-sm ${role === 'assistant' ? 'text-golden-200' : 'text-white/85'}`}>
                                <span className="text-white/40 text-xs uppercase font-semibold mr-2">
                                  {role === 'assistant' ? 'Bot' : role}
                                </span>
                                {content}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4">
                      <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Send candidate email
                      </p>
                      {app.email_status && (
                        <p className="text-white/40 text-[11px] mb-3 italic">
                          Last sent: {app.email_status === 'advanced' ? 'Advance / interview request' : app.email_status === 'rejected' ? 'Rejection notice' : 'Hold (no email)'}{app.email_sent_at ? ` on ${new Date(app.email_sent_at).toLocaleString()}` : ''}
                        </p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleSendScreening(app)}
                          disabled={emailingId === app.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 text-blue-400 font-semibold py-2.5 rounded-xl text-xs transition-colors disabled:opacity-50 min-w-[100px]"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          {emailingId === app.id ? 'Sending...' : 'Screening'}
                        </button>
                        <button
                          onClick={() => handleEmailAction(app, 'advanced')}
                          disabled={emailingId === app.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 font-semibold py-2.5 rounded-xl text-xs transition-colors disabled:opacity-50 min-w-[100px]"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          {emailingId === app.id ? 'Sending...' : app.email_status === 'advanced' ? 'Resend Advance' : 'Advance'}
                        </button>
                        <button
                          onClick={() => handleEmailAction(app, 'held')}
                          disabled={emailingId === app.id}
                          className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/8 border border-white/10 text-white/50 hover:text-white/70 font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors disabled:opacity-50"
                        >
                          <Clock className="w-3.5 h-3.5" /> Hold
                        </button>
                        <button
                          onClick={() => handleEmailAction(app, 'rejected')}
                          disabled={emailingId === app.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/15 text-red-400 font-semibold py-2.5 rounded-xl text-xs transition-colors disabled:opacity-50 min-w-[100px]"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {emailingId === app.id ? 'Sending...' : app.email_status === 'rejected' ? 'Resend Decline' : 'Decline'}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => remove(app)}
                        className="flex items-center gap-1.5 text-white/50 hover:text-red-400 text-xs font-semibold px-3 py-2 rounded-lg border border-white/10 hover:border-red-500/30 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

function DetailRow({ icon, label, children }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-golden-400 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-white/40 text-[10px] uppercase font-semibold tracking-wider">{label}</p>
        <div className="truncate">{children}</div>
      </div>
    </div>
  );
}

interface ScanReportCardProps {
  app: JobApplication;
  report: ResumeScanReport | undefined;
  scanning: boolean;
  onScan: () => void;
}

function ScanReportCard({ app, report, scanning, onScan }: ScanReportCardProps) {
  const hasResume = !!app.resume_url;
  const score = report?.match_score ?? 0;
  const scoreTone = score >= 75 ? 'emerald' : score >= 50 ? 'golden' : 'rose';
  const toneClasses: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    golden: 'bg-golden-500/15 text-golden-300 border-golden-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  };

  return (
    <div className="bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-golden-500/15 border border-golden-500/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-golden-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">AI Resume Scan</p>
            <p className="text-white/40 text-[11px]">
              {report?.model || 'OpenAI'}
              {report?.created_at && ` -- ${new Date(report.created_at).toLocaleString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report?.status === 'completed' && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${toneClasses[scoreTone]}`}>
              {score}/100
            </span>
          )}
          <button
            onClick={onScan}
            disabled={!hasResume || scanning}
            className="inline-flex items-center gap-1.5 text-golden-300 hover:text-golden-200 text-xs font-semibold border border-golden-500/30 hover:border-golden-500/50 rounded-md px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : report ? 'Rescan' : 'Scan resume'}
          </button>
        </div>
      </div>

      {!hasResume ? (
        <p className="text-white/40 text-xs italic">Upload a resume above to enable AI scanning.</p>
      ) : !report ? (
        <p className="text-white/50 text-xs italic">No scan yet. Click "Scan resume" to analyze this candidate.</p>
      ) : report.status === 'pending' || scanning ? (
        <div className="flex items-center gap-2 text-white/50 text-xs">
          <div className="w-3 h-3 border-2 border-golden-500/30 border-t-golden-400 rounded-full animate-spin" />
          Analyzing...
        </div>
      ) : report.status === 'failed' ? (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{report.error || 'Scan failed. Try again.'}</span>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-white/85 text-sm leading-relaxed">{report.summary}</p>

          <div className="grid sm:grid-cols-2 gap-3">
            {report.years_experience !== null && (
              <div className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
                <p className="text-white/40 text-[10px] uppercase font-semibold tracking-wider">Full-time experience</p>
                <p className="text-white text-sm font-semibold">
                  {report.years_experience} year{report.years_experience === 1 ? '' : 's'}
                </p>
                {report.years_experience === 0 && report.experience_highlights.length > 0 && (
                  <p className="text-white/40 text-[11px] mt-0.5 italic">
                    Early career — see highlights below
                  </p>
                )}
              </div>
            )}
            {report.top_skills.length > 0 && (
              <div className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
                <p className="text-white/40 text-[10px] uppercase font-semibold tracking-wider mb-1">Top skills</p>
                <div className="flex flex-wrap gap-1">
                  {report.top_skills.slice(0, 6).map((s, i) => (
                    <span key={i} className="bg-white/5 border border-white/10 rounded-md px-2 py-0.5 text-[11px] text-white/80">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {report.experience_highlights.length > 0 && (
            <div className="bg-white/[0.03] border border-golden-500/15 rounded-lg px-3 py-2.5">
              <p className="text-white/50 text-[10px] uppercase font-semibold tracking-wider mb-1.5 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-golden-400" /> Experience highlights
              </p>
              <ul className="space-y-1 text-[13px] text-white/85">
                {report.experience_highlights.map((h, i) => (
                  <li key={i} className="leading-snug">- {h}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {report.strengths.length > 0 && (
              <ScanList icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />} label="Strengths" items={report.strengths} tone="emerald" />
            )}
            {report.gaps.length > 0 && (
              <ScanList icon={<AlertTriangle className="w-3.5 h-3.5 text-golden-400" />} label="Gaps" items={report.gaps} tone="golden" />
            )}
          </div>

          {report.red_flags.length > 0 && (
            <ScanList icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-400" />} label="Red flags" items={report.red_flags} tone="rose" />
          )}

          {report.recommended_questions.length > 0 && (
            <div>
              <p className="text-white/50 text-[11px] uppercase font-semibold tracking-wider mb-1.5">Recommended interview questions</p>
              <ol className="space-y-1.5 text-sm text-white/80 list-decimal list-inside">
                {report.recommended_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScanList({ icon, label, items, tone }: { icon: React.ReactNode; label: string; items: string[]; tone: 'emerald' | 'golden' | 'rose' }) {
  const accent: Record<string, string> = {
    emerald: 'border-emerald-500/15',
    golden: 'border-golden-500/15',
    rose: 'border-rose-500/20',
  };
  return (
    <div className={`bg-white/[0.02] border ${accent[tone]} rounded-lg px-3 py-2`}>
      <p className="text-white/50 text-[10px] uppercase font-semibold tracking-wider mb-1.5 flex items-center gap-1.5">{icon} {label}</p>
      <ul className="space-y-1 text-[13px] text-white/80">
        {items.map((s, i) => <li key={i} className="leading-snug">- {s}</li>)}
      </ul>
    </div>
  );
}
```

---

## FILE: `src/pages/jobposter/PythonImportModal.tsx`

```tsx
import { useState, useCallback } from 'react';
import {
  X, Upload, FileCode2, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Users, Database, Eye,
} from 'lucide-react';
import { adminSupabase } from '../../lib/supabase';
import {
  detectCandidateLists, parsePythonLiteral, normalizeCandidate,
  type DetectedVariable, type NormalizedCandidate,
} from '../../lib/python-parser';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type DuplicateMode = 'skip' | 'replace' | 'keep_both';
type ImportStep = 'upload' | 'select' | 'preview' | 'importing' | 'done';

interface ImportResult {
  total: number;
  created: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

export default function PythonImportModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [detected, setDetected] = useState<DetectedVariable[]>([]);
  const [selectedVar, setSelectedVar] = useState<DetectedVariable | null>(null);
  const [candidates, setCandidates] = useState<NormalizedCandidate[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState<number | null>(0);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content) { setError('Could not read file.'); return; }

      const lists = detectCandidateLists(content);
      if (lists.length === 0) {
        setError('No candidate/resume lists detected in this file. The file must contain a Python list of dictionaries with candidate-like fields (name, email, skills, etc.).');
        return;
      }

      setDetected(lists);
      if (lists.length === 1) {
        selectVariable(lists[0]);
      } else {
        setStep('select');
      }
    };
    reader.readAsText(file);
  }, []);

  function selectVariable(v: DetectedVariable) {
    setSelectedVar(v);
    try {
      const parsed = parsePythonLiteral(v.content) as Record<string, unknown>[];
      if (!Array.isArray(parsed)) { setError('Failed to parse the selected list.'); return; }

      const normalized = parsed
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item) => normalizeCandidate(item as Record<string, unknown>));

      setCandidates(normalized);
      setStep('preview');
    } catch (err) {
      setError(`Parse error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  async function performImport() {
    if (candidates.length === 0) return;
    setImporting(true);
    setStep('importing');

    const importResult: ImportResult = { total: candidates.length, created: 0, duplicates: 0, failed: 0, errors: [] };

    try {
      // Create import record
      const { data: importRow, error: importErr } = await adminSupabase()
        .from('python_imports')
        .insert({
          file_name: fileName,
          detected_variable_name: selectedVar?.name || 'unknown',
          total_records: candidates.length,
        } as never)
        .select()
        .maybeSingle();

      if (importErr || !importRow) {
        setError('Failed to create import record.');
        setImporting(false);
        return;
      }

      const importId = (importRow as { id: string }).id;

      // Check for duplicates in bulk
      const emails = candidates.map((c) => c.email).filter(Boolean);
      const phones = candidates.map((c) => c.phone).filter(Boolean);

      let existingEmails = new Set<string>();
      let existingPhones = new Set<string>();

      if (emails.length > 0) {
        const { data: byEmail } = await adminSupabase()
          .from('candidate_profiles')
          .select('email')
          .in('email', emails);
        existingEmails = new Set((byEmail || []).map((r: { email: string }) => r.email.toLowerCase()));
      }

      if (phones.length > 0) {
        const { data: byPhone } = await adminSupabase()
          .from('candidate_profiles')
          .select('phone')
          .in('phone', phones);
        existingPhones = new Set((byPhone || []).map((r: { phone: string }) => r.phone.toLowerCase()));
      }

      // Process in batches of 20
      const batchSize = 20;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const rows: Record<string, unknown>[] = [];

        for (const c of batch) {
          const isDuplicate =
            (c.email && existingEmails.has(c.email.toLowerCase())) ||
            (c.phone && existingPhones.has(c.phone.toLowerCase()));

          if (isDuplicate) {
            if (duplicateMode === 'skip') {
              importResult.duplicates++;
              continue;
            }
            if (duplicateMode === 'replace') {
              // Delete existing first
              if (c.email) {
                await adminSupabase().from('candidate_profiles').delete().eq('email', c.email);
              }
              importResult.duplicates++;
            }
            // keep_both: just insert normally
          }

          rows.push({
            import_id: importId,
            full_name: c.full_name,
            email: c.email,
            phone: c.phone,
            location: c.location,
            linkedin: c.linkedin,
            portfolio_github: c.github,
            current_title: c.current_title,
            years_experience: c.years_experience,
            skills: c.skills,
            education: c.education,
            experience: Array.isArray(c.experience) ? c.experience : [],
            certifications: c.certifications,
            raw_text: c.raw_text.slice(0, 50000),
            source_file_name: c.source_file_name || fileName,
            candidate_id_external: c.candidate_id_external,
            candidate_summary: c.candidate_summary,
            seniority_level: c.seniority_level,
            functional_area: c.functional_area,
            confidence_score: c.confidence_score,
            reasoning: c.reasoning,
            website: c.website,
            github: c.github,
            processing_status: 'created',
            duplicate_status: 'unique',
            confirmed: true,
          });
        }

        if (rows.length > 0) {
          const { error: insertErr, data: inserted } = await adminSupabase()
            .from('candidate_profiles')
            .insert(rows as never)
            .select('id');

          if (insertErr) {
            importResult.failed += rows.length;
            importResult.errors.push(insertErr.message);
          } else {
            importResult.created += (inserted?.length || 0);
          }
        }
      }

      // Update import record with stats
      await adminSupabase()
        .from('python_imports')
        .update({
          successful_records: importResult.created,
          failed_records: importResult.failed,
          duplicate_records: importResult.duplicates,
        } as never)
        .eq('id', importId);

      setResult(importResult);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  const validCandidates = candidates.filter((c) => c.full_name && c.full_name !== 'Unknown');
  const invalidCandidates = candidates.filter((c) => !c.full_name || c.full_name === 'Unknown');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <FileCode2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-gray-900 font-display font-bold text-base">Import Python Data</h2>
              <p className="text-gray-400 text-xs">
                {step === 'upload' && 'Upload a .py file containing candidate records'}
                {step === 'select' && `Found ${detected.length} candidate lists in ${fileName}`}
                {step === 'preview' && `${validCandidates.length} valid candidates ready to import`}
                {step === 'importing' && 'Importing candidates...'}
                {step === 'done' && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700 mb-4">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="text-center py-8">
              <label className="inline-flex flex-col items-center gap-4 cursor-pointer group">
                <div className="w-20 h-20 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-300 group-hover:border-emerald-400 group-hover:bg-emerald-50/50 flex items-center justify-center transition-all">
                  <Upload className="w-8 h-8 text-gray-400 group-hover:text-emerald-500 transition-colors" />
                </div>
                <div>
                  <p className="text-gray-900 font-semibold text-sm">Choose a Python file</p>
                  <p className="text-gray-400 text-xs mt-1">
                    Accepts .py files containing lists of candidate dictionaries
                  </p>
                </div>
                <input type="file" accept=".py" className="hidden" onChange={handleFileUpload} />
              </label>

              <div className="mt-6 text-left max-w-md mx-auto">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Supported formats</p>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <p><code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">CANDIDATES = [{'{'}"name": "...", ...{'}'}]</code></p>
                  <p><code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">resumes = [{'{'}"full_name": "...", ...{'}'}]</code></p>
                  <p><code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">DATA = [{'{'}"email": "...", "skills": [...]{'}'}]</code></p>
                </div>
                <p className="text-[10px] text-gray-400 mt-3">
                  The file is read as text only. No code is executed.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Select variable */}
          {step === 'select' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                Multiple candidate lists detected. Select which one to import:
              </p>
              {detected.map((v, i) => (
                <button
                  key={i}
                  onClick={() => selectVariable(v)}
                  className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/30 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-gray-400 group-hover:text-emerald-500" />
                      <span className="text-gray-900 font-semibold text-sm font-mono">{v.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {v.recordCount} records
                    </span>
                  </div>
                  {v.preview[0] && (
                    <p className="text-xs text-gray-500 truncate">
                      Fields: {Object.keys(v.preview[0]).slice(0, 8).join(', ')}
                      {Object.keys(v.preview[0]).length > 8 && '...'}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-emerald-600">Valid</p>
                  <p className="text-xl font-bold text-emerald-700">{validCandidates.length}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-600">Invalid</p>
                  <p className="text-xl font-bold text-amber-700">{invalidCandidates.length}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">Total</p>
                  <p className="text-xl font-bold text-gray-700">{candidates.length}</p>
                </div>
              </div>

              {/* Duplicate handling */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Duplicate Handling</p>
                <div className="flex items-center gap-3">
                  {(['skip', 'replace', 'keep_both'] as DuplicateMode[]).map((mode) => (
                    <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="dupMode"
                        checked={duplicateMode === mode}
                        onChange={() => setDuplicateMode(mode)}
                        className="w-3.5 h-3.5 text-emerald-500 focus:ring-emerald-300"
                      />
                      <span className="text-xs text-gray-700 font-medium capitalize">
                        {mode === 'keep_both' ? 'Keep Both' : mode === 'skip' ? 'Skip Duplicates' : 'Replace Existing'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Candidate preview cards */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Preview (first 5)</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {validCandidates.slice(0, 5).map((c, i) => (
                    <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setPreviewExpanded(previewExpanded === i ? null : i)}
                        className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 border border-emerald-300/50 flex items-center justify-center flex-shrink-0">
                            <span className="text-emerald-700 font-bold text-[10px]">{c.full_name[0]?.toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-gray-900 font-medium text-xs truncate">{c.full_name}</p>
                            <p className="text-gray-400 text-[10px] truncate">
                              {c.current_title || c.email || 'No title'}
                              {c.seniority_level && ` - ${c.seniority_level}`}
                              {c.functional_area && ` / ${c.functional_area}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.confidence_score && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              c.confidence_score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                              c.confidence_score >= 50 ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {c.confidence_score}%
                            </span>
                          )}
                          {previewExpanded === i ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                        </div>
                      </button>
                      {previewExpanded === i && (
                        <div className="border-t border-gray-100 px-3 py-2.5 bg-gray-50/50 space-y-1.5">
                          {c.email && <p className="text-[11px] text-gray-600"><span className="text-gray-400">Email:</span> {c.email}</p>}
                          {c.location && <p className="text-[11px] text-gray-600"><span className="text-gray-400">Location:</span> {c.location}</p>}
                          {c.years_experience != null && <p className="text-[11px] text-gray-600"><span className="text-gray-400">Years:</span> {c.years_experience}</p>}
                          {c.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.skills.slice(0, 8).map((s, si) => (
                                <span key={si} className="bg-white border border-gray-200 rounded-full px-1.5 py-0.5 text-[9px] text-gray-600">{s}</span>
                              ))}
                              {c.skills.length > 8 && <span className="text-[9px] text-gray-400">+{c.skills.length - 8}</span>}
                            </div>
                          )}
                          {c.reasoning && <p className="text-[10px] text-gray-400 italic mt-1">{c.reasoning}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Field mapping info */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Eye className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-700">
                    <p className="font-medium">Auto-detected fields:</p>
                    <p className="text-blue-600 mt-0.5">
                      {selectedVar?.preview[0] ? Object.keys(selectedVar.preview[0]).join(', ') : 'None'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-900 font-semibold text-sm">Importing candidates...</p>
              <p className="text-gray-400 text-xs mt-1">Processing {candidates.length} records</p>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 'done' && result && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-gray-900 font-semibold text-lg">Import Complete</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 max-w-lg mx-auto">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">Total</p>
                  <p className="text-xl font-bold text-gray-700">{result.total}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-emerald-600">Created</p>
                  <p className="text-xl font-bold text-emerald-700">{result.created}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-600">Duplicates</p>
                  <p className="text-xl font-bold text-amber-700">{result.duplicates}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-red-600">Failed</p>
                  <p className="text-xl font-bold text-red-700">{result.failed}</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="mt-4 text-left max-w-lg mx-auto">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-red-500 mb-1">Errors:</p>
                  {result.errors.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          <button
            onClick={step === 'done' ? () => { onImported(); onClose(); } : onClose}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2"
          >
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>

          {step === 'preview' && (
            <button
              onClick={performImport}
              disabled={importing || validCandidates.length === 0}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              <Users className="w-4 h-4" />
              Import {validCandidates.length} Candidates
            </button>
          )}

          {step === 'done' && (
            <button
              onClick={() => { onImported(); onClose(); }}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              View Candidates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## FILE: `src/pages/jobposter/ResumesChatPanel.tsx`

```tsx
import { useRef, useState } from 'react';
import { Send, Bot, User, Copy, Check, Trash2, Sparkles, Loader as Loader2, Paperclip, ChevronDown } from 'lucide-react';
import { adminSupabase } from '../../lib/supabase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  { label: 'Best matches', prompt: 'Who are the top 5 best-matched candidates? Show scores.' },
  { label: 'By skill', prompt: 'List candidates who know Python or Machine Learning' },
  { label: 'Most experience', prompt: 'Which candidates have the most years of experience?' },
  { label: 'Top skills', prompt: 'What are the top 10 skills across the entire talent pool?' },
  { label: 'Pool summary', prompt: 'Summarize the overall talent pool — key strengths and gaps' },
  { label: 'Outreach draft', prompt: 'Draft a personalized outreach email to the top-ranked candidate' },
  { label: 'Compare top 3', prompt: 'Compare the top 3 candidates side-by-side' },
  { label: 'Find full-stack', prompt: 'Find candidates with both frontend and backend skills' },
];

function renderMessage(content: string) {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    if (/^###?\s/.test(line)) {
      return <p key={i} className="font-bold text-gray-800 text-xs mt-2 mb-0.5">{line.replace(/^#+\s/, '')}</p>;
    }
    if (/^[-*]\s/.test(line)) {
      return (
        <p key={i} className="text-gray-700 text-xs flex gap-1.5">
          <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
          <span>{line.replace(/^[-*]\s/, '')}</span>
        </p>
      );
    }
    if (/^\d+\.\s/.test(line)) {
      return <p key={i} className="text-gray-700 text-xs ml-1">{line}</p>;
    }
    if (line.trim() === '') return <div key={i} className="h-1" />;
    return <p key={i} className="text-gray-700 text-xs">{line}</p>;
  });
}

export default function ResumesChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showPrompts, setShowPrompts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setShowPrompts(false);
    setSending(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/resumes-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();
      if (data?.ok && data.message) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${data?.message || 'Something went wrong'}` }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Network error'}` }]);
    } finally {
      setSending(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  function copyMessage(idx: number) {
    const msg = messages[idx];
    if (!msg) return;
    navigator.clipboard.writeText(msg.content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    e.target.value = '';

    setUploading(true);
    const fileNames = files.map((f) => f.name).join(', ');
    setMessages((prev) => [...prev, { role: 'user', content: `Uploading: ${fileNames}` }]);
    setShowPrompts(false);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Configuration error: Missing Supabase connection details.' }]);
        return;
      }

      const storagePaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const timestamp = Date.now() + i;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `resumes-bank/pending/${timestamp}-${safeName}`;

        const { error } = await adminSupabase().storage.from('resumes').upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });

        if (error) {
          setMessages((prev) => [...prev, { role: 'assistant', content: `Storage error for ${file.name}: ${error.message}` }]);
          setUploading(false);
          return;
        }
        storagePaths.push(path);
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: `Files stored. Processing ${storagePaths.length} resume(s)...` }]);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-resumes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storage_paths: storagePaths }),
      });

      if (!res.ok) {
        const text = await res.text();
        setMessages((prev) => [...prev, { role: 'assistant', content: `Server error (${res.status}): ${text.substring(0, 300)}` }]);
        return;
      }

      const data = await res.json();
      if (data?.ok) {
        const names = data.resumes?.map((r: { name: string }) => r.name).join(', ') || `${data.count} file(s)`;
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `Processed ${data.count} file(s) successfully.\n\nAdded: ${names}\n\nYou can now ask me questions about these resumes.`,
        }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Processing failed: ${data?.error || 'Unknown error'}` }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Network error'}` }]);
    } finally {
      setUploading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="w-6 h-6 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <div>
          <p className="text-gray-900 font-bold text-sm leading-tight">Recruiter Copilot</p>
          <p className="text-[10px] text-gray-400 leading-tight">Powered by Gemini</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setShowPrompts(true); }}
            title="Clear conversation"
            className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Quick prompts toggle when chat is active */}
      {messages.length > 0 && (
        <button
          onClick={() => setShowPrompts(!showPrompts)}
          className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 text-[10px] text-gray-400 hover:text-amber-600 font-semibold transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Quick prompts
          <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showPrompts ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Quick prompts */}
      {showPrompts && (
        <div className="px-2.5 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => { setInput(p.prompt); textareaRef.current?.focus(); }}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 transition-all bg-white"
            >
              <Sparkles className="w-2.5 h-2.5" />
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 px-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-3">
              <Bot className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-gray-700 text-sm font-semibold mb-1">Ask me anything</p>
            <p className="text-gray-400 text-[11px] max-w-[210px] leading-relaxed">
              I know every resume in your database. Paste a job description to find the best matches instantly.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3 h-3 text-amber-600" />
              </div>
            )}
            <div className={`max-w-[85%] relative group ${
              msg.role === 'user'
                ? 'bg-amber-50 border border-amber-200 rounded-xl rounded-tr-sm'
                : 'bg-white border border-gray-200 rounded-xl rounded-tl-sm shadow-sm'
            } px-3 py-2`}>
              {msg.role === 'assistant' ? (
                <div className="space-y-0.5">
                  {renderMessage(msg.content)}
                </div>
              ) : (
                <p className="text-gray-700 text-xs whitespace-pre-wrap">{msg.content}</p>
              )}
              <button
                onClick={() => copyMessage(idx)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-amber-500 p-0.5 rounded"
              >
                {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3 h-3 text-gray-500" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3 h-3 text-amber-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-2.5 bg-white">
        {uploading && (
          <div className="flex items-center gap-2 text-xs text-amber-600 mb-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Uploading and processing files...</span>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about candidates or paste a JD..."
              rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 pr-9 text-gray-900 text-xs placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 resize-none transition-colors"
              style={{ minHeight: '40px', maxHeight: '100px' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload resume or JD"
              className="absolute right-2 bottom-2 text-gray-300 hover:text-amber-500 disabled:opacity-40 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".zip,.pdf,.doc,.docx,.txt,.rtf,.pptx,.xlsx,.csv"
          multiple
          onChange={handleFileUpload}
        />
      </div>
    </div>
  );
}
```

---

## FILE: `src/pages/jobposter/ResumesSection.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import { Upload, Loader as Loader2, Search, Trash2, FolderArchive, ExternalLink, Pencil, X, Check, User, Mail, Phone, Briefcase, GraduationCap, FileArchive, Users, CircleCheck as CheckCircle2, Circle as XCircle, Copy, MapPin, Link2, Award, TrendingUp, Building2, Filter, Plus, UserPlus, FileCode2, SquareCheck as CheckSquare, Square } from 'lucide-react';
import { adminSupabase } from '../../lib/supabase';
import { getAdminToken } from '../../lib/jobposter-auth';
import { unzipSync } from 'fflate';
import PythonImportModal from './PythonImportModal';

// --- Types ---

interface CandidateProfile {
  id: string;
  batch_id: string;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  current_title: string;
  years_experience: number | null;
  linkedin: string;
  portfolio_github: string;
  resume_summary: string;
  skills: string[];
  soft_skills: string[];
  education: string;
  experience: { title: string; company: string; duration: string; description: string }[];
  employment_timeline: { s: string; e: string; c: boolean; t: string; co: string }[];
  certifications: string[];
  industries: string[];
  employers: string[];
  links: string[];
  seniority_level: string;
  functional_area: string;
  candidate_summary: string;
  career_narrative: string;
  leadership_indicators: { h?: boolean; n?: number; has_leadership_signals?: boolean; signal_count?: number };
  achievements: string[];
  security_clearances: string[];
  work_authorization: string;
  source_zip_name: string;
  source_file_name: string;
  resume_file_url: string;
  file_hash: string;
  duplicate_status: string;
  processing_status: string;
  failure_reason: string;
  confirmed: boolean;
  created_at: string;
  ats_score: number | null;
  ats_summary: string;
  strengths: string[];
  gaps: string[];
  raw_text: string;
}

interface UploadResult {
  file_name: string;
  status: 'created' | 'duplicate_skipped' | 'failed';
  reason?: string;
  candidate_id?: string;
  full_name?: string;
  email?: string;
}

interface UploadSummary {
  total_files: number;
  supported_resumes: number;
  profiles_created: number;
  duplicates_skipped: number;
  failed: number;
}

interface ATSApplicant {
  id: string;
  name: string;
  email: string;
  phone: string;
  resume_name: string;
  resume_url: string;
  job_title: string;
  submitted_at: string;
  source: string;
}

// --- Main Component ---

export default function ResumesSection() {
  const [profiles, setProfiles] = useState<CandidateProfile[]>([]);
  const [atsApplicants, setAtsApplicants] = useState<ATSApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'bank' | 'ats' | 'upload'>('bank');
  const [seniorityFilter, setSeniorityFilter] = useState<string>('');
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPythonImport, setShowPythonImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [skillFilter, setSkillFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [yoeMinFilter, setYoeMinFilter] = useState<string>('');
  const [yoeMaxFilter, setYoeMaxFilter] = useState<string>('');
  const [hasLinkedinFilter, setHasLinkedinFilter] = useState(false);
  const [hasGithubFilter, setHasGithubFilter] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('');
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isZip, setIsZip] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadProfiles() {
    setLoading(true);
    try {
      const { data } = await adminSupabase()
        .from('candidate_profiles')
        .select('*')
        .in('processing_status', ['created', 'complete', 'completed'])
        .order('created_at', { ascending: false });
      setProfiles((data as CandidateProfile[]) || []);
    } catch { setProfiles([]); }

    try {
      const { data: apps } = await adminSupabase()
        .from('job_applications')
        .select('id, name, email, phone, resume_name, resume_url, submitted_at, source, job_id, jobs(title)')
        .order('submitted_at', { ascending: false })
        .limit(200);
      if (apps) {
        setAtsApplicants(apps.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          name: a.name as string || 'Unknown',
          email: a.email as string || '',
          phone: a.phone as string || '',
          resume_name: a.resume_name as string || '',
          resume_url: a.resume_url as string || '',
          job_title: (a.jobs as Record<string, string>)?.title || 'General',
          submitted_at: a.submitted_at as string || '',
          source: a.source as string || 'form',
        })));
      }
    } catch { /* ignore */ }

    setLoading(false);
  }

  useEffect(() => { loadProfiles(); }, []);

  // --- Upload Handler ---

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const selectedFiles = Array.from(fileList);
    e.target.value = '';

    setUploading(true);
    setUploadResults(null);
    setUploadSummary(null);
    setBatchId(null);
    setViewMode('upload');

    try {
      let filesToUpload: File[] = [];
      let zipFileName = 'upload.zip';

      if (isZip) {
        setUploadPhase('Extracting files from ZIP...');
        for (const file of selectedFiles) {
          const ext = (file.name.split('.').pop() || '').toLowerCase();
          if (ext === 'zip') {
            zipFileName = file.name;
            const buffer = new Uint8Array(await file.arrayBuffer());
            const extracted = extractZipInBrowser(buffer);
            filesToUpload.push(...extracted);
          } else {
            filesToUpload.push(file);
          }
        }

        if (filesToUpload.length === 0) {
          setUploadPhase('');
          setUploadResults([]);
          setUploadSummary({ total_files: 0, supported_resumes: 0, profiles_created: 0, duplicates_skipped: 0, failed: 0 });
          setUploading(false);
          return;
        }

        setUploadPhase(`Extracted ${filesToUpload.length} resume(s). Uploading to storage...`);
      } else {
        filesToUpload = selectedFiles;
        zipFileName = 'individual-upload';
        setUploadPhase(`Uploading ${filesToUpload.length} file(s)...`);
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const storagePaths: string[] = [];

      // Upload in parallel batches of 6
      const UPLOAD_BATCH = 6;
      for (let i = 0; i < filesToUpload.length; i += UPLOAD_BATCH) {
        const batch = filesToUpload.slice(i, i + UPLOAD_BATCH);
        setUploadPhase(`Uploading files ${i + 1}-${Math.min(i + UPLOAD_BATCH, filesToUpload.length)} of ${filesToUpload.length}...`);
        const results = await Promise.allSettled(
          batch.map(async (file, j) => {
            const timestamp = Date.now() + i + j;
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `resumes-bank/pending/${timestamp}-${safeName}`;
            const { error } = await adminSupabase().storage.from('resumes').upload(path, file, {
              cacheControl: '3600', upsert: false, contentType: file.type || undefined,
            });
            return error ? null : path;
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) storagePaths.push(r.value);
        }
      }

      if (storagePaths.length === 0) {
        setUploadPhase('All file uploads failed.');
        setUploading(false);
        return;
      }

      setUploadPhase(`Processing ${storagePaths.length} resume(s) with AI parsing...`);

      const res = await fetch(`${supabaseUrl}/functions/v1/upload-resumes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storage_paths: storagePaths, zip_file_name: zipFileName }),
      });

      const data = await res.json();

      if (data?.ok) {
        setUploadResults(data.results || []);
        setUploadSummary(data.summary || null);
        setBatchId(data.batch_id || null);
        setUploadPhase('');
        loadProfiles();
      } else {
        setUploadPhase(`Error: ${data?.error || 'Processing failed'}`);
        setUploadResults([]);
      }
    } catch (err) {
      setUploadPhase(`Error: ${err instanceof Error ? err.message : 'Upload failed'}`);
    } finally {
      setUploading(false);
    }
  }

  function extractZipInBrowser(buffer: Uint8Array): File[] {
    const validExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'md'];
    const files: File[] = [];

    try {
      const unzipped = unzipSync(buffer);
      for (const [path, data] of Object.entries(unzipped)) {
        if (path.endsWith('/')) continue;
        // Skip OS-generated junk
        if (path.includes('__MACOSX')) continue;
        if (path.includes('.DS_Store')) continue;
        if (path.includes('Thumbs.db')) continue;
        if (path.includes('desktop.ini')) continue;
        if (path.includes('.Spotlight-V100')) continue;
        if (path.includes('.Trashes')) continue;
        if (path.includes('.fseventsd')) continue;
        const baseName = path.split('/').pop() || '';
        if (!baseName || baseName.startsWith('.') || baseName.startsWith('~') || baseName.startsWith('$')) continue;
        if (data.length === 0) continue;
        // Skip very small files (likely not resumes)
        if (data.length < 100) continue;
        const ext = (baseName.split('.').pop() || '').toLowerCase();
        if (!validExts.includes(ext)) continue;
        // Skip known non-resume filenames
        const lowerName = baseName.toLowerCase();
        if (lowerName === 'readme.txt' || lowerName === 'readme.md') continue;
        if (lowerName.includes('instructions') || lowerName.includes('template')) continue;

        const mimeMap: Record<string, string> = {
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          txt: 'text/plain',
          rtf: 'application/rtf',
          odt: 'application/vnd.oasis.opendocument.text',
          md: 'text/markdown',
        };
        const blob = new Blob([data], { type: mimeMap[ext] || 'application/octet-stream' });
        files.push(new File([blob], baseName, { type: blob.type }));
      }
    } catch (err) {
      console.error('Browser ZIP extraction error:', err);
    }

    return files;
  }

  // --- Delete & Update (via edge function for reliable service-role access) ---

  async function callAdminCandidates(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const token = getAdminToken();
    if (!token) return { ok: false, error: 'Not authenticated' };
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const res = await fetch(`${url}/functions/v1/admin-candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ admin_token: token, ...payload }),
    });
    return res.json();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this candidate profile?')) return;
    const result = await callAdminCandidates({ action: 'delete', id });
    if (!result.ok) {
      alert('Failed to delete: ' + (result.error || 'Unknown error'));
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleUpdate(id: string, updates: Partial<CandidateProfile>): Promise<boolean> {
    const result = await callAdminCandidates({ action: 'update', id, data: updates });
    if (!result.ok) return false;
    setProfiles((prev) => prev.map((p) => p.id === id ? { ...p, ...updates } : p));
    return true;
  }

  async function handleConfirm(id: string) {
    const result = await callAdminCandidates({ action: 'update', id, data: { confirmed: true } });
    if (result.ok) {
      setProfiles((prev) => prev.map((p) => p.id === id ? { ...p, confirmed: true } : p));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const allFilteredIds = filtered.map((p) => p.id);
    setSelectedIds(new Set(allFilteredIds));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Permanently delete ${selectedIds.size} candidate${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const result = await callAdminCandidates({ action: 'bulk_delete', ids });
    setBulkDeleting(false);
    if (!result.ok) {
      alert('Bulk delete failed: ' + (result.error || 'Unknown error'));
      return;
    }
    setProfiles((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  }

  // --- Filtering ---

  const seniorityLevels = [...new Set(profiles.map((p) => p.seniority_level).filter(Boolean))].sort();
  const functionalAreas = [...new Set(profiles.map((p) => p.functional_area).filter(Boolean))].sort();

  const activeFilterCount = [seniorityFilter, areaFilter, skillFilter, locationFilter, yoeMinFilter, yoeMaxFilter, hasLinkedinFilter, hasGithubFilter].filter(Boolean).length;

  const filtered = profiles.filter((p) => {
    if (seniorityFilter && p.seniority_level !== seniorityFilter) return false;
    if (areaFilter && p.functional_area !== areaFilter) return false;
    if (skillFilter && !p.skills?.some((s) => s.toLowerCase().includes(skillFilter.toLowerCase()))) return false;
    if (locationFilter && !p.location?.toLowerCase().includes(locationFilter.toLowerCase())) return false;
    if (yoeMinFilter && (p.years_experience == null || p.years_experience < parseFloat(yoeMinFilter))) return false;
    if (yoeMaxFilter && (p.years_experience == null || p.years_experience > parseFloat(yoeMaxFilter))) return false;
    if (hasLinkedinFilter && !p.linkedin) return false;
    if (hasGithubFilter && !p.portfolio_github) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.current_title?.toLowerCase().includes(q) ||
      p.functional_area?.toLowerCase().includes(q) ||
      p.seniority_level?.toLowerCase().includes(q) ||
      p.location?.toLowerCase().includes(q) ||
      p.skills?.some((s) => s.toLowerCase().includes(q)) ||
      p.industries?.some((s) => s.toLowerCase().includes(q)) ||
      p.candidate_summary?.toLowerCase().includes(q) ||
      p.raw_text?.toLowerCase().includes(q)
    );
  });

  const filteredAts = searchQuery.trim()
    ? atsApplicants.filter((a) => {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q) || a.job_title?.toLowerCase().includes(q);
      })
    : atsApplicants;

  // --- Render ---

  return (
    <div>
      {/* Upload bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-golden-500 hover:bg-golden-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Processing...' : 'Upload Resumes'}
        </button>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:border-golden-400 hover:text-golden-700 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Create Profile
        </button>

        <button
          onClick={() => setShowPythonImport(true)}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:border-emerald-400 hover:text-emerald-700 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <FileCode2 className="w-4 h-4" />
          Import Python Data
        </button>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            className={`relative w-9 h-5 rounded-full transition-colors ${isZip ? 'bg-golden-500' : 'bg-gray-200'}`}
            onClick={() => setIsZip(!isZip)}
          >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isZip ? 'translate-x-4' : ''}`} />
          </div>
          <span className="flex items-center gap-1 text-xs text-gray-600 font-medium">
            <FileArchive className="w-3.5 h-3.5" />
            ZIP file
          </span>
        </label>

        <span className="text-gray-400 text-xs">
          {isZip ? 'Extracts and processes each resume from ZIP' : 'PDF, DOC, DOCX, TXT, RTF'}
        </span>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={isZip ? '.zip' : '.pdf,.doc,.docx,.txt,.rtf,.pptx,.xlsx,.csv'}
          multiple={!isZip}
          onChange={handleUpload}
        />
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit">
        <button
          onClick={() => setViewMode('bank')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            viewMode === 'bank' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderArchive className="w-3.5 h-3.5" />
          Candidates ({profiles.length})
        </button>
        <button
          onClick={() => setViewMode('ats')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            viewMode === 'ats' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          ATS ({atsApplicants.length})
        </button>
        {(uploadResults || uploading) && (
          <button
            onClick={() => setViewMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === 'upload' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            Upload Results
          </button>
        )}
      </div>

      {/* Upload progress / results view */}
      {viewMode === 'upload' && (
        <UploadResultsView
          uploading={uploading}
          phase={uploadPhase}
          results={uploadResults}
          summary={uploadSummary}
          batchId={batchId}
          onViewProfiles={() => { setViewMode('bank'); }}
        />
      )}

      {/* Bank view */}
      {viewMode === 'bank' && (
        <>
          {/* Search + Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, title, skill, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-gray-900 text-sm placeholder:text-gray-400 w-full focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                showFilters || activeFilterCount > 0
                  ? 'bg-golden-50 border-golden-300 text-golden-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-golden-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-golden-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter dropdowns */}
          {showFilters && (
            <div className="flex items-center gap-3 mb-4 flex-wrap p-3 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Seniority</label>
                <select
                  value={seniorityFilter}
                  onChange={(e) => setSeniorityFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400"
                >
                  <option value="">All Levels</option>
                  {seniorityLevels.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Function</label>
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400"
                >
                  <option value="">All Areas</option>
                  {functionalAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Skill</label>
                <input
                  type="text"
                  value={skillFilter}
                  onChange={(e) => setSkillFilter(e.target.value)}
                  placeholder="e.g. Python"
                  className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400 w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Location</label>
                <input
                  type="text"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="e.g. NYC"
                  className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400 w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">YOE</label>
                <input
                  type="number"
                  value={yoeMinFilter}
                  onChange={(e) => setYoeMinFilter(e.target.value)}
                  placeholder="Min"
                  className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400 w-14"
                />
                <span className="text-gray-400 text-xs">-</span>
                <input
                  type="number"
                  value={yoeMaxFilter}
                  onChange={(e) => setYoeMaxFilter(e.target.value)}
                  placeholder="Max"
                  className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400 w-14"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasLinkedinFilter} onChange={(e) => setHasLinkedinFilter(e.target.checked)} className="w-3.5 h-3.5 rounded text-golden-500 focus:ring-golden-300" />
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">LinkedIn</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasGithubFilter} onChange={(e) => setHasGithubFilter(e.target.checked)} className="w-3.5 h-3.5 rounded text-golden-500 focus:ring-golden-300" />
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">GitHub</span>
              </label>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setSeniorityFilter(''); setAreaFilter(''); setSkillFilter(''); setLocationFilter(''); setYoeMinFilter(''); setYoeMaxFilter(''); setHasLinkedinFilter(false); setHasGithubFilter(false); }}
                  className="text-[11px] text-red-500 hover:text-red-600 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-400 text-xs">
              {filtered.length} candidate{filtered.length !== 1 ? 's' : ''}
              {(activeFilterCount > 0 || searchQuery) && ` (filtered from ${profiles.length})`}
            </p>
            {filtered.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={selectedIds.size === filtered.length ? clearSelection : selectAll}
                  className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-golden-600 font-medium transition-colors"
                >
                  {selectedIds.size === filtered.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select'}
                </button>
              </div>
            )}
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-sm font-semibold text-red-700">{selectedIds.size} selected</span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
              </button>
              <button onClick={clearSelection} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                Cancel
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-golden-500 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 border border-gray-100 rounded-2xl bg-gray-50">
              <FolderArchive className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium text-sm">{searchQuery || activeFilterCount > 0 ? 'No matches found' : 'No candidates yet'}</p>
              <p className="text-gray-400 text-xs mt-1">{searchQuery ? 'Try a different search or filter.' : 'Upload a ZIP of resumes or import Python data to get started.'}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {filtered.map((p) => (
                <CandidateCard
                  key={p.id}
                  profile={p}
                  expanded={expanded === p.id}
                  onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                  onDelete={() => handleDelete(p.id)}
                  onUpdate={(updates) => handleUpdate(p.id, updates)}
                  onConfirm={() => handleConfirm(p.id)}
                  selected={selectedIds.has(p.id)}
                  onSelect={() => toggleSelect(p.id)}
                  selectionMode={selectedIds.size > 0}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ATS view */}
      {viewMode === 'ats' && (
        <>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-4 max-w-sm">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search applicants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-gray-900 text-sm placeholder:text-gray-400 w-full focus:outline-none"
            />
          </div>

          <p className="text-gray-400 text-xs mb-3">{filteredAts.length} applicant{filteredAts.length !== 1 ? 's' : ''} from ATS</p>

          {filteredAts.length === 0 ? (
            <div className="text-center py-12 border border-gray-100 rounded-2xl bg-gray-50">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium text-sm">{searchQuery ? 'No matches' : 'No applicants yet'}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAts.map((a) => (
                <ATSCard key={a.id} applicant={a} expanded={expanded === a.id} onToggle={() => setExpanded(expanded === a.id ? null : a.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateProfileModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(profile) => {
            setProfiles((prev) => [profile, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}

      {showPythonImport && (
        <PythonImportModal
          onClose={() => setShowPythonImport(false)}
          onImported={() => { loadProfiles(); }}
        />
      )}
    </div>
  );
}

// --- Create Profile Modal ---

function CreateProfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: CandidateProfile) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    location: '',
    current_title: '',
    years_experience: '',
    linkedin: '',
    portfolio_github: '',
    seniority_level: '',
    functional_area: '',
    education: '',
    skills: '',
    certifications: '',
    candidate_summary: '',
    work_authorization: '',
  });

  const seniorities = ['Entry/Junior', 'Mid-level', 'Senior', 'Lead', 'Principal', 'Director', 'Executive'];
  const areas = [
    'Software Engineering', 'DevOps / Cloud / SRE', 'Data & Analytics', 'Product Management',
    'Design / UX', 'Sales & Business Development', 'Marketing', 'Finance & Accounting',
    'Operations & Admin', 'HR & Recruiting', 'Cybersecurity', 'IT Support & Administration',
    'Research & Science', 'Legal & Compliance', 'Healthcare', 'Other',
  ];

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const skillsArr = form.skills.split(',').map((s) => s.trim()).filter(Boolean);
      const certsArr = form.certifications.split(',').map((s) => s.trim()).filter(Boolean);
      const yoe = form.years_experience ? parseFloat(form.years_experience) : null;

      const row = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        current_title: form.current_title.trim(),
        years_experience: isNaN(yoe as number) ? null : yoe,
        linkedin: form.linkedin.trim(),
        portfolio_github: form.portfolio_github.trim(),
        seniority_level: form.seniority_level,
        functional_area: form.functional_area,
        education: form.education.trim(),
        skills: skillsArr,
        certifications: certsArr,
        candidate_summary: form.candidate_summary.trim(),
        work_authorization: form.work_authorization.trim(),
        processing_status: 'created',
        duplicate_status: 'unique',
        confirmed: true,
      };

      const { data, error: dbErr } = await adminSupabase()
        .from('candidate_profiles')
        .insert(row as never)
        .select()
        .maybeSingle();

      if (dbErr || !data) { setError(dbErr?.message || 'Failed to create profile.'); setSaving(false); return; }
      onCreated(data as CandidateProfile);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-golden-50 border border-golden-200 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-golden-600" />
            </div>
            <div>
              <h2 className="text-gray-900 font-display font-bold text-base">Create Profile</h2>
              <p className="text-gray-400 text-xs">Add a candidate manually to the database</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Basic info */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-3">Basic Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FormField label="Full Name *" icon={<User className="w-3.5 h-3.5" />} value={form.full_name} onChange={(v) => set('full_name', v)} placeholder="Jane Smith" />
              </div>
              <FormField label="Job Title" icon={<Briefcase className="w-3.5 h-3.5" />} value={form.current_title} onChange={(v) => set('current_title', v)} placeholder="Software Engineer" />
              <FormField label="Years of Experience" icon={<TrendingUp className="w-3.5 h-3.5" />} value={form.years_experience} onChange={(v) => set('years_experience', v)} placeholder="4.5" type="number" />
              <FormField label="Email" icon={<Mail className="w-3.5 h-3.5" />} value={form.email} onChange={(v) => set('email', v)} placeholder="jane@example.com" />
              <FormField label="Phone" icon={<Phone className="w-3.5 h-3.5" />} value={form.phone} onChange={(v) => set('phone', v)} placeholder="555-123-4567" />
              <FormField label="Location" icon={<MapPin className="w-3.5 h-3.5" />} value={form.location} onChange={(v) => set('location', v)} placeholder="New York, NY" />
              <FormField label="LinkedIn" icon={<Link2 className="w-3.5 h-3.5" />} value={form.linkedin} onChange={(v) => set('linkedin', v)} placeholder="linkedin.com/in/janesmith" />
            </div>
          </div>

          {/* Classification */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-3">Classification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Seniority Level</label>
                <select
                  value={form.seniority_level}
                  onChange={(e) => set('seniority_level', e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-golden-400 focus:ring-1 focus:ring-golden-200"
                >
                  <option value="">Select level...</option>
                  {seniorities.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Functional Area</label>
                <select
                  value={form.functional_area}
                  onChange={(e) => set('functional_area', e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-golden-400 focus:ring-1 focus:ring-golden-200"
                >
                  <option value="">Select area...</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <FormField label="Work Authorization" icon={<Award className="w-3.5 h-3.5" />} value={form.work_authorization} onChange={(v) => set('work_authorization', v)} placeholder="US Citizen, OPT, H1-B..." />
            </div>
          </div>

          {/* Skills & Education */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-3">Skills & Education</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Technical Skills <span className="text-gray-400 normal-case font-normal">(comma separated)</span></label>
                <input
                  value={form.skills}
                  onChange={(e) => set('skills', e.target.value)}
                  placeholder="Python, AWS, Docker, React, SQL..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-golden-400 focus:ring-1 focus:ring-golden-200"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Certifications <span className="text-gray-400 normal-case font-normal">(comma separated)</span></label>
                <input
                  value={form.certifications}
                  onChange={(e) => set('certifications', e.target.value)}
                  placeholder="AWS Certified, PMP, CPA..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-golden-400 focus:ring-1 focus:ring-golden-200"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Education</label>
                <input
                  value={form.education}
                  onChange={(e) => set('education', e.target.value)}
                  placeholder="BS Computer Science, MIT, 2020"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-golden-400 focus:ring-1 focus:ring-golden-200"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-3">Summary</p>
            <textarea
              value={form.candidate_summary}
              onChange={(e) => set('candidate_summary', e.target.value)}
              rows={4}
              placeholder="Brief description of the candidate's background, strengths, and career goals..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-golden-400 focus:ring-1 focus:ring-golden-200 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-golden-500 hover:bg-golden-600 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Creating...' : 'Create Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label, icon, value, onChange, placeholder, type = 'text',
}: {
  label: string; icon: React.ReactNode; value: string;
  onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{label}</label>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-golden-400 focus-within:ring-1 focus-within:ring-golden-200 transition-all">
        <span className="text-gray-400 flex-shrink-0">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-transparent text-sm text-gray-900 placeholder:text-gray-400 w-full focus:outline-none"
        />
      </div>
    </div>
  );
}

function UploadResultsView({
  uploading, phase, results, summary, onViewProfiles,
}: {
  uploading: boolean;
  phase: string;
  results: UploadResult[] | null;
  summary: UploadSummary | null;
  batchId: string | null;
  onViewProfiles: () => void;
}) {
  if (uploading) {
    return (
      <div className="border border-gray-200 rounded-2xl bg-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <Loader2 className="w-5 h-5 text-golden-500 animate-spin" />
          <h3 className="text-gray-900 font-semibold text-sm">Processing Upload</h3>
        </div>
        <p className="text-gray-600 text-sm">{phase || 'Starting...'}</p>
        <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-golden-500 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  if (!results) return null;

  const created = results.filter((r) => r.status === 'created');

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Total Files" value={summary.total_files} icon={<FileArchive className="w-4 h-4" />} color="gray" />
          <SummaryCard label="Processed" value={summary.supported_resumes} icon={<Check className="w-4 h-4" />} color="blue" />
          <SummaryCard label="Created" value={summary.profiles_created} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
          <SummaryCard label="Duplicates" value={summary.duplicates_skipped} icon={<Copy className="w-4 h-4" />} color="amber" />
          <SummaryCard label="Failed" value={summary.failed} icon={<XCircle className="w-4 h-4" />} color="red" />
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-gray-900 font-semibold text-sm">File Results</h3>
          {created.length > 0 && (
            <button onClick={onViewProfiles} className="text-xs text-golden-600 hover:text-golden-700 font-semibold">
              View {created.length} new profile{created.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
          {results.map((r, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-shrink-0">
                {r.status === 'created' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                {r.status === 'duplicate_skipped' && <Copy className="w-4 h-4 text-amber-500" />}
                {r.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 text-xs font-medium truncate">{r.file_name}</p>
                {r.full_name && <p className="text-gray-500 text-[11px]">{r.full_name}{r.email ? ` - ${r.email}` : ''}</p>}
                {r.reason && <p className="text-gray-400 text-[10px]">{r.reason}</p>}
              </div>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                r.status === 'created' ? 'bg-emerald-50 text-emerald-700' :
                r.status === 'duplicate_skipped' ? 'bg-amber-50 text-amber-700' :
                'bg-red-50 text-red-700'
              }`}>
                {r.status === 'created' ? 'Created' : r.status === 'duplicate_skipped' ? 'Duplicate' : 'Failed'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {phase && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{phase}</div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`border rounded-xl p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-70">{icon}<span className="text-[10px] font-semibold uppercase">{label}</span></div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

// --- Candidate Card (Enriched) ---

function CandidateCard({
  profile, expanded, onToggle, onDelete, onUpdate, onConfirm, selected, onSelect, selectionMode,
}: {
  profile: CandidateProfile;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<CandidateProfile>) => Promise<boolean>;
  onConfirm: () => void;
  selected: boolean;
  onSelect: () => void;
  selectionMode: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    education: profile.education,
    current_title: profile.current_title,
    skills: profile.skills?.join(', ') || '',
  });

  const hasLeadership = profile.leadership_indicators?.h || profile.leadership_indicators?.has_leadership_signals;

  function startEdit() {
    setForm({
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      education: profile.education,
      current_title: profile.current_title || '',
      skills: profile.skills?.join(', ') || '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    const updates: Partial<CandidateProfile> = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      location: form.location.trim(),
      education: form.education.trim(),
      current_title: form.current_title.trim(),
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    };
    const ok = await onUpdate(updates);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-white border border-golden-300 rounded-2xl overflow-hidden shadow-md ring-1 ring-golden-100">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Edit Profile</h4>
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid gap-2">
            <EditField icon={<User className="w-3.5 h-3.5" />} value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} placeholder="Full name" />
            <EditField icon={<Briefcase className="w-3.5 h-3.5" />} value={form.current_title} onChange={(v) => setForm({ ...form, current_title: v })} placeholder="Title" />
            <EditField icon={<Mail className="w-3.5 h-3.5" />} value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="Email" />
            <EditField icon={<Phone className="w-3.5 h-3.5" />} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="Phone" />
            <EditField icon={<MapPin className="w-3.5 h-3.5" />} value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="Location" />
            <EditField icon={<GraduationCap className="w-3.5 h-3.5" />} value={form.education} onChange={(v) => setForm({ ...form, education: v })} placeholder="Education" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1 block">Skills (comma separated)</label>
            <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400" />
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 bg-golden-500 hover:bg-golden-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const seniorityColor = (level: string) => {
    if (level.includes('Senior') || level.includes('Lead')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (level.includes('Mid')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (level.includes('Entry') || level.includes('Junior')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-gray-50 text-gray-600 border-gray-200';
  };

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md ${selected ? 'border-red-300 ring-2 ring-red-100' : expanded ? 'border-golden-300 shadow-md ring-1 ring-golden-100' : 'border-gray-200 shadow-sm'}`}>
      <div className="flex items-start p-4 gap-3">
        {/* Selection checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            selected ? 'bg-red-500 border-red-500 text-white' : selectionMode ? 'border-gray-300 hover:border-golden-400' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          {selected && <Check className="w-3 h-3" />}
        </button>

        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-golden-100 to-golden-200 border border-golden-300/50 flex items-center justify-center flex-shrink-0">
                <span className="text-golden-700 font-bold text-xs">{(profile.full_name || '?')[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-gray-900 font-semibold text-sm truncate leading-tight">{profile.full_name}</p>
                {profile.current_title && (
                  <p className="text-gray-500 text-[11px] truncate">{profile.current_title}</p>
                )}
                {!profile.current_title && profile.email && (
                  <p className="text-gray-400 text-[11px] truncate">{profile.email}</p>
                )}
              </div>
            </div>
            {profile.years_experience != null && profile.years_experience > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 flex-shrink-0 whitespace-nowrap">
                {profile.years_experience}y
              </span>
            )}
          </div>

        {/* Tags row: seniority, functional area, location */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {profile.seniority_level && (
            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-semibold border ${seniorityColor(profile.seniority_level)}`}>
              <TrendingUp className="w-2.5 h-2.5" />{profile.seniority_level}
            </span>
          )}
          {profile.functional_area && (
            <span className="inline-flex items-center gap-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-md px-1.5 py-0.5 text-[9px] font-semibold truncate max-w-[120px]">
              <Building2 className="w-2.5 h-2.5 flex-shrink-0" />{profile.functional_area}
            </span>
          )}
          {profile.location && (
            <span className="inline-flex items-center gap-0.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-md px-1.5 py-0.5 text-[9px] font-medium truncate max-w-[100px]">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{profile.location}
            </span>
          )}
          {hasLeadership && (
            <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-md px-1.5 py-0.5 text-[9px] font-semibold">
              <Award className="w-2.5 h-2.5" />Leader
            </span>
          )}
        </div>

        {/* Skills chips */}
        {profile.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {profile.skills.slice(0, 5).map((s, i) => (
              <span key={i} className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 text-[10px] text-gray-600 font-medium">{s}</span>
            ))}
            {profile.skills.length > 5 && <span className="text-[10px] text-gray-400 self-center">+{profile.skills.length - 5}</span>}
          </div>
        )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-3">
          {/* Summary */}
          {profile.candidate_summary && (
            <p className="text-gray-600 text-xs leading-relaxed">{profile.candidate_summary}</p>
          )}
          {!profile.candidate_summary && profile.resume_summary && (
            <p className="text-gray-600 text-xs leading-relaxed">{profile.resume_summary}</p>
          )}

          {/* Contact details */}
          <div className="grid grid-cols-1 gap-1.5">
            {profile.email && (
              <div className="flex items-center gap-2 text-xs"><Mail className="w-3 h-3 text-gray-400" /><span className="text-gray-700">{profile.email}</span></div>
            )}
            {profile.phone && (
              <div className="flex items-center gap-2 text-xs"><Phone className="w-3 h-3 text-gray-400" /><span className="text-gray-700">{profile.phone}</span></div>
            )}
            {profile.location && (
              <div className="flex items-center gap-2 text-xs"><MapPin className="w-3 h-3 text-gray-400" /><span className="text-gray-700">{profile.location}</span></div>
            )}
            {profile.linkedin && (
              <div className="flex items-center gap-2 text-xs"><Link2 className="w-3 h-3 text-gray-400" /><a href={profile.linkedin.startsWith('http') ? profile.linkedin : `https://${profile.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">{profile.linkedin}</a></div>
            )}
          </div>

          {/* Education */}
          {profile.education && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Education</p>
              <p className="text-xs text-gray-600 leading-relaxed">{profile.education}</p>
            </div>
          )}

          {/* Employment Timeline */}
          {profile.employment_timeline?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Career History</p>
              <div className="space-y-1.5 border-l-2 border-golden-200 pl-3">
                {profile.employment_timeline.map((job, i) => (
                  <div key={i} className="text-xs">
                    <p className="text-gray-800 font-medium">{job.t || job.co || 'Role'}</p>
                    <p className="text-gray-400 text-[10px]">
                      {job.co && job.t ? `at ${job.co} ` : ''}
                      {job.s} - {job.c ? 'Present' : job.e}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills full list */}
          {profile.skills?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Technical Skills</p>
              <div className="flex flex-wrap gap-1">
                {profile.skills.map((s, i) => (
                  <span key={i} className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[11px] text-gray-700">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Industries */}
          {profile.industries?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Industries</p>
              <p className="text-xs text-gray-600">{profile.industries.join(', ')}</p>
            </div>
          )}

          {/* Certifications */}
          {profile.certifications?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Certifications</p>
              <div className="flex flex-wrap gap-1">
                {profile.certifications.map((c, i) => (
                  <span key={i} className="bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 text-[10px] text-emerald-700 font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Achievements */}
          {profile.achievements?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Achievements</p>
              {profile.achievements.map((a, i) => (
                <p key={i} className="text-[11px] text-gray-600 leading-snug">* {a}</p>
              ))}
            </div>
          )}

          {/* ATS Score section */}
          {profile.ats_score != null && profile.ats_score > 0 && (
            <div className={`rounded-lg px-3 py-2 border ${
              profile.ats_score >= 75 ? 'bg-emerald-50/50 border-emerald-200' :
              profile.ats_score >= 60 ? 'bg-blue-50/50 border-blue-200' :
              profile.ats_score >= 40 ? 'bg-amber-50/50 border-amber-200' :
              'bg-red-50/50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">ATS Score</span>
                <span className={`text-sm font-bold ${
                  profile.ats_score >= 75 ? 'text-emerald-700' :
                  profile.ats_score >= 60 ? 'text-blue-700' :
                  profile.ats_score >= 40 ? 'text-amber-700' :
                  'text-red-600'
                }`}>{profile.ats_score}/100</span>
              </div>
              {profile.ats_summary && <p className="text-[11px] text-gray-600 leading-relaxed">{profile.ats_summary}</p>}
            </div>
          )}

          {/* Source */}
          <div className="text-[10px] text-gray-400">
            Source: {(profile.source_file_name || '').replace(/^\d{10,}-/, '')}
            {profile.source_zip_name ? ` (from ${profile.source_zip_name})` : ''}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            {!profile.confirmed && (
              <button onClick={onConfirm} className="flex items-center gap-1.5 text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold transition-colors">
                <CheckCircle2 className="w-3 h-3" /> Confirm
              </button>
            )}
            <button onClick={startEdit} className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-golden-600 font-medium transition-colors">
              <Pencil className="w-3 h-3" /> Edit
            </button>
            {profile.resume_file_url && (
              <a href={profile.resume_file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-golden-600 hover:text-golden-700 font-semibold transition-colors">
                <ExternalLink className="w-3 h-3" /> Resume
              </a>
            )}
            <button onClick={onDelete} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-red-500 transition-colors ml-auto">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Edit Field Component ---

function EditField({ icon, value, onChange, placeholder }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-golden-400 focus:ring-1 focus:ring-golden-200"
      />
    </div>
  );
}

// --- ATS Card ---

function ATSCard({ applicant, expanded, onToggle }: { applicant: ATSApplicant; expanded: boolean; onToggle: () => void }) {
  const sourceColor = applicant.source === 'chatbot' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-100 text-gray-600 border-gray-200';

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md ${expanded ? 'border-blue-300 shadow-md ring-1 ring-blue-100' : 'border-gray-200 shadow-sm'}`}>
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 border border-blue-300/50 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-700 font-bold text-xs">{(applicant.name || '?')[0].toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-gray-900 font-semibold text-sm truncate leading-tight">{applicant.name}</p>
              {applicant.email && <p className="text-gray-400 text-[11px] truncate">{applicant.email}</p>}
            </div>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${sourceColor}`}>
            {applicant.source === 'chatbot' ? 'Chatbot' : 'Form'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="inline-flex items-center gap-1 bg-golden-50 text-golden-700 border border-golden-200 rounded-md px-2 py-0.5 text-[10px] font-medium">
            <Briefcase className="w-2.5 h-2.5" />{applicant.job_title}
          </span>
          {applicant.submitted_at && <span className="text-[10px] text-gray-400">{new Date(applicant.submitted_at).toLocaleDateString()}</span>}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-2">
          {applicant.email && (
            <div className="flex items-center gap-2 text-xs"><Mail className="w-3 h-3 text-gray-400" /><a href={`mailto:${applicant.email}`} className="text-blue-600 hover:underline">{applicant.email}</a></div>
          )}
          {applicant.phone && (
            <div className="flex items-center gap-2 text-xs"><Phone className="w-3 h-3 text-gray-400" /><span className="text-gray-700">{applicant.phone}</span></div>
          )}
          {applicant.resume_url && (
            <a href={applicant.resume_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-golden-600 hover:text-golden-700 font-semibold">
              <ExternalLink className="w-3 h-3" />{applicant.resume_name || 'View Resume'}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## FILE: `supabase/functions/_shared/adminAuth.ts`

```typescript
import { getSecret } from "./secrets.ts";

const enc = new TextEncoder();
export const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 8;

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function hmacB64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToB64(new Uint8Array(sig));
}

export async function signAdminToken(
  secret: string,
  now = Date.now(),
  ttl = ADMIN_TOKEN_TTL_MS,
): Promise<{ token: string; exp: number }> {
  const exp = now + ttl;
  const data = btoa(JSON.stringify({ iat: now, exp }));
  return { token: `${data}.${await hmacB64(secret, data)}`, exp };
}

export async function verifyAdminToken(
  token: unknown,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  try {
    if (typeof token !== "string" || token.length > 2048) return false;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const expected = await hmacB64(secret, parts[0]);
    if (!constantTimeEqual(expected, parts[1])) return false;
    const payload = JSON.parse(atob(parts[0]));
    return typeof payload?.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}

export function readAdminToken(req: Request, body?: unknown): string | null {
  const header = req.headers.get("x-admin-token");
  if (header) return header;
  const fromBody = (body as { admin_token?: unknown } | null | undefined)?.admin_token;
  return typeof fromBody === "string" ? fromBody : null;
}

export async function isAdminRequest(req: Request, body?: unknown): Promise<boolean> {
  const token = readAdminToken(req, body);
  if (!token) return false;
  return verifyAdminToken(token, await getSecret("JOBPOSTER_TOKEN_SECRET"));
}

/** Returns a 401 Response when the caller is not an admin, otherwise null. */
export async function requireAdmin(
  req: Request,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response | null> {
  if (await isAdminRequest(req, body)) return null;
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
```

---

## FILE: `supabase/functions/_shared/aiGuard.ts`

```typescript
import { isAdminRequest } from "./adminAuth.ts";
import { getUser } from "./userAuth.ts";
import { DEFAULT_LIMITS, enforceRateLimit, type LimitRule } from "./rateLimit.ts";

export { MEDIA_LIMITS } from "./rateLimit.ts";

export const MAX_JSON_BYTES = 100_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 + 64 * 1024;
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_MESSAGES = 20;

const CLIENT_LOCKED_KEYS = [
  "model",
  "model_override",
  "provider",
  "max_tokens",
  "maxTokens",
  "max_output_tokens",
  "maxOutputTokens",
  "system",
  "system_prompt",
  "systemPrompt",
];
const MESSAGE_ARRAY_KEYS = ["messages", "history", "conversation_history", "chat_history"];
const MESSAGE_TEXT_KEYS = ["message", "question", "query", "prompt"];

interface GuardOptions {
  rules?: LimitRule[];
  /** Locked keys this function handles itself (it must bound them server-side). */
  allowKeys?: string[];
}

function reject(headers: Record<string, string>, status: number, error: string): { ok: false; response: Response } {
  return {
    ok: false,
    response: new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    }),
  };
}

function capText(v: unknown): unknown {
  return typeof v === "string" && v.length > MAX_MESSAGE_CHARS ? v.slice(0, MAX_MESSAGE_CHARS) : v;
}

function capMessage(m: unknown): unknown {
  if (typeof m === "string") return capText(m);
  if (!m || typeof m !== "object") return m;
  const msg = { ...(m as Record<string, unknown>) };
  for (const k of ["content", "text", "message"]) {
    if (typeof msg[k] === "string") msg[k] = capText(msg[k]);
    else if (Array.isArray(msg[k])) {
      msg[k] = (msg[k] as unknown[]).map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? { ...(part as Record<string, unknown>), text: capText((part as { text: string }).text) }
          : part
      );
    }
  }
  return msg;
}

/** Non-admin callers cannot pick models, token budgets or system prompts, and chat input is bounded. */
export function sanitizeClientBody(body: Record<string, unknown>, allowKeys: string[] = []): Record<string, unknown> {
  const out = { ...body };
  for (const k of CLIENT_LOCKED_KEYS) if (!allowKeys.includes(k)) delete out[k];
  delete out.admin_token;
  for (const k of MESSAGE_ARRAY_KEYS) {
    if (Array.isArray(out[k])) out[k] = (out[k] as unknown[]).slice(-MAX_MESSAGES).map(capMessage);
  }
  for (const k of MESSAGE_TEXT_KEYS) out[k] = capText(out[k]);
  for (const k of MESSAGE_TEXT_KEYS) if (out[k] === undefined) delete out[k];
  return out;
}

type HeaderSource = Record<string, string> | ((req: Request) => Record<string, string>);
type Handler = (req: Request) => Response | Promise<Response>;

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function genericizeServerError(fn: string, res: Response, headers: Record<string, string>): Promise<Response> {
  if (res.status < 500) return res;
  const detail = await res.text().catch(() => "");
  console.error(`[${fn}] ${res.status}`, detail.slice(0, 2000));
  return new Response(JSON.stringify({ ok: false, error: GENERIC_ERROR }), {
    status: res.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/**
 * Wraps a public AI/media function: caps body size, rate-limits non-admin callers,
 * strips client-chosen model/token/system settings, bounds chat input, and replaces
 * 5xx bodies with a generic message. Admin-token callers bypass limits and sanitising.
 */
export function guardAi(fn: string, headerSource: HeaderSource, handler: Handler, opts: GuardOptions = {}): Handler {
  return async (req: Request) => {
    const headers = typeof headerSource === "function" ? headerSource(req) : headerSource;
    if (req.method === "OPTIONS") return handler(req);

    try {
      const declared = Number(req.headers.get("content-length") ?? "0");
      const contentType = req.headers.get("content-type") ?? "";
      const isMultipart = contentType.includes("multipart/form-data");
      const hasBody = req.method !== "GET" && req.method !== "HEAD";

      let parsed: Record<string, unknown> | null = null;
      let forward = req;

      if (hasBody && isMultipart) {
        if (!declared || declared > MAX_UPLOAD_BYTES) return reject(headers, 413, "Upload too large").response;
      } else if (hasBody) {
        if (declared > MAX_JSON_BYTES) return reject(headers, 413, "Request too large").response;
        const raw = await req.text();
        if (raw.length > MAX_JSON_BYTES) return reject(headers, 413, "Request too large").response;
        try {
          const value = raw ? JSON.parse(raw) : {};
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
          parsed = value as Record<string, unknown>;
        } catch {
          return reject(headers, 400, "Invalid request").response;
        }
      }

      const { isAdmin, userId } = await identify(req, parsed);
      if (!isAdmin) {
        const limited = await enforceRateLimit(req, fn, headers, { userId, rules: opts.rules ?? DEFAULT_LIMITS });
        if (limited) return limited;
      }

      if (parsed) {
        const body = isAdmin ? parsed : sanitizeClientBody(parsed, opts.allowKeys);
        const h = new Headers(req.headers);
        h.delete("content-length");
        h.set("content-type", "application/json");
        forward = new Request(req.url, { method: req.method, headers: h, body: JSON.stringify(body) });
      }

      return await genericizeServerError(fn, await handler(forward), headers);
    } catch (err) {
      console.error(`[${fn}] guard`, err);
      return reject(headers, 500, GENERIC_ERROR).response;
    }
  };
}

async function identify(req: Request, body: unknown): Promise<{ isAdmin: boolean; userId: string | null }> {
  const isAdmin = await isAdminRequest(req, body).catch(() => false);
  const user = isAdmin ? null : await getUser(req).catch(() => null);
  return { isAdmin, userId: user?.id ?? null };
}
```

---

## FILE: `supabase/functions/_shared/cors.ts`

```typescript
const DEFAULT_ORIGINS = [
  "https://goldenhire.com",
  "https://www.goldenhire.com",
  "https://bot23.life",
  "https://www.bot23.life",
  "http://localhost:5173",
];
const DEFAULT_SUFFIXES = [".webcontainer-api.io", ".bolt.new"];

const ALLOW_HEADERS = "Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Token, X-Cron-Secret";
const ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";

function allowlist(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string): boolean {
  if (allowlist().includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    return DEFAULT_SUFFIXES.some((s) => u.hostname.endsWith(s));
  } catch {
    return false;
  }
}

/**
 * CORS headers for a request. Restriction is opt-in via CORS_ENFORCE=true so the
 * live site keeps working until its deploy domain is confirmed in ALLOWED_ORIGINS.
 */
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const enforce = Deno.env.get("CORS_ENFORCE") === "true";
  const allowOrigin = !enforce ? "*" : isAllowedOrigin(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    Vary: "Origin",
  };
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": ALLOW_METHODS,
  "Access-Control-Allow-Headers": ALLOW_HEADERS,
};
```

---

## FILE: `supabase/functions/_shared/cron.ts`

```typescript
import { constantTimeEqual } from "./adminAuth.ts";
import { getOptionalSecret } from "./secrets.ts";

// True when the caller is the scheduler: the service role key, or X-Cron-Secret matching CRON_SECRET.
export async function isCronRequest(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (serviceKey && m && constantTimeEqual(m[1].trim(), serviceKey)) return true;

  const provided = req.headers.get("x-cron-secret");
  if (!provided) return false;
  const secret = await getOptionalSecret("CRON_SECRET");
  return !!secret && constantTimeEqual(provided, secret);
}
```

---

## FILE: `supabase/functions/_shared/email.ts`

```typescript
import { getOptionalSecret } from "./secrets.ts";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

/** Single-line value safe for headers like Subject. */
export function oneLine(value: unknown, max: number): string {
  return clip(value, max * 2).replace(/[\r\n]+/g, " ").slice(0, max);
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const e = value.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export interface SendResult {
  ok: boolean;
  message_id?: string;
}

export async function sendPostmark(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}): Promise<SendResult> {
  const token = await getOptionalSecret("POSTMARK_SERVER_TOKEN");
  const from = await getOptionalSecret("GOLDENHIRE_FROM");
  if (!token || !from) {
    console.error("[email] POSTMARK_SERVER_TOKEN or GOLDENHIRE_FROM is not configured");
    return { ok: false };
  }

  const payload: Record<string, string> = {
    From: from,
    To: opts.to,
    Subject: opts.subject,
    MessageStream: "outbound",
  };
  if (opts.html) payload.HtmlBody = opts.html;
  if (opts.text) payload.TextBody = opts.text;
  if (!opts.html && !opts.text) payload.TextBody = "(No body)";
  if (opts.replyTo) payload.ReplyTo = opts.replyTo;

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[email] postmark error", res.status, data?.ErrorCode, data?.Message);
      return { ok: false };
    }
    return { ok: true, message_id: data.MessageID };
  } catch (err) {
    console.error("[email] postmark request failed", err);
    return { ok: false };
  }
}
```

---

## FILE: `supabase/functions/_shared/qwenTranscribe.ts`

```typescript
const OMNI_ENDPOINTS: { base: string; model: string }[] = [
  { base: "https://maas.qwencloudapi.com/compatible-mode/v1", model: "qwen3.8-omni-flash" },
  { base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen3.8-omni-flash" },
  { base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen3-omni-flash" },
];

const SYSTEM_PROMPT =
  "You are a speech-to-text engine. Output only the exact words spoken, with normal punctuation and capitalization. " +
  "Speakers often talk about basketball: player names, teams, positions, stats and scouting terms. " +
  "Never answer, summarize or translate. If nothing intelligible is spoken, output nothing.";

export async function getDashScopeKey(): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/app_secrets?key=eq.DASHSCOPE_API_KEY&select=value&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows?.[0]?.value) return rows[0].value as string;
      }
    } catch { /* fall back to env */ }
  }
  return Deno.env.get("DASHSCOPE_API_KEY") ?? null;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof delta === "string") out += delta;
      } catch { /* partial line */ }
    }
  }
  return out.trim();
}

async function transcribeWithQwen(apiKey: string, audioBase64: string, format: string): Promise<string> {
  let lastError = "";
  for (const ep of OMNI_ENDPOINTS) {
    try {
      const res = await fetch(`${ep.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: ep.model,
          modalities: ["text"],
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "input_audio", input_audio: { data: `data:;base64,${audioBase64}`, format } },
                { type: "text", text: "Transcribe this recording word for word." },
              ],
            },
          ],
        }),
      });
      if (!res.ok || !res.body) {
        lastError = `${ep.model}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
        continue;
      }
      return await readStream(res);
    } catch (err) {
      lastError = `${ep.model}: ${(err as Error).message}`;
    }
  }
  throw new Error(lastError || "Qwen transcription unavailable");
}

async function transcribeWithWhisper(audio: File): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("No backup transcription configured");
  const form = new FormData();
  form.append("file", audio, audio.name || "voice.wav");
  form.append("model", "whisper-1");
  form.append("prompt", "Basketball scouting notes: players, teams, positions, stats.");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Backup transcription ${res.status}`);
  const data = await res.json();
  return typeof data?.text === "string" ? data.text.trim() : "";
}

/** Qwen omni first (all endpoints), then Whisper as a backup so voice keeps working during Qwen outages. */
export async function transcribeAudio(audio: File): Promise<string> {
  const format = audio.type.includes("mp3") || audio.type.includes("mpeg") ? "mp3" : "wav";
  const apiKey = await getDashScopeKey();
  let qwenError = "Qwen is not configured";
  if (apiKey) {
    try {
      return await transcribeWithQwen(apiKey, toBase64(await audio.arrayBuffer()), format);
    } catch (err) {
      qwenError = (err as Error).message;
      console.error("[transcribe] qwen failed:", qwenError);
    }
  }
  try {
    return await transcribeWithWhisper(audio);
  } catch (err) {
    console.error("[transcribe] backup failed:", (err as Error).message);
    throw new Error("Voice transcription is unavailable right now, please try again");
  }
}
```

---

## FILE: `supabase/functions/_shared/rateLimit.ts`

```typescript
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown").slice(0, 64);
}

/** Returns true while the key is within its limit. Fails open (logged) if the limiter itself is unavailable. */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return true;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/hit_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
    });
    if (!res.ok) {
      console.error("[rateLimit] rpc failed", res.status);
      return true;
    }
    return (await res.json()) === true;
  } catch (err) {
    console.error("[rateLimit] rpc error", err);
    return true;
  }
}

export interface LimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const HOURLY = 60 * 60;
export const DAILY = 60 * 60 * 24;

export const DEFAULT_LIMITS: LimitRule[] = [
  { bucket: "hour", limit: 20, windowSeconds: HOURLY },
  { bucket: "day", limit: 100, windowSeconds: DAILY },
];

export const MEDIA_LIMITS: LimitRule[] = [
  { bucket: "media-hour", limit: 5, windowSeconds: HOURLY },
  { bucket: "media-day", limit: 20, windowSeconds: DAILY },
];

/**
 * Applies each rule to `${fn}:${rule.bucket}:${identity}`. Identity is the user id when
 * known, otherwise the client IP. Returns a 429 Response when any rule is exceeded.
 */
export async function enforceRateLimit(
  req: Request,
  fn: string,
  headers: Record<string, string>,
  opts: { userId?: string | null; rules?: LimitRule[] } = {},
): Promise<Response | null> {
  const identity = opts.userId ? `u:${opts.userId}` : `ip:${clientIp(req)}`;
  for (const rule of opts.rules ?? DEFAULT_LIMITS) {
    const ok = await hitRateLimit(`${fn}:${rule.bucket}:${identity}`, rule.limit, rule.windowSeconds);
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, error: "Too many requests. Please try again later." }), {
        status: 429,
        headers: { ...headers, "Content-Type": "application/json", "Retry-After": String(rule.windowSeconds) },
      });
    }
  }
  return null;
}
```

---

## FILE: `supabase/functions/_shared/season.ts`

```typescript
const SEASON_START_MONTH = 10; // November, 0-indexed

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

export function calendarSeasonEndYear(d: Date = new Date()): number {
  return d.getMonth() >= SEASON_START_MONTH ? d.getFullYear() + 1 : d.getFullYear();
}

let cached: { year: number; at: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function espnSeasonEndYear(): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.year;
  try {
    const res = await fetch(SCOREBOARD_URL, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Referer": "https://www.espn.com/",
      },
    });
    if (res.ok) {
      const data = await res.json();
      const year =
        data?.leagues?.[0]?.season?.year ??
        data?.season?.year ??
        null;
      if (typeof year === "number" && year > 2000 && year < 2100) {
        cached = { year, at: Date.now() };
        return year;
      }
    }
  } catch (_) {
    /* fall through */
  }
  return calendarSeasonEndYear();
}

export function seasonOfDate(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return isNaN(d.getTime()) ? calendarSeasonEndYear() : calendarSeasonEndYear(d);
}

export function seasonLabel(endYear: number): string {
  return `${endYear - 1}-${String(endYear).slice(-2)}`;
}
```

---

## FILE: `supabase/functions/_shared/secrets.ts`

```typescript
const cache = new Map<string, string>();

export class MissingSecretError extends Error {
  constructor(key: string) {
    super(`${key} is not configured`);
    this.name = "MissingSecretError";
  }
}

export async function getOptionalSecret(key: string): Promise<string | null> {
  const cached = cache.get(key);
  if (cached) return cached;

  const fromEnv = Deno.env.get(key);
  if (fromEnv) {
    cache.set(key, fromEnv);
    return fromEnv;
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const value = Array.isArray(rows) ? rows[0]?.value : null;
    if (typeof value !== "string" || !value) return null;
    cache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export async function getSecret(key: string): Promise<string> {
  const value = await getOptionalSecret(key);
  if (!value) throw new MissingSecretError(key);
  return value;
}
```

---

## FILE: `supabase/functions/_shared/storageFetch.ts`

```typescript
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

export interface StoredFile {
  buf: ArrayBuffer;
  contentType: string;
}

const STORAGE_URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/;

// Only files in this project's storage can be read; arbitrary URLs are refused.
export async function fetchStoredFile(db: SupabaseClient, url: string): Promise<StoredFile> {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  if (!base || !url.startsWith(base)) throw new Error("unsupported_file_location");
  const m = url.match(STORAGE_URL_RE);
  if (!m) throw new Error("unsupported_file_location");
  const bucket = decodeURIComponent(m[1]);
  const path = decodeURIComponent(m[2]);
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Error("file_download_failed");
  return { buf: await data.arrayBuffer(), contentType: data.type || "" };
}
```

---

## FILE: `supabase/functions/_shared/userAuth.ts`

```typescript
export interface AuthUser {
  id: string;
  email: string | null;
  created_at?: string;
}

export interface BtlStaff extends AuthUser {
  role: string;
}

export const BTL_ADMIN_ROLES = ["owner", "admin", "director", "gm"];

function env() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) throw new Error("Supabase is not configured");
  return { url, anonKey, serviceKey };
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function getUser(req: Request): Promise<AuthUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const { url, anonKey } = env();
  if (token === anonKey) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u?.id || typeof u.id !== "string") return null;
    return {
      id: u.id,
      email: typeof u.email === "string" ? u.email : null,
      created_at: typeof u.created_at === "string" ? u.created_at : undefined,
    };
  } catch {
    return null;
  }
}

export async function getBtlStaff(req: Request): Promise<BtlStaff | null> {
  const user = await getUser(req);
  if (!user) return null;
  const { url, serviceKey } = env();
  const res = await fetch(
    `${url}/rest/v1/btl_staff_profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const role = Array.isArray(rows) ? rows[0]?.role : null;
  if (typeof role !== "string") return null;
  return { ...user, role: role.toLowerCase() };
}

function deny(status: number, headers: Record<string, string>) {
  return new Response(
    JSON.stringify({ ok: false, error: status === 401 ? "Unauthorized" : "Forbidden" }),
    { status, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

type Guard<T> = { user: T; response?: undefined } | { user?: undefined; response: Response };

export async function requireUser(req: Request, headers: Record<string, string>): Promise<Guard<AuthUser>> {
  const user = await getUser(req);
  return user ? { user } : { response: deny(401, headers) };
}

export async function requireBtlStaff(req: Request, headers: Record<string, string>): Promise<Guard<BtlStaff>> {
  const staff = await getBtlStaff(req);
  return staff ? { user: staff } : { response: deny(401, headers) };
}

export async function requireBtlAdmin(req: Request, headers: Record<string, string>): Promise<Guard<BtlStaff>> {
  const staff = await getBtlStaff(req);
  if (!staff) return { response: deny(401, headers) };
  if (!BTL_ADMIN_ROLES.includes(staff.role)) return { response: deny(403, headers) };
  return { user: staff };
}
```

---

## FILE: `supabase/functions/admin-candidates/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const denied = await requireAdmin(req, body, corsHeaders);
    if (denied) return denied;

    const supabase = createClient(supabaseUrl, serviceKey);
    const action = body.action;

    if (action === "delete") {
      const id = body.id;
      if (!id) return json({ ok: false, error: "id required" }, 400);
      await supabase.from("resume_files").delete().eq("candidate_id", id);
      const { error } = await supabase
        .from("candidate_profiles")
        .delete()
        .eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "update") {
      const id = body.id;
      const data = body.data;
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { error } = await supabase
        .from("candidate_profiles")
        .update(data)
        .eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "bulk_delete") {
      const ids = body.ids;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return json({ ok: false, error: "ids array required" }, 400);
      }
      await supabase.from("resume_files").delete().in("candidate_id", ids);
      const { error } = await supabase
        .from("candidate_profiles")
        .delete()
        .in("id", ids);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, deleted: ids.length });
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[admin-candidates] error:", err);
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

## FILE: `supabase/functions/bulk-import-candidates/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const denied = await requireAdmin(req, body, corsHeaders);
    if (denied) return denied;

    const candidates = body.candidates;
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return json({ ok: false, error: "candidates array required" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const rows = candidates.map((c: Record<string, unknown>) => ({
      full_name: c.full_name || "Unknown",
      email: c.email || null,
      phone: c.phone || null,
      current_title: c.current_title || null,
      years_experience: c.years_experience || null,
      seniority_level: c.seniority_level || null,
      functional_area: c.functional_area || null,
      skills: c.skills || [],
      technical_skills: c.technical_skills || [],
      education: c.education || null,
      employment_timeline: c.employment_timeline || [],
      candidate_summary: c.candidate_summary || null,
      resume_summary: c.resume_summary || null,
      industries: c.industries || [],
      certifications: c.certifications || [],
      achievements: c.achievements || [],
      processing_status: "complete",
      duplicate_status: "unique",
      confirmed: true,
      source_format: "handshake_import",
      source_file_name: c.source_file_name || null,
    }));

    const { error } = await supabase.from("candidate_profiles").insert(rows);

    if (error) {
      return json({ ok: false, error: error.message }, 400);
    }

    return json({ ok: true, inserted: rows.length });
  } catch (err) {
    console.error("[bulk-import-candidates] error:", err);
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

## FILE: `supabase/functions/extract-card-from-resume/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as mammoth from "npm:mammoth@1.8.0";
import { guardAi, MEDIA_LIMITS } from "../_shared/aiGuard.ts";
import { corsFor } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MODEL = Deno.env.get("OPENAI_RESUME_MODEL") ?? "gpt-4o-mini";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface CardExtraction {
  match_score: number;
  full_name: string;
  role_title: string;
  company: string;
  location: string;
  years_experience: number;
  headline: string;
  play_style: string;
  scouting_report: string;
  skills: string[];
  highlights: string[];
  achievements: string[];
  timeline: Array<{ company: string; role: string; years: string; impact: string }>;
  stats: Array<{ name: string; value: number }>;
}

Deno.serve(guardAi("extract-card-from-resume", corsFor, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ ok: false, error: "OPENAI_API_KEY not configured" }, 500);

    const form = await req.formData();
    const file = form.get("file");
    const targetRole = String(form.get("target_role") ?? "").trim();
    const archetype = String(form.get("archetype") ?? "").trim();

    if (!(file instanceof File)) return json({ ok: false, error: "Resume file required" }, 400);
    if (file.size > MAX_FILE_BYTES) return json({ ok: false, error: "Resume must be under 10 MB" }, 400);

    const filename = file.name || "resume.pdf";
    const contentType = file.type || guessContentType(filename);
    const buf = await file.arrayBuffer();

    const systemPrompt = buildSystemPrompt(targetRole, archetype);
    const userText = buildUserText(targetRole, archetype);

    let userContent: unknown;
    let fileIdToCleanup: string | null = null;

    if (isWordDoc(filename, contentType)) {
      const text = await extractWordText(buf, filename);
      userContent = [
        { type: "text", text: `${userText}\n\n--- RESUME TEXT (extracted from ${filename}) ---\n${text}` },
      ];
    } else {
      const uploadForm = new FormData();
      uploadForm.append("purpose", "user_data");
      uploadForm.append("file", new Blob([buf], { type: contentType }), filename);
      const uploadRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: uploadForm,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`OpenAI file upload failed (${uploadRes.status}): ${errText}`);
      }
      const uploadJson = await uploadRes.json();
      fileIdToCleanup = uploadJson.id as string;
      userContent = [
        { type: "file", file: { file_id: fileIdToCleanup } },
        { type: "text", text: userText },
      ];
    }

    const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        response_format: {
          type: "json_schema",
          json_schema: { name: "card_extraction", strict: true, schema: EXTRACTION_SCHEMA },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      throw new Error(`OpenAI completion failed (${completionRes.status}): ${errText}`);
    }

    const completion = await completionRes.json();
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content");
    const parsed = JSON.parse(content) as CardExtraction;
    sanitize(parsed);

    if (fileIdToCleanup) {
      fetch(`https://api.openai.com/v1/files/${fileIdToCleanup}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => {});
    }

    return json({ ok: true, extraction: parsed });
  } catch (err) {
    console.error("[extract-card-from-resume]", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
}, { rules: MEDIA_LIMITS }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function guessContentType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function isWordDoc(name: string, contentType: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return true;
  if (contentType.includes("officedocument.wordprocessingml") || contentType === "application/msword") return true;
  return false;
}

async function extractWordText(buf: ArrayBuffer, filename: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = (result?.value ?? "").trim();
    if (!text) throw new Error("Document is empty");
    return text.slice(0, 18000);
  } catch (err) {
    throw new Error(`Could not read ${filename}: ${err instanceof Error ? err.message : "parse error"}`);
  }
}

function sanitize(a: CardExtraction) {
  a.match_score = Math.max(0, Math.min(100, Math.round(a.match_score ?? 0)));
  a.years_experience = Math.max(0, Math.min(80, Math.round(a.years_experience ?? 0)));
  a.full_name = String(a.full_name ?? "").trim().slice(0, 80);
  a.role_title = String(a.role_title ?? "").trim().slice(0, 80);
  a.company = String(a.company ?? "").trim().slice(0, 80);
  a.location = String(a.location ?? "").trim().slice(0, 80);
  a.headline = String(a.headline ?? "").trim().slice(0, 200);
  a.play_style = String(a.play_style ?? "").trim().slice(0, 200);
  a.scouting_report = String(a.scouting_report ?? "").trim().slice(0, 600);

  for (const k of ["skills", "highlights", "achievements"] as const) {
    if (!Array.isArray(a[k])) (a[k] as string[]) = [];
    a[k] = (a[k] as string[]).slice(0, 10).map((s) => String(s).trim()).filter(Boolean);
  }

  if (!Array.isArray(a.timeline)) a.timeline = [];
  a.timeline = a.timeline.slice(0, 6).map((t) => ({
    company: String(t?.company ?? "").trim().slice(0, 60),
    role: String(t?.role ?? "").trim().slice(0, 60),
    years: String(t?.years ?? "").trim().slice(0, 30),
    impact: String(t?.impact ?? "").trim().slice(0, 160),
  })).filter((t) => t.company || t.role);

  if (!Array.isArray(a.stats)) a.stats = [];
  a.stats = a.stats.slice(0, 6).map((s) => ({
    name: String(s?.name ?? "").trim().slice(0, 24),
    value: Math.max(0, Math.min(100, Math.round(Number(s?.value) || 0))),
  })).filter((s) => s.name);
}

function buildSystemPrompt(targetRole: string, archetype: string) {
  const roleHint = targetRole ? `target role: ${targetRole}` : "their apparent target role";
  const archetypeHint = archetype
    ? `The candidate has self-identified as a "${archetype}" archetype — phrase the play_style and scouting_report so they reinforce that archetype where the resume supports it.`
    : "";
  return [
    `You are a senior executive recruiter reading a candidate's resume to fill out a slick "career trading card" profile.`,
    `Your job is to TELL THEIR STORY: pull out the most impressive, concrete, specific accomplishments and translate them into punchy bullets.`,
    `Read the attached resume CAREFULLY. Do NOT invent facts. If something is not in the resume, leave it blank or omit it from arrays.`,
    `Goal: a recruiter or hiring manager landing on this card should immediately understand who this person is, what they have done, and why they are valuable.`,
    ``,
    `Fill in these fields based ONLY on the resume content (${roleHint}):`,
    archetypeHint,
    ``,
    `- "full_name": the candidate's name as it appears on the resume.`,
    `- "role_title": their CURRENT or most recent job title (just the title, no company).`,
    `- "company": their current/most recent employer.`,
    `- "location": city, state/country if present.`,
    `- "years_experience": integer; estimate total years of full-time professional experience (exclude internships/school). 0 if early-career.`,
    `- "headline": ONE punchy sentence (max 140 chars) summarizing who they are professionally — written in third person, in the voice of a top-tier recruiter pitching them. NO clichés like "passionate" or "results-driven".`,
    `- "play_style": ONE sentence describing HOW they work (e.g., "Builds zero-to-one B2B platforms with a tight design + eng loop"). Concrete, distinctive.`,
    `- "scouting_report": 2-4 sentences (~80-120 words) — a recruiter-grade scouting note that synthesizes their trajectory, signature wins, and what kind of role they would crush next. Specific to THIS resume.`,
    `- "skills": 6-10 of their strongest hard skills (technologies, methodologies, domains). Pull from "skills" section AND from work experience verbs/tools. Title-case short tags (e.g., "Product Strategy", "TypeScript", "GTM Strategy").`,
    `- "highlights": 4-6 SHORT bullet sentences (one line each) that tell the story of their career. Each bullet should be a specific accomplishment with a number/scope where possible. Examples: "Scaled BoomCo from $2M to $25M ARR in 18 months", "Led 30-engineer platform team at Stripe through Series D".`,
    `- "achievements": 3-6 concise badge-style strings — awards, recognitions, distinctions, certifications, or marquee outcomes (e.g., "Forbes 30u30 2022", "AWS Certified Solutions Architect", "$50M Series B").`,
    `- "timeline": 3-5 most-recent roles in REVERSE chronological order. Each item:`,
    `   - "company": employer name`,
    `   - "role": job title`,
    `   - "years": e.g. "2021-2024", "2019-Pres"`,
    `   - "impact": ONE sentence summarizing the most concrete impact in that role (numbers preferred).`,
    `- "stats": 6 capability ratings 0-100 estimating the candidate's strength in: Leadership, Strategy, Execution, Communication, Technical Depth, Adaptability. Calibrate from resume signals (seniority, scope, domain). Do not invent — if a dimension is unclear, default to 60-70.`,
    `- "match_score": 0-100; how strong this resume LOOKS for ${roleHint}. 80+ = very strong, 60-79 = solid, 40-59 = needs work, <40 = significant retargeting.`,
    ``,
    `Output JSON exactly matching the schema. Be specific. Be concrete. Pull real numbers from the resume.`,
  ].filter(Boolean).join("\n");
}

function buildUserText(targetRole: string, archetype: string) {
  const lines: string[] = [];
  if (targetRole) lines.push(`Candidate's target role: ${targetRole}`);
  if (archetype) lines.push(`Candidate's chosen archetype: ${archetype}`);
  lines.push("");
  lines.push("Read the attached resume and extract the structured career-card profile per the system instructions.");
  return lines.join("\n");
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "match_score",
    "full_name",
    "role_title",
    "company",
    "location",
    "years_experience",
    "headline",
    "play_style",
    "scouting_report",
    "skills",
    "highlights",
    "achievements",
    "timeline",
    "stats",
  ],
  properties: {
    match_score: { type: "integer", minimum: 0, maximum: 100 },
    full_name: { type: "string" },
    role_title: { type: "string" },
    company: { type: "string" },
    location: { type: "string" },
    years_experience: { type: "integer", minimum: 0, maximum: 80 },
    headline: { type: "string" },
    play_style: { type: "string" },
    scouting_report: { type: "string" },
    skills: { type: "array", items: { type: "string" }, maxItems: 10 },
    highlights: { type: "array", items: { type: "string" }, maxItems: 8 },
    achievements: { type: "array", items: { type: "string" }, maxItems: 8 },
    timeline: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["company", "role", "years", "impact"],
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          years: { type: "string" },
          impact: { type: "string" },
        },
      },
    },
    stats: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "value"],
        properties: {
          name: { type: "string" },
          value: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
} as const;
// deploy: extract-card-from-resume guarded v2
```

---

## FILE: `supabase/functions/extract-resume-text/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as mammoth from "npm:mammoth@1.8.0";
import { Buffer } from "node:buffer";
import { guardAi, MEDIA_LIMITS } from "../_shared/aiGuard.ts";
import { corsFor } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

const MAX_CHARS = 80000;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", heic: "image/heic", heif: "image/heif",
};

async function extractWithGemini(buf: ArrayBuffer, mimeType: string, geminiKey: string): Promise<string> {
  const isImage = mimeType.startsWith("image/");
  const instruction = isImage
    ? "Transcribe every piece of visible text in this image exactly (OCR), preserving layout as plain text with line breaks and tables as rows. If there are charts, stat sheets or photos, add a short factual description after the transcription. No commentary."
    : "Extract ALL text content from this document, every page, in reading order. Preserve structure: headings, bullet points, numbered lists and tables (render tables as pipe-separated rows). Transcribe scanned pages too. Return ONLY the text, no commentary.";
  const data64 = toBase64(buf);
  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    const generationConfig: Record<string, unknown> = { temperature: 0, maxOutputTokens: model.startsWith("gemini-2.5") ? 32768 : 8192 };
    if (model.startsWith("gemini-2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: instruction }] },
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: data64 } },
          { text: isImage ? "Transcribe this image." : "Extract all text from this document." },
        ],
      }],
      generationConfig,
    });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!res.ok) {
      lastErr = await res.text();
      console.error(`[extract-resume-text] ${model} error:`, lastErr.slice(0, 500));
      continue;
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? "").join("");
    if (text.trim()) return text;
  }
  throw new Error("Could not read this document");
}

function stripRtf(raw: string): string {
  return raw
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

async function extractWordText(buf: ArrayBuffer, filename: string): Promise<string> {
  if (filename.toLowerCase().endsWith(".doc")) {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf)
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/ {2,}/g, " ")
      .slice(0, MAX_CHARS);
  }
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return result.value.slice(0, MAX_CHARS);
}

Deno.serve(guardAi("extract-resume-text", corsFor, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "GEMINI_API_KEY not configured" }, 500);

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) return json({ error: "File required" }, 400);
    if (file.size > 10 * 1024 * 1024) return json({ error: "File must be under 10 MB" }, 400);

    const filename = file.name || "document.pdf";
    const lower = filename.toLowerCase();
    const ext = lower.split(".").pop() ?? "";
    const buf = await file.arrayBuffer();

    let text: string;

    if (ext === "pdf" || file.type === "application/pdf") {
      text = await extractWithGemini(buf, "application/pdf", geminiKey);
    } else if (IMAGE_TYPES[ext] || file.type.startsWith("image/")) {
      text = await extractWithGemini(buf, IMAGE_TYPES[ext] ?? file.type, geminiKey);
    } else if (ext === "docx" || ext === "doc") {
      text = await extractWordText(buf, filename);
    } else if (ext === "rtf") {
      text = stripRtf(new TextDecoder().decode(buf));
    } else {
      text = new TextDecoder().decode(buf);
    }

    text = text.trim().slice(0, MAX_CHARS);
    if (!text) {
      return json({ error: "Could not find any readable text in this file." }, 400);
    }

    return json({ ok: true, text, truncated: text.length >= MAX_CHARS });
  } catch (err) {
    console.error("[extract-resume-text]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
}, { rules: MEDIA_LIMITS }));
// deploy: extract-resume-text guarded v2
```

---

## FILE: `supabase/functions/pipeline-stats/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: stats, error } = await supabase
      .from("pipeline_stats")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !stats) {
      return new Response(JSON.stringify({ error: "No stats found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nudge numbers slightly to simulate live movement
    const nudge = (val: number, range: number) =>
      Math.round((val + (Math.random() - 0.5) * range * 2) * 10) / 10;

    const newStats = {
      in_pipeline: stats.in_pipeline + (Math.random() > 0.5 ? 1 : -1),
      match_score_avg: Math.min(99, Math.max(80, nudge(stats.match_score_avg, 0.3))),
      acceptance_rate: Math.min(99, Math.max(70, nudge(stats.acceptance_rate, 0.2))),
      time_to_close_avg: stats.time_to_close_avg,
      updated_at: new Date().toISOString(),
    };

    await supabase.from("pipeline_stats").update(newStats).eq("id", stats.id);

    return new Response(JSON.stringify({ ...stats, ...newStats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("pipeline-stats error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

---

## FILE: `supabase/functions/resumes-chat/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { guardAi, MEDIA_LIMITS } from "../_shared/aiGuard.ts";
import { corsFor } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are an AI recruiting assistant for Golden Hire, an executive recruiting firm specializing in sales/GTM talent at high-growth software companies (Series A to 100M+ revenue). You have access to the resume database and help recruiters evaluate, rank, and reach out to candidates.

--- CAPABILITIES ---
- Find best candidate matches for a job description
- Summarize candidate profiles using Golden Hire's evaluation framework
- Compare candidates to specific role requirements
- Answer questions about the talent pool (e.g., "Show all E4 candidates", "Who has Python and AWS?")
- Filter candidates by seniority level (Entry/Junior, Mid-level, Senior, Lead, Principal, Director, Executive)
- Filter candidates by functional area / job category
- Filter candidates by skills, location, years of experience
- Rank candidates by fit for a given role
- Draft outreach messages in Golden Hire's voice
- Analyze hiring pipeline and provide recommendations
- Summarize the talent pool (counts by seniority, category, location)

--- SENIORITY LEVELS ---
- Entry/Junior: 0-2 years, interns, new grads
- Mid-level: 2-5 years
- Senior / Lead: 5-10+ years, leadership signals
- Principal / Director / Executive: 10+ years, strategic roles

When the user asks "show all E1/E2/E3/E4 candidates" or similar seniority queries:
- E1 = Entry/Junior
- E2 = Mid-level (sometimes called Associate)
- E3 = Senior
- E4 = Lead / Principal / Staff / Director / Executive

--- EVALUATION FRAMEWORK (apply when ranking or summarizing) ---

Assess candidates in this priority order:
1. STABILITY: 3-5 year runs? How long in last two positions? Frequent moves = red flag.
2. CAREER TRAJECTORY: Upward trend vs. plateau vs. step back. Career advancement signals drive.
3. COMPANY STAGE FIT: High-growth under 100M is our sweet spot. Big-company-only or pure startup chasers may not fit.
4. SUCCESS: Presidents Club, over 100% quota, overachievement history. Track record at a previous company matters more than current role.
5. EDUCATION & EARLY CAREER: School, sports, first job out of school — how long they stayed, were they successful.

INSTANT DISQUALIFIERS: Poor stability, underperforming quota, wrong location, incorrect skill set, career stage mismatch, big-company-only DNA, wrong company type (software vs services vs hardware), work authorization issues.

--- OUTREACH DRAFTING ---

When drafting outreach, use Golden Hire's voice:
- PASSIVE candidates: Consultative, expert tone. "Love your track record at [previous company] — are you looking to have that type of run again?"
- ACTIVE candidates: Direct and urgent. "You're looking, we're looking — let's talk."
- REFERRALS: Warm and friendly. "I heard you're an A-player from someone I trust."

NEVER USE: "I came across your profile," "rockstar," "exciting opportunity," "placed someone"
SAY INSTEAD: "worked with," "partnered with," "aligned with"

--- RANKING APPROACH ---

When matching against a JD, consider: stability, trajectory, skills match, company stage DNA, success indicators, and cultural fit. Lead with verdict (strong fit / yellow flags / likely pass) then explain why. Be specific — reference actual candidate data.

Format responses clearly with headers and bullet points.`;

const DEFAULT_MODEL = "gemini-2.5-flash-preview-05-20";

// How many recent persisted messages to inject as "memory"
const MEMORY_MESSAGE_LIMIT = 30;
// How many application transcripts to include as context
const TRANSCRIPT_LIMIT = 20;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  jd?: string;
  session_id?: string;
}

Deno.serve(guardAi("resumes-chat", corsFor, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  const startTime = Date.now();

  try {
    const { messages, jd, session_id }: RequestBody = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ ok: false, message: "messages array is required" }, 400);
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return json({ ok: false, message: "GEMINI_API_KEY not configured" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Detect Python data import request
    const lastMsg = messages[messages.length - 1];
    const pythonImportResult = await detectAndImportPythonData(lastMsg?.content || "", supabase);
    if (pythonImportResult) {
      return json({ ok: true, message: pythonImportResult });
    }

    // Check for model override
    let model = DEFAULT_MODEL;
    const { data: config } = await supabase
      .from("ai_model_config")
      .select("model_override")
      .eq("task_type", "chatbot")
      .eq("is_active", true)
      .maybeSingle();
    if (config?.model_override) model = config.model_override;

    // Fetch all data in parallel
    const [
      candidateProfilesRes,
      resumesRes,
      candidatesRes,
      applicationsRes,
      jobsRes,
      sessionHistoryRes,
      transcriptsRes,
    ] = await Promise.all([
      supabase
        .from("candidate_profiles")
        .select("id, full_name, email, phone, location, resume_summary, skills, education, experience, certifications, links, source_file_name, confirmed, current_title, years_experience, seniority_level, functional_area, candidate_summary, linkedin, portfolio_github, achievements, industries, work_authorization")
        .eq("processing_status", "created")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("resumes")
        .select("id, name, email, skills, experience_years, education, summary, highlights, category_tag, status, file_name")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("talent_candidates")
        .select("id, name, email, top_skills, years_experience, scan_summary, strengths, gaps, experience_highlights, status")
        .order("match_score", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("job_applications")
        .select("id, name, email, phone, resume_name, resume_url, answers, source, created_at, job_id")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("jobs")
        .select("id, title, department, location, compensation, employment_type, description")
        .eq("is_active", true)
        .limit(30),
      // Load persisted session history for memory
      session_id
        ? supabase
            .from("recruiter_chat_sessions")
            .select("role, content, created_at")
            .eq("session_id", session_id)
            .order("created_at", { ascending: false })
            .limit(MEMORY_MESSAGE_LIMIT)
        : Promise.resolve({ data: [] }),
      // Load chatbot transcripts from job applications as training context
      supabase
        .from("job_applications")
        .select("name, transcript")
        .not("transcript", "is", null)
        .order("created_at", { ascending: false })
        .limit(TRANSCRIPT_LIMIT),
    ]);

    const candidateProfiles = candidateProfilesRes.data ?? [];
    const resumes = resumesRes.data ?? [];
    const candidates = candidatesRes.data ?? [];
    const applications = applicationsRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const sessionHistory = (sessionHistoryRes.data ?? []).reverse();
    const transcriptApps = transcriptsRes.data ?? [];

    // Build candidate/job context
    let contextData = "";

    if (candidateProfiles.length > 0) {
      contextData += "\n\n--- CANDIDATE PROFILES (Primary Database) ---\n";
      contextData += `Total: ${candidateProfiles.length} candidates\n`;
      for (const cp of candidateProfiles) {
        contextData += `\nCandidate: ${cp.full_name}${cp.confirmed ? ' [Confirmed]' : ' [Unconfirmed]'}\n`;
        if (cp.current_title) contextData += `  Title: ${cp.current_title}\n`;
        if (cp.seniority_level) contextData += `  Seniority: ${cp.seniority_level}\n`;
        if (cp.functional_area) contextData += `  Category: ${cp.functional_area}\n`;
        if (cp.years_experience != null) contextData += `  Years Experience: ${cp.years_experience}\n`;
        if (cp.email) contextData += `  Email: ${cp.email}\n`;
        if (cp.phone) contextData += `  Phone: ${cp.phone}\n`;
        if (cp.location) contextData += `  Location: ${cp.location}\n`;
        if (cp.linkedin) contextData += `  LinkedIn: ${cp.linkedin}\n`;
        if (cp.portfolio_github) contextData += `  GitHub: ${cp.portfolio_github}\n`;
        contextData += `  Skills: ${cp.skills?.join(", ") || "N/A"}\n`;
        contextData += `  Education: ${cp.education || "N/A"}\n`;
        if (cp.candidate_summary) contextData += `  Summary: ${cp.candidate_summary}\n`;
        else if (cp.resume_summary) contextData += `  Summary: ${cp.resume_summary}\n`;
        if (cp.experience?.length) {
          const expStr = cp.experience.map((e: { title: string; company: string; duration: string }) => `${e.title} at ${e.company} (${e.duration})`).join("; ");
          contextData += `  Experience: ${expStr}\n`;
        }
        if (cp.achievements?.length) contextData += `  Achievements: ${cp.achievements.join("; ")}\n`;
        if (cp.industries?.length) contextData += `  Industries: ${cp.industries.join(", ")}\n`;
        if (cp.certifications?.length) contextData += `  Certifications: ${cp.certifications.join(", ")}\n`;
        if (cp.work_authorization) contextData += `  Work Auth: ${cp.work_authorization}\n`;
        if (cp.links?.length) contextData += `  Links: ${cp.links.join(", ")}\n`;
      }
    }

    if (resumes.length > 0) {
      contextData += "\n\n--- LEGACY RESUME BANK ---\n";
      for (const r of resumes) {
        contextData += `\nCandidate: ${r.name}\n`;
        if (r.email) contextData += `  Email: ${r.email}\n`;
        contextData += `  Skills: ${r.skills?.join(", ") || "N/A"}\n`;
        contextData += `  Experience: ${r.experience_years ?? "N/A"} years\n`;
        contextData += `  Education: ${r.education || "N/A"}\n`;
        contextData += `  Summary: ${r.summary || "N/A"}\n`;
        if (r.highlights?.length) contextData += `  Highlights: ${r.highlights.join("; ")}\n`;
        if (r.category_tag) contextData += `  Category: ${r.category_tag}\n`;
        contextData += `  Status: ${r.status}\n`;
      }
    }

    if (candidates.length > 0) {
      contextData += "\n\n--- TALENT DATABASE CANDIDATES ---\n";
      for (const c of candidates) {
        contextData += `\nCandidate: ${c.name}\n`;
        contextData += `  Skills: ${c.top_skills?.join(", ") || "N/A"}\n`;
        contextData += `  Experience: ${c.years_experience ?? "N/A"} years\n`;
        contextData += `  Summary: ${c.scan_summary || "N/A"}\n`;
        if (c.strengths?.length) contextData += `  Strengths: ${c.strengths.join(", ")}\n`;
        if (c.experience_highlights?.length) contextData += `  Highlights: ${c.experience_highlights.join("; ")}\n`;
      }
    }

    if (applications.length > 0) {
      contextData += "\n\n--- JOB APPLICANTS ---\n";
      for (const a of applications) {
        const jobTitle = jobs?.find((j) => j.id === a.job_id)?.title || "Unknown Role";
        contextData += `\nApplicant: ${a.name}\n`;
        contextData += `  Applied for: ${jobTitle}\n`;
        if (a.email) contextData += `  Email: ${a.email}\n`;
        if (a.phone) contextData += `  Phone: ${a.phone}\n`;
        contextData += `  Source: ${a.source || "N/A"}\n`;
        if (a.resume_name) contextData += `  Resume: ${a.resume_name}\n`;
        if (a.answers && Object.keys(a.answers).length > 0) {
          contextData += `  Application Answers: ${JSON.stringify(a.answers)}\n`;
        }
      }
    }

    if (jobs.length > 0) {
      contextData += "\n\n--- ACTIVE JOBS ---\n";
      for (const j of jobs) {
        contextData += `- ${j.title} | ${j.department || ""} | ${j.location || ""} | ${j.compensation || ""}\n`;
      }
    }

    if (jd) {
      contextData += `\n\n--- JOB DESCRIPTION TO MATCH AGAINST ---\n${jd}\n`;
    }

    // Inject chatbot transcripts from applications as memory/training context
    const transcriptContext = buildTranscriptContext(transcriptApps);

    // Inject persisted session history as memory context
    const memoryContext = sessionHistory.length > 0
      ? `\n\n--- RECENT CONVERSATION HISTORY (for continuity) ---\n` +
        sessionHistory.map((m) => `${m.role === "user" ? "Recruiter" : "Assistant"}: ${m.content}`).join("\n")
      : "";

    const systemMessage =
      SYSTEM_PROMPT +
      (contextData ? `\n\nHere is the current data from the resume database:\n${contextData}` : "\n\nThe resume database is currently empty.") +
      transcriptContext +
      memoryContext;

    // Current conversation (last 15 messages, excluding system messages)
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .slice(-15);

    // Build Gemini messages
    const geminiMessages = conversationMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemMessage }] },
        contents: geminiMessages,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
        },
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[resumes-chat] Gemini error:", geminiRes.status, errText);

      await supabase.from("ai_processing_logs").insert({
        task_type: "chatbot",
        model_used: model,
        layer: "reasoning",
        status: "failed",
        error: `Gemini API error (${geminiRes.status})`,
        latency_ms: latencyMs,
      }).catch(() => {});

      return json({ ok: false, message: "AI service unavailable" }, 502);
    }

    const geminiData = await geminiRes.json();
    const aiMessage = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
    const usage = geminiData?.usageMetadata;

    // Persist conversation turns to session history
    if (session_id) {
      const lastUserMsg = conversationMessages.findLast((m) => m.role === "user");
      const inserts = [];
      if (lastUserMsg) {
        inserts.push({ session_id, role: "user", content: lastUserMsg.content });
      }
      inserts.push({ session_id, role: "assistant", content: aiMessage });
      await supabase.from("recruiter_chat_sessions").insert(inserts).catch(() => {});
    }

    // Log usage
    await supabase.from("ai_processing_logs").insert({
      task_type: "chatbot",
      model_used: model,
      layer: "reasoning",
      status: "completed",
      input_tokens: usage?.promptTokenCount ?? 0,
      output_tokens: usage?.candidatesTokenCount ?? 0,
      latency_ms: latencyMs,
    }).catch(() => {});

    return json({ ok: true, message: aiMessage, model_used: model });
  } catch (error) {
    console.error("Error in resumes-chat:", error);
    return json(
      { ok: false, message: error instanceof Error ? error.message : "Internal error" },
      500
    );
  }
}, { rules: undefined }));

function buildTranscriptContext(apps: { name: string; transcript: { role: string; content: string }[] | null }[]): string {
  const relevant = apps.filter((a) => a.transcript && a.transcript.length > 0);
  if (relevant.length === 0) return "";

  let ctx = "\n\n--- CANDIDATE CHATBOT CONVERSATIONS (for context and pattern recognition) ---\n";
  ctx += "These are real conversations candidates had with the company chatbot. Use them to understand candidate backgrounds and communication styles.\n";
  for (const a of relevant.slice(0, 10)) {
    if (!a.transcript) continue;
    ctx += `\nConversation with ${a.name}:\n`;
    for (const turn of a.transcript.slice(0, 12)) {
      const speaker = turn.role === "user" ? "Candidate" : "Bot";
      ctx += `  ${speaker}: ${String(turn.content).slice(0, 400)}\n`;
    }
  }
  return ctx;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Python data import detection and processing
// deno-lint-ignore no-explicit-any
async function detectAndImportPythonData(text: string, supabase: any): Promise<string | null> {
  // Check if the message looks like Python data (contains list of dicts)
  if (text.length < 50) return null;

  // Detect patterns: variable = [{...}] or just [{...}] with candidate-like fields
  const hasPythonList = /\[\s*\{/.test(text) && /['"](name|full_name|email|skills|experience|resume_text|raw_text)['"]\s*:/i.test(text);
  const hasImportIntent = /(import|add|load|save|insert|create|put)\s*(these|this|them|candidates|profiles|data|resumes)/i.test(text) || hasPythonList;

  if (!hasPythonList) return null;

  try {
    // Extract the list content - find the outermost [...] containing dicts
    const listMatch = text.match(/\[[\s\S]*\{[\s\S]*\}[\s\S]*\]/);
    if (!listMatch) return null;

    let listStr = listMatch[0];

    // Safe Python literal → JSON conversion (no eval)
    // Convert Python syntax to JSON:
    listStr = listStr
      .replace(/None/g, "null")
      .replace(/True/g, "true")
      .replace(/False/g, "false")
      .replace(/'/g, '"')
      // Handle trailing commas before ] or }
      .replace(/,\s*([}\]])/g, "$1");

    let records: Record<string, unknown>[];
    try {
      records = JSON.parse(listStr);
    } catch {
      // Try wrapping in array if it's just dicts
      try {
        records = JSON.parse(`[${listStr}]`);
      } catch {
        return null; // Not parseable — let AI handle the message normally
      }
    }

    if (!Array.isArray(records) || records.length === 0) return null;

    // Validate they look like candidate records
    const candidateFields = new Set(["name", "full_name", "email", "phone", "skills", "experience", "raw_text", "resume_text", "location", "education", "title", "current_title"]);
    const firstRecord = records[0];
    if (!firstRecord || typeof firstRecord !== "object") return null;
    const matchingFields = Object.keys(firstRecord).filter((k) => candidateFields.has(k.toLowerCase()));
    if (matchingFields.length < 2) return null;

    // If no explicit import intent, ask for confirmation
    if (!hasImportIntent) {
      return `I detected ${records.length} candidate record(s) in your message. Would you like me to import them into the database? Just say "yes, import them" and I'll add them.`;
    }

    // Field normalization map
    const fieldMap: Record<string, string> = {
      full_name: "full_name", name: "full_name", candidate_name: "full_name",
      email: "email", phone: "phone", location: "location",
      linkedin: "linkedin", github: "portfolio_github",
      resume_text: "raw_text", raw_text: "raw_text", text: "raw_text",
      title: "current_title", current_title: "current_title", job_title: "current_title",
      skills: "skills", technical_skills: "skills", skill_list: "skills",
      education: "education", school: "education", degrees: "education",
      experience: "experience", work_experience: "experience", jobs: "experience",
      summary: "candidate_summary", profile_summary: "candidate_summary",
      certifications: "certifications", certs: "certifications",
      years_experience: "years_experience", yoe: "years_experience",
    };

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    // Create import record
    const { data: importRow } = await supabase
      .from("python_imports")
      .insert({
        file_name: "chatbot_paste",
        detected_variable_name: "chat_input",
        total_records: records.length,
      })
      .select("id")
      .maybeSingle();

    const importId = importRow?.id || null;

    for (const raw of records) {
      try {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
          const mapped = fieldMap[key.toLowerCase()] || key.toLowerCase();
          if (!normalized[mapped]) normalized[mapped] = value;
        }

        // Compose full_name
        if (!normalized.full_name && (normalized.first_name || normalized.last_name)) {
          normalized.full_name = `${normalized.first_name || ""} ${normalized.last_name || ""}`.trim();
        }

        // Skills to array
        let skills: string[] = [];
        if (Array.isArray(normalized.skills)) {
          skills = normalized.skills.map(String).filter(Boolean);
        } else if (typeof normalized.skills === "string") {
          skills = (normalized.skills as string).split(",").map((s: string) => s.trim()).filter(Boolean);
        }

        // Years
        let yoe: number | null = null;
        if (normalized.years_experience != null) {
          const p = parseFloat(String(normalized.years_experience));
          if (!isNaN(p)) yoe = p;
        }

        // Infer seniority
        let seniority = "Mid-level";
        if (yoe != null) {
          if (yoe >= 7) seniority = "Senior";
          else if (yoe >= 4) seniority = "Mid-level";
          else seniority = "Entry/Junior";
        }

        const row = {
          import_id: importId,
          full_name: String(normalized.full_name || "Unknown"),
          email: String(normalized.email || ""),
          phone: String(normalized.phone || ""),
          location: String(normalized.location || ""),
          linkedin: String(normalized.linkedin || ""),
          portfolio_github: String(normalized.portfolio_github || ""),
          current_title: String(normalized.current_title || ""),
          years_experience: yoe,
          skills,
          education: typeof normalized.education === "string" ? normalized.education : Array.isArray(normalized.education) ? normalized.education.join("; ") : "",
          experience: Array.isArray(normalized.experience) ? normalized.experience : [],
          certifications: Array.isArray(normalized.certifications) ? normalized.certifications.map(String) : [],
          raw_text: String(normalized.raw_text || "").slice(0, 50000),
          candidate_summary: String(normalized.candidate_summary || ""),
          seniority_level: seniority,
          functional_area: inferFunctionalArea(normalized),
          processing_status: "created",
          duplicate_status: "unique",
          confirmed: true,
          source_file_name: "chatbot_import",
        };

        const { error: insertErr } = await supabase.from("candidate_profiles").insert(row);
        if (insertErr) {
          failed++;
          errors.push(insertErr.message);
        } else {
          created++;
        }
      } catch (e) {
        failed++;
        errors.push(e instanceof Error ? e.message : "Unknown error");
      }
    }

    // Update import record
    if (importId) {
      await supabase.from("python_imports").update({
        successful_records: created,
        failed_records: failed,
        duplicate_records: 0,
      }).eq("id", importId).catch(() => {);
    }

    let response = `**Import Complete**\n\n- Total records: ${records.length}\n- Created: ${created}\n- Failed: ${failed}`;
    if (errors.length > 0) {
      response += `\n\nErrors: ${errors.slice(0, 3).join("; ")}`;
    }
    if (created > 0) {
      response += `\n\nThe candidates are now in your database. You can search, filter, and ask me questions about them.`;
    }
    return response;
  } catch {
    return null; // Let AI handle it normally
  }
}

function inferFunctionalArea(data: Record<string, unknown>): string {
  const title = String(data.current_title || "").toLowerCase();
  const skills = Array.isArray(data.skills) ? data.skills.join(" ").toLowerCase() : "";
  const text = `${title} ${skills}`;

  const categories: [string, string[]][] = [
    ["Software Engineering", ["software", "developer", "engineer", "frontend", "backend", "fullstack", "react", "python", "java", "typescript"]],
    ["AI / Machine Learning", ["machine learning", "ml", "deep learning", "ai", "nlp", "data scientist", "tensorflow", "pytorch"]],
    ["Data Analytics", ["data analyst", "analytics", "business intelligence", "tableau", "power bi"]],
    ["DevOps / Cloud / SRE", ["devops", "sre", "cloud", "kubernetes", "docker", "aws", "azure", "infrastructure"]],
    ["Cybersecurity", ["security", "cyber", "infosec", "penetration", "vulnerability"]],
    ["Product", ["product manager", "product owner", "product lead"]],
    ["Sales", ["sales", "account executive", "bdr", "sdr", "business development"]],
  ];

  for (const [cat, keywords] of categories) {
    if (keywords.some((kw) => text.includes(kw))) return cat;
  }
  return "Other";
}
// deploy: resumes-chat guarded v2
```

---

## FILE: `supabase/functions/scan-resume-public/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as mammoth from "npm:mammoth@1.8.0";
import { Buffer } from "node:buffer";
import { guardAi, MEDIA_LIMITS } from "../_shared/aiGuard.ts";
import { corsFor } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MODEL = Deno.env.get("OPENAI_RESUME_MODEL") ?? "gpt-4o-mini";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface CandidateAdvice {
  summary: string;
  match_score: number;
  fit_verdict: string;
  experience_highlights: string[];
  top_skills: string[];
  resume_strengths: string[];
  resume_improvements: string[];
  missing_keywords: string[];
  tailoring_tips: string[];
  cover_letter_hook: string;
  interview_prep: string[];
}

Deno.serve(guardAi("scan-resume-public", corsFor, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const form = await req.formData();
    const file = form.get("file");
    const jobDescription = String(form.get("job_description") ?? "").trim();
    const targetRole = String(form.get("target_role") ?? "").trim();

    if (!(file instanceof File)) return json({ error: "Resume file required" }, 400);
    if (file.size > MAX_FILE_BYTES) return json({ error: "Resume must be under 10 MB" }, 400);

    const filename = file.name || "resume.pdf";
    const contentType = file.type || guessContentType(filename);
    const buf = await file.arrayBuffer();

    const systemPrompt = buildSystemPrompt(targetRole, jobDescription);
    const userText = buildUserText(targetRole, jobDescription);

    let resumeText: string;

    if (isWordDoc(filename, contentType)) {
      resumeText = await extractWordText(buf, filename);
    } else if (isPdf(filename, contentType)) {
      resumeText = await extractPdfText(buf, apiKey);
    } else {
      // Plain text
      resumeText = new TextDecoder().decode(buf).slice(0, 18000);
    }

    if (!resumeText.trim()) {
      return json({ error: "Could not extract text from your resume. Try a different file format." }, 400);
    }

    const userContent = `${userText}\n\n--- RESUME TEXT (extracted from ${filename}) ---\n${resumeText}`;

    const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        response_format: {
          type: "json_schema",
          json_schema: { name: "candidate_advice", strict: true, schema: ADVICE_SCHEMA },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      console.error("[scan-resume-public] OpenAI error:", errText);
      throw new Error(`AI analysis failed. Please try again.`);
    }

    const completion = await completionRes.json();
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI returned no content. Please try again.");
    const parsed = JSON.parse(content) as CandidateAdvice;
    sanitize(parsed);

    return json({ ok: true, advice: parsed });
  } catch (err) {
    console.error("[scan-resume-public]", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
}, { rules: MEDIA_LIMITS }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function guessContentType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function isPdf(name: string, contentType: string) {
  return name.toLowerCase().endsWith(".pdf") || contentType === "application/pdf";
}

function isWordDoc(name: string, contentType: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return true;
  if (contentType.includes("officedocument.wordprocessingml") || contentType === "application/msword") return true;
  return false;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

async function extractPdfText(buf: ArrayBuffer, apiKey: string): Promise<string> {
  // Use OpenAI's file upload + assistants approach is unreliable for edge functions.
  // Instead, upload to files API and use the extract endpoint, or fall back to
  // sending the base64 PDF as an image to GPT-4o for text extraction.
  const base64 = toBase64(buf);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Extract ALL text content from this PDF document. Return ONLY the raw text, preserving structure (headings, bullet points, sections). Do not add commentary.",
        },
        {
          role: "user",
          content: [
            {
              type: "file",
              file: { filename: "resume.pdf", file_data: `data:application/pdf;base64,${base64}` },
            },
            { type: "text", text: "Extract all text from this PDF resume." },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    // Fallback: try sending as binary text (works for text-based PDFs)
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const rawText = textDecoder.decode(buf);
    // Extract readable text between common PDF markers
    const readable = rawText
      .split(/[\r\n]+/)
      .filter((line) => /[a-zA-Z]{3,}/.test(line) && !line.startsWith("%") && !line.includes("obj") && !line.includes("endobj"))
      .join("\n")
      .slice(0, 18000);
    if (readable.length > 100) return readable;
    throw new Error("Could not extract text from PDF. Please try uploading a .docx or .txt file instead.");
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("Could not extract text from PDF.");
  return text.slice(0, 18000);
}

async function extractWordText(buf: ArrayBuffer, filename: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf));
    const text = (result?.value ?? "").trim();
    if (!text) throw new Error("Document is empty");
    return text.slice(0, 18000);
  } catch (err) {
    throw new Error(`Could not read ${filename}: ${err instanceof Error ? err.message : "parse error"}`);
  }
}

function sanitize(a: CandidateAdvice) {
  a.match_score = Math.max(0, Math.min(100, Math.round(a.match_score ?? 0)));
  for (const k of [
    "experience_highlights",
    "top_skills",
    "resume_strengths",
    "resume_improvements",
    "missing_keywords",
    "tailoring_tips",
    "interview_prep",
  ] as const) {
    if (!Array.isArray(a[k])) (a[k] as string[]) = [];
    a[k] = (a[k] as string[]).slice(0, 10).map((s) => String(s).trim()).filter(Boolean);
  }
}

function buildSystemPrompt(targetRole: string, jobDescription: string) {
  const hasJd = jobDescription.length > 0;
  const role = targetRole || (hasJd ? "the target role described in the job description" : "the candidate's apparent target role");
  return [
    `You are a senior career coach helping a job seeker improve their resume for ${role}.`,
    `You are advising the CANDIDATE directly, not screening them. Be honest but supportive and constructive.`,
    `Read the resume text carefully. Do not invent facts.`,
    ``,
    `Score "match_score" 0-100: how strong is this resume for the role. 80+ = very strong, 60-79 = solid with tweaks, 40-59 = needs work, below 40 = significant retargeting required.`,
    `"fit_verdict": one short sentence summarizing fit (e.g. "Strong fit for entry-level marketing roles, slightly under-qualified for mid-level openings").`,
    ``,
    `"experience_highlights" (REQUIRED — populate even if the candidate is early-career with only internships/projects):`,
    `  4-8 short bullets highlighting their most impressive items: roles, internships, leadership, projects, awards.`,
    `  Each: one sentence with org, role, dates if present, and the most concrete accomplishment.`,
    ``,
    `"resume_strengths": 3-5 things the resume already does well.`,
    `"resume_improvements": 3-6 actionable, specific edits to make THIS resume stronger (e.g. "Add a metric to the second bullet under ACME — quantify the team size or sales lift").`,
    `"missing_keywords": ${hasJd ? `keywords or skills found in the JD that are missing/weak in the resume.` : `general high-impact keywords for ${role} that are missing.`}`,
    `"tailoring_tips": 3-5 concrete ways to tailor this resume specifically for ${role}.`,
    `"cover_letter_hook": one strong opening line/paragraph the candidate could adapt for a cover letter or LinkedIn message.`,
    `"interview_prep": 4-6 likely interview questions with brief tips on how this candidate should frame their answer based on their actual background.`,
    ``,
    `Write all output in second person where appropriate ("Your resume...", "You should...") so the candidate feels addressed.`,
    `Output JSON exactly matching the schema. Keep each list item one short sentence.`,
  ].join("\n");
}

function buildUserText(targetRole: string, jobDescription: string) {
  const lines: string[] = [];
  if (targetRole) lines.push(`Target role: ${targetRole}`);
  if (jobDescription) {
    lines.push("");
    lines.push("Job description provided by the candidate:");
    lines.push(jobDescription.slice(0, 6000));
  } else if (!targetRole) {
    lines.push("No specific role or JD provided. Infer the candidate's likely target role from the resume and give general advice.");
  }
  lines.push("");
  lines.push("Analyze the resume text below and produce the structured advice for this candidate.");
  return lines.join("\n");
}

const ADVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "match_score",
    "fit_verdict",
    "experience_highlights",
    "top_skills",
    "resume_strengths",
    "resume_improvements",
    "missing_keywords",
    "tailoring_tips",
    "cover_letter_hook",
    "interview_prep",
  ],
  properties: {
    summary: { type: "string" },
    match_score: { type: "integer", minimum: 0, maximum: 100 },
    fit_verdict: { type: "string" },
    experience_highlights: { type: "array", items: { type: "string" }, maxItems: 8 },
    top_skills: { type: "array", items: { type: "string" }, maxItems: 10 },
    resume_strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
    resume_improvements: { type: "array", items: { type: "string" }, maxItems: 6 },
    missing_keywords: { type: "array", items: { type: "string" }, maxItems: 10 },
    tailoring_tips: { type: "array", items: { type: "string" }, maxItems: 6 },
    cover_letter_hook: { type: "string" },
    interview_prep: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
};
// deploy: scan-resume-public guarded v2
```

---

## FILE: `supabase/functions/scan-resume/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as mammoth from "npm:mammoth@1.8.0";
import { Buffer } from "node:buffer";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { fetchStoredFile } from "../_shared/storageFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MODEL = Deno.env.get("OPENAI_RESUME_MODEL") ?? "gpt-4o-mini";
const MAX_TEXT_CHARS = 18000;

interface ScanRequest {
  application_id: string;
}

interface JobApplicationRow {
  id: string;
  job_id: string | null;
  name: string;
  email: string;
  phone: string;
  resume_name: string;
  resume_url: string;
  attachments: { name: string; url: string }[];
  answers: Record<string, string>;
  transcript: { role: string; content: string }[] | null;
}

interface JobRow {
  id: string;
  title: string;
  description: string;
  department: string;
  location: string;
  employment_type: string;
}

interface ScanReport {
  summary: string;
  match_score: number;
  years_experience: number | null;
  experience_highlights: string[];
  top_skills: string[];
  strengths: string[];
  gaps: string[];
  red_flags: string[];
  recommended_questions: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const body = (await req.json()) as ScanRequest;
    if (!body?.application_id) return json({ error: "application_id required" }, 400);
    const isAdmin = (await requireAdmin(req, body as unknown as Record<string, unknown>, corsHeaders)) === null;
    if (!isAdmin) {
      const limited = await enforceRateLimit(req, "scan-resume", corsHeaders);
      if (limited) return limited;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: app, error: appErr } = await db
      .from("job_applications")
      .select("id, job_id, name, email, phone, resume_name, resume_url, attachments, answers, transcript, submitted_at")
      .eq("id", body.application_id)
      .maybeSingle();
    if (appErr) throw appErr;
    if (!app) return json({ error: "Application not found" }, 404);

    // Applicants may scan only their own just-submitted application, once.
    if (!isAdmin) {
      const fresh = Date.now() - new Date(app.submitted_at as string).getTime() < 30 * 60 * 1000;
      const { count } = await db
        .from("resume_scan_reports")
        .select("id", { count: "exact", head: true })
        .eq("application_id", body.application_id);
      if (!fresh || (count ?? 0) > 0) return json({ error: "Not allowed" }, 403);
    }

    const application = app as JobApplicationRow;

    let job: JobRow | null = null;
    if (application.job_id) {
      const { data: jobRow } = await db
        .from("jobs")
        .select("id, title, description, department, location, employment_type")
        .eq("id", application.job_id)
        .maybeSingle();
      job = (jobRow as JobRow) ?? null;
    }

    const { data: pendingReport, error: insertErr } = await db
      .from("resume_scan_reports")
      .insert({
        application_id: application.id,
        job_id: application.job_id,
        status: "pending",
        model: MODEL,
      })
      .select()
      .maybeSingle();
    if (insertErr) throw insertErr;
    const reportId = pendingReport!.id as string;

    try {
      const resumeUrl = application.resume_url;
      if (!resumeUrl) throw new Error("Application has no resume_url");

      const stored = await fetchStoredFile(db, resumeUrl);
      const fileBuf = stored.buf;
      const filename = application.resume_name || "resume.pdf";
      const contentType = stored.contentType || guessContentType(filename);

      // Extract text locally — avoids OpenAI file upload API limitations
      const resumeText = await extractText(fileBuf, filename, contentType, apiKey);

      if (!resumeText.trim()) {
        throw new Error("Could not extract text from the resume. The file may be empty or in an unsupported format.");
      }

      // Extract cover letter text from attachments if present
      let coverLetterText = "";
      if (application.attachments?.length) {
        for (const att of application.attachments) {
          const attName = (att.name || "").toLowerCase();
          if (attName.includes("cover") || attName.includes("letter") || attName.includes("cl_")) {
            try {
              const clFile = await fetchStoredFile(db, att.url);
              {
                const clBuf = clFile.buf;
                const clCt = clFile.contentType || guessContentType(att.name);
                coverLetterText = await extractText(clBuf, att.name, clCt, apiKey);
                if (coverLetterText.length > 6000) coverLetterText = coverLetterText.slice(0, 6000);
              }
            } catch (e) {
              console.warn("[scan-resume] Could not extract cover letter:", e);
            }
            break;
          }
        }
      }

      const systemPrompt = buildSystemPrompt(job);
      const userText = buildUserText(application, job, coverLetterText);
      const userContent = `${userText}\n\n--- RESUME TEXT (extracted from ${filename}) ---\n${resumeText}`;

      const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          response_format: {
            type: "json_schema",
            json_schema: { name: "resume_report", strict: true, schema: REPORT_SCHEMA },
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (!completionRes.ok) {
        const errText = await completionRes.text();
        throw new Error(`OpenAI completion failed (${completionRes.status}): ${errText}`);
      }

      const completion = await completionRes.json();
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned no content");

      const parsed = JSON.parse(content) as ScanReport;
      sanitize(parsed);

      const { data: updated, error: updErr } = await db
        .from("resume_scan_reports")
        .update({
          summary: parsed.summary,
          match_score: parsed.match_score,
          years_experience: parsed.years_experience,
          experience_highlights: parsed.experience_highlights,
          top_skills: parsed.top_skills,
          strengths: parsed.strengths,
          gaps: parsed.gaps,
          red_flags: parsed.red_flags,
          recommended_questions: parsed.recommended_questions,
          raw_response: completion,
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId)
        .select()
        .maybeSingle();
      if (updErr) throw updErr;

      // Log to market intelligence (Rule 14 - aggregate market data)
      try {
        await db.from("market_intelligence").insert({
          job_id: application.job_id,
          job_title: job?.title || "Unknown",
          department: job?.department || "",
          location: job?.location || "",
          candidate_seniority: inferSeniority(parsed.years_experience),
          fit_score: parsed.match_score,
          years_experience: parsed.years_experience,
          skills_offered: parsed.top_skills || [],
          outcome: parsed.match_score >= 70 ? "strong_fit" : parsed.match_score >= 50 ? "potential_fit" : "low_fit",
          source: "resume_scan",
        });
      } catch (e) {
        console.warn("[scan-resume] market intelligence log failed:", e);
      }

      return json({ ok: true, report: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .from("resume_scan_reports")
        .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
        .eq("id", reportId);
      console.error("[scan-resume] failed", message);
      return json({ ok: false, error: message, report_id: reportId }, 500);
    }
  } catch (err) {
    console.error("[scan-resume] error", err);
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function guessContentType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".rtf")) return "application/rtf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function isPdf(name: string, ct: string) {
  return name.toLowerCase().endsWith(".pdf") || ct.includes("pdf");
}

function isWordDoc(name: string, ct: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return true;
  if (ct.includes("officedocument.wordprocessingml") || ct === "application/msword") return true;
  return false;
}

function isRtf(name: string, ct: string) {
  return name.toLowerCase().endsWith(".rtf") || ct.includes("rtf");
}

async function extractText(buf: ArrayBuffer, filename: string, contentType: string, apiKey: string): Promise<string> {
  if (isWordDoc(filename, contentType)) {
    return extractWordText(buf, filename);
  }
  if (isPdf(filename, contentType)) {
    return extractPdfText(buf, apiKey);
  }
  if (isRtf(filename, contentType)) {
    return extractRtfText(buf);
  }
  // Plain text and everything else — decode as UTF-8
  return extractPlainText(buf);
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Chunk to avoid call stack overflow on large files
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

async function extractPdfText(buf: ArrayBuffer, apiKey: string): Promise<string> {
  // Send PDF as base64 inline file to OpenAI — works for text-based and scanned PDFs
  const base64 = toBase64(buf);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Extract ALL text content from this PDF document. Return ONLY the raw text, preserving structure (headings, bullet points, sections). Do not add commentary.",
        },
        {
          role: "user",
          content: [
            {
              type: "file",
              file: { filename: "resume.pdf", file_data: `data:application/pdf;base64,${base64}` },
            },
            { type: "text", text: "Extract all text from this PDF resume." },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    console.warn("[scan-resume] PDF extraction via AI failed, falling back to raw decode");
    return extractPlainText(buf);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) return extractPlainText(buf);
  return text.slice(0, MAX_TEXT_CHARS);
}

async function extractWordText(buf: ArrayBuffer, filename: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    const text = (result?.value ?? "").trim();
    if (!text) throw new Error("Document is empty");
    return text.slice(0, MAX_TEXT_CHARS);
  } catch (err) {
    throw new Error(`Could not read ${filename}: ${err instanceof Error ? err.message : "parse error"}`);
  }
}

function extractRtfText(buf: ArrayBuffer): string {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // Strip RTF control words, groups, and non-printable bytes
  const stripped = raw
    .replace(/\{[^{}]*\}/g, " ")          // remove simple groups
    .replace(/\\[a-z]+\d*\s?/gi, " ")     // remove control words
    .replace(/[\\{}]/g, " ")              // remove remaining braces/backslashes
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length < 50) {
    // Fallback: keep lines with readable words
    return raw
      .split(/[\r\n]+/)
      .filter((l) => /[a-zA-Z]{3,}/.test(l))
      .join("\n")
      .slice(0, MAX_TEXT_CHARS);
  }
  return stripped.slice(0, MAX_TEXT_CHARS);
}

function extractPlainText(buf: ArrayBuffer): string {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // For PDFs that slipped through, filter out binary noise
  const lines = raw.split(/[\r\n]+/).filter((l) => /[a-zA-Z]{3,}/.test(l) && !l.startsWith("%") && !l.includes(">>"));
  const cleaned = lines.join("\n").slice(0, MAX_TEXT_CHARS);
  return cleaned;
}

function sanitize(r: ScanReport) {
  r.match_score = Math.max(0, Math.min(100, Math.round(r.match_score ?? 0)));
  if (typeof r.years_experience !== "number" || isNaN(r.years_experience)) r.years_experience = null;
  for (const k of ["experience_highlights", "top_skills", "strengths", "gaps", "red_flags", "recommended_questions"] as const) {
    if (!Array.isArray(r[k])) (r[k] as string[]) = [];
    r[k] = (r[k] as string[]).slice(0, 10).map((s) => String(s).trim()).filter(Boolean);
  }
}

function inferSeniority(years: number | null): string {
  if (years == null) return "Unknown";
  if (years >= 7) return "Senior";
  if (years >= 4) return "Mid-level";
  if (years >= 2) return "Entry/Junior";
  return "Entry/Junior";
}

function buildSystemPrompt(job: JobRow | null) {
  const role = job ? `${job.title}${job.department ? ` (${job.department})` : ""}` : "an unspecified role";
  return [
    `You are a senior recruiter at Golden Hire performing a screening review of a candidate's resume for ${role}.`,
    `Read the resume text carefully and produce a concise, honest assessment. Do not invent facts that are not in the resume.`,
    `Score the candidate's fit for the role on a 0-100 scale where 0 = not a fit, 50 = borderline, 80+ = strong fit.`,
    `Be specific and concrete. Use the candidate's actual experience, skills, and titles from the resume.`,
    `If a job description is provided, calibrate match_score, strengths, and gaps against it. If not, score against the role title alone.`,
    ``,
    `COVER LETTER SCORING: If a cover letter is provided, factor it into your assessment:`,
    `- Evaluate how well the cover letter addresses specific JD requirements`,
    `- Note claims made in the cover letter and cross-reference with resume evidence`,
    `- A strong, tailored cover letter that demonstrates genuine understanding of the role can boost match_score by up to 5 points`,
    `- A generic or irrelevant cover letter should not penalize but does not help`,
    `- Include cover-letter-specific insights in your recommended_questions (e.g., "You mentioned X in your cover letter -- elaborate on...")`,
    ``,
    `For "years_experience": count only full-time professional roles. Do NOT include internships, fellowships, part-time student roles, or unpaid projects in this number. It is OK and expected for early-career candidates to have 0 years here.`,
    ``,
    `For "experience_highlights" (this field is REQUIRED and MUST NOT be empty if the resume contains any roles, internships, projects, certifications, leadership positions, or awards):`,
    `  - List 4-8 of the candidate's most notable items from the resume, even if years_experience is 0.`,
    `  - Always include internships, fellowships, capstone projects, leadership roles, published work, or awards if present.`,
    `  - Each highlight: one short sentence with company/org, role/title, dates if present, and the most impressive concrete accomplishment or scope.`,
    `  - Example: "Marketing Intern at ACME (Summer 2024) — built sales dashboards used by 12-person leadership team."`,
    `  - This field exists specifically so a 0-years candidate is not dismissed unfairly. Surface what they DID do.`,
    ``,
    `Keep strengths/gaps/red_flags/recommended_questions to short one-sentence items, max 6 each.`,
    `Output JSON that matches the provided schema exactly.`,
  ].join("\n");
}

function buildUserText(app: JobApplicationRow, job: JobRow | null, coverLetterText?: string) {
  const lines: string[] = [];
  lines.push(`Candidate: ${app.name} <${app.email}>`);
  if (app.phone) lines.push(`Phone: ${app.phone}`);
  lines.push("");
  if (job) {
    lines.push(`Role: ${job.title}`);
    if (job.department) lines.push(`Department: ${job.department}`);
    if (job.location) lines.push(`Location: ${job.location}`);
    if (job.employment_type) lines.push(`Type: ${job.employment_type}`);
    lines.push("");
    lines.push("Job description:");
    lines.push(job.description?.slice(0, 4000) ?? "(none)");
  } else {
    lines.push("No specific role attached. Score the resume against general professional fit.");
  }

  if (app.answers && Object.keys(app.answers).length > 0) {
    lines.push("");
    lines.push("Screening answers from candidate:");
    for (const [k, v] of Object.entries(app.answers)) {
      lines.push(`- ${k}: ${v}`);
    }
  }

  if (coverLetterText) {
    lines.push("");
    lines.push("--- COVER LETTER ---");
    lines.push(coverLetterText);
    lines.push("--- END COVER LETTER ---");
  }

  lines.push("");
  lines.push("Analyze the resume text below and produce the structured report.");
  return lines.join("\n");
}

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "match_score",
    "years_experience",
    "experience_highlights",
    "top_skills",
    "strengths",
    "gaps",
    "red_flags",
    "recommended_questions",
  ],
  properties: {
    summary: { type: "string", description: "2-3 sentence executive summary of the candidate." },
    match_score: { type: "integer", minimum: 0, maximum: 100 },
    years_experience: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: 60,
      description: "Full-time professional years only. Internships and student roles are NOT counted here.",
    },
    experience_highlights: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
      description: "Notable roles, internships, projects, leadership, or awards from the resume. Always populated when the resume contains any such items, even if years_experience is 0.",
    },
    top_skills: { type: "array", items: { type: "string" }, maxItems: 10 },
    strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
    gaps: { type: "array", items: { type: "string" }, maxItems: 6 },
    red_flags: { type: "array", items: { type: "string" }, maxItems: 6 },
    recommended_questions: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
} as const;
```

---

## FILE: `supabase/functions/scan-talent-resume/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as mammoth from "npm:mammoth@1.8.0";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { fetchStoredFile } from "../_shared/storageFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MODEL = Deno.env.get("OPENAI_RESUME_MODEL") ?? "gpt-4o-mini";

interface ScanRequest {
  candidate_id: string;
  category_name: string;
}

interface CandidateRow {
  id: string;
  category_id: string;
  name: string;
  email: string;
  phone: string;
  resume_name: string;
  resume_url: string;
}

interface ScanResult {
  summary: string;
  match_score: number;
  years_experience: number | null;
  top_skills: string[];
  strengths: string[];
  gaps: string[];
  experience_highlights: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const body = (await req.json()) as ScanRequest;
    if (!body?.candidate_id) return json({ error: "candidate_id required" }, 400);
    const denied = await requireAdmin(req, body as unknown as Record<string, unknown>, corsHeaders);
    if (denied) return denied;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: candidate, error: candErr } = await db
      .from("talent_candidates")
      .select("id, category_id, name, email, phone, resume_name, resume_url")
      .eq("id", body.candidate_id)
      .maybeSingle();
    if (candErr) throw candErr;
    if (!candidate) return json({ error: "Candidate not found" }, 404);

    const cand = candidate as CandidateRow;
    if (!cand.resume_url) return json({ error: "Candidate has no resume uploaded" }, 400);

    const stored = await fetchStoredFile(db, cand.resume_url);
    const fileBuf = stored.buf;
    const filename = cand.resume_name || "resume.pdf";
    const contentType = stored.contentType || guessContentType(filename);

    const categoryName = body.category_name || "general";

    const systemPrompt = [
      `You are a senior recruiter screening a candidate's resume for a "${categoryName}" role.`,
      `Read the resume carefully and produce an honest assessment.`,
      `Score fit on 0-100 where 0=not a fit, 50=borderline, 80+=strong fit for the ${categoryName} category.`,
      `Be specific and concrete using actual experience from the resume.`,
      `Output JSON matching the provided schema exactly.`,
    ].join("\n");

    const userText = `Candidate: ${cand.name}\nRole category: ${categoryName}\n\nAnalyze the attached resume.`;

    let userContent: unknown;

    if (isWordDoc(filename, contentType)) {
      const text = await extractWordText(fileBuf, filename);
      userContent = [
        { type: "text", text: `${userText}\n\n--- RESUME TEXT ---\n${text}` },
      ];
    } else {
      const uploadForm = new FormData();
      uploadForm.append("purpose", "user_data");
      uploadForm.append("file", new Blob([fileBuf], { type: contentType }), filename);

      const uploadRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: uploadForm,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`OpenAI file upload failed (${uploadRes.status}): ${errText}`);
      }
      const uploadJson = await uploadRes.json();
      const fileId = uploadJson.id as string;

      userContent = [
        { type: "file", file: { file_id: fileId } },
        { type: "text", text: userText },
      ];

      // Cleanup file after we're done (fire and forget)
      setTimeout(() => {
        fetch(`https://api.openai.com/v1/files/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        }).catch(() => {});
      }, 5000);
    }

    const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: { name: "talent_scan", strict: true, schema: SCAN_SCHEMA },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      throw new Error(`OpenAI completion failed (${completionRes.status}): ${errText}`);
    }

    const completion = await completionRes.json();
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content");

    const parsed = JSON.parse(content) as ScanResult;
    parsed.match_score = Math.max(0, Math.min(100, Math.round(parsed.match_score ?? 0)));

    const { data: updated, error: updErr } = await db
      .from("talent_candidates")
      .update({
        scan_summary: parsed.summary,
        match_score: parsed.match_score,
        years_experience: parsed.years_experience,
        top_skills: parsed.top_skills ?? [],
        strengths: parsed.strengths ?? [],
        gaps: parsed.gaps ?? [],
        experience_highlights: parsed.experience_highlights ?? [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", cand.id)
      .select()
      .maybeSingle();
    if (updErr) throw updErr;

    return json({ ok: true, candidate: updated });
  } catch (err) {
    console.error("[scan-talent-resume] error", err);
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function guessContentType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function isWordDoc(name: string, contentType: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return true;
  if (contentType.includes("officedocument.wordprocessingml") || contentType === "application/msword") return true;
  return false;
}

async function extractWordText(buf: ArrayBuffer, filename: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = (result?.value ?? "").trim();
    if (!text) throw new Error("Document is empty");
    return text.slice(0, 18000);
  } catch (err) {
    throw new Error(`Could not read ${filename}: ${err instanceof Error ? err.message : "parse error"}`);
  }
}

const SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "match_score", "years_experience", "top_skills", "strengths", "gaps", "experience_highlights"],
  properties: {
    summary: { type: "string", description: "2-3 sentence summary of the candidate." },
    match_score: { type: "integer", minimum: 0, maximum: 100 },
    years_experience: { type: ["integer", "null"], minimum: 0, maximum: 60 },
    top_skills: { type: "array", items: { type: "string" }, maxItems: 10 },
    strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
    gaps: { type: "array", items: { type: "string" }, maxItems: 6 },
    experience_highlights: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
} as const;
```

---

## FILE: `supabase/functions/upload-resumes/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { guardAi, MEDIA_LIMITS } from "../_shared/aiGuard.ts";
import { corsFor } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_EXTENSIONS = ["pdf", "doc", "docx", "txt", "rtf"];

interface ExtractedFile {
  name: string;
  data: Uint8Array;
  type: string;
  path: string;
}

interface ParsedCandidate {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  resume_summary: string;
  skills: string[];
  education: string;
  experience: { title: string; company: string; duration: string; description: string }[];
  projects: string[];
  certifications: string[];
  links: string[];
  ats_score: number;
  ats_summary: string;
  strengths: string[];
  gaps: string[];
  years_experience: number | null;
}

interface ProcessResult {
  file_name: string;
  status: "created" | "duplicate_skipped" | "failed";
  reason?: string;
  candidate_id?: string;
  full_name?: string;
  email?: string;
  duplicate_of?: string;
}

Deno.serve(guardAi("upload-resumes", corsFor, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const contentType = req.headers.get("content-type") || "";
    let zipFileName = "upload.zip";
    const allFiles: ExtractedFile[] = [];

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const paths: string[] = body.storage_paths || [];
      zipFileName = body.zip_file_name || "upload.zip";

      // Download all files in parallel (batches of 8)
      const DOWNLOAD_BATCH = 8;
      for (let i = 0; i < paths.length; i += DOWNLOAD_BATCH) {
        const batch = paths.slice(i, i + DOWNLOAD_BATCH);
        const downloads = await Promise.allSettled(
          batch.map(async (path) => {
            const { data, error } = await supabase.storage.from("resumes").download(path);
            if (error || !data) return null;
            const buffer = new Uint8Array(await data.arrayBuffer());
            const fileName = path.split("/").pop() || path;
            return { buffer, fileName, path };
          })
        );
        for (const result of downloads) {
          if (result.status !== "fulfilled" || !result.value) continue;
          const { buffer, fileName } = result.value;
          const ext = getExtension(fileName);
          if (ext === "zip" || isZipArchive(buffer)) {
            const extracted = await extractFilesFromZipAsync(buffer);
            console.log(`ZIP "${fileName}": extracted ${extracted.length} valid file(s)`);
            allFiles.push(...extracted);
          } else if (VALID_EXTENSIONS.includes(ext)) {
            allFiles.push({ name: fileName, data: buffer, type: ext, path: fileName });
          }
        }
      }
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      for (const [_key, value] of formData.entries()) {
        if (!(value instanceof File)) continue;
        const buffer = new Uint8Array(await value.arrayBuffer());
        const ext = getExtension(value.name);

        if (ext === "zip" || isZipArchive(buffer)) {
          zipFileName = value.name;
          const extracted = await extractFilesFromZipAsync(buffer);
          console.log(`ZIP "${value.name}": extracted ${extracted.length} valid file(s)`);
          allFiles.push(...extracted);
        } else if (VALID_EXTENSIONS.includes(ext)) {
          allFiles.push({ name: value.name, data: buffer, type: ext, path: value.name });
        }
      }
    } else {
      return json({ ok: false, error: "Expected application/json or multipart/form-data" }, 400);
    }

    const totalFiles = allFiles.length;
    console.log(`Total files to process: ${totalFiles}`);

    if (totalFiles === 0) {
      return json({
        ok: false,
        error: "No valid resume files found. Supported formats inside ZIP or as individual uploads: PDF, DOC, DOCX, TXT, RTF. Ensure your ZIP contains files with these extensions.",
      }, 400);
    }

    // Create batch record
    const { data: batch, error: batchErr } = await supabase
      .from("upload_batches")
      .insert({
        zip_file_name: zipFileName,
        total_files: totalFiles,
        supported_files: totalFiles,
        status: "processing",
      })
      .select("id")
      .single();

    if (batchErr || !batch) {
      console.error("Batch creation error:", batchErr);
      return json({ ok: false, error: "Failed to create upload batch" }, 500);
    }

    const batchId = batch.id;

    // Compute file hashes in parallel
    const fileHashes = new Map<string, string>();
    const hashResults = await Promise.all(
      allFiles.map(async (file) => ({ path: file.path, hash: await computeHash(file.data) }))
    );
    for (const { path, hash } of hashResults) fileHashes.set(path, hash);

    // Load existing hashes and emails for dedup
    const { data: existingProfiles } = await supabase
      .from("candidate_profiles")
      .select("id, file_hash, email, full_name, phone")
      .neq("processing_status", "failed");

    const existingHashes = new Set<string>();
    const existingEmails = new Map<string, string>();
    const existingNamePhone = new Map<string, string>();

    if (existingProfiles) {
      for (const p of existingProfiles) {
        if (p.file_hash) existingHashes.add(p.file_hash);
        if (p.email) existingEmails.set(p.email.toLowerCase().trim(), p.id);
        if (p.full_name && p.phone) {
          existingNamePhone.set(normalizeName(p.full_name) + "|" + normalizePhone(p.phone), p.id);
        }
      }
    }

    // Track within this batch for intra-batch dedup
    const batchHashes = new Set<string>();
    const batchEmails = new Map<string, string>();
    const batchNamePhone = new Map<string, string>();

    const results: ProcessResult[] = [];
    let profilesCreated = 0;
    let duplicatesSkipped = 0;
    let failures = 0;

    // Phase 1: Hash dedup (fast, no IO)
    const hashDuplicates = new Set<number>();
    for (let i = 0; i < allFiles.length; i++) {
      const fileHash = fileHashes.get(allFiles[i].path) || "";
      if (fileHash && (existingHashes.has(fileHash) || batchHashes.has(fileHash))) {
        hashDuplicates.add(i);
        duplicatesSkipped++;
        results.push({ file_name: allFiles[i].name, status: "duplicate_skipped", reason: "Identical file already exists" });
      } else if (fileHash) {
        batchHashes.add(fileHash);
      }
    }

    // Insert hash duplicate records in parallel
    const dupInserts = Array.from(hashDuplicates).map((i) =>
      supabase.from("candidate_profiles").insert({
        batch_id: batchId,
        source_zip_name: zipFileName,
        source_file_name: allFiles[i].name,
        file_hash: fileHashes.get(allFiles[i].path),
        duplicate_status: "duplicate_hash",
        processing_status: "duplicate_skipped",
        full_name: cleanFileName(allFiles[i].name),
      })
    );
    await Promise.allSettled(dupInserts);

    // Phase 2: Extract text + AI parse in parallel for non-duplicate files
    const filesToProcess = allFiles
      .map((file, i) => ({ file, index: i, hash: fileHashes.get(file.path) || "" }))
      .filter(({ index }) => !hashDuplicates.has(index));

    // Process in parallel batches of 5 (AI rate limits)
    const AI_BATCH = 5;
    interface ParsedFile {
      file: ExtractedFile;
      hash: string;
      rawText: string;
      parsed: ParsedCandidate | null;
      error?: string;
    }
    const parsedFiles: ParsedFile[] = [];

    for (let i = 0; i < filesToProcess.length; i += AI_BATCH) {
      const batch = filesToProcess.slice(i, i + AI_BATCH);
      const batchResults = await Promise.allSettled(
        batch.map(async ({ file, hash }): Promise<ParsedFile> => {
          const rawText = await extractText(file);
          if (rawText.length < 20) {
            return { file, hash, rawText, parsed: null, error: "No readable text extracted" };
          }
          let parsed: ParsedCandidate | null = null;
          if (geminiKey) parsed = await parseResumeGemini(rawText, geminiKey);
          if (!parsed && openaiKey) parsed = await parseResumeAI(rawText, openaiKey);
          if (!parsed) parsed = parseResumeFallback(rawText, file.name);
          return { file, hash, rawText, parsed };
        })
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled") parsedFiles.push(r.value);
        else {
          failures++;
          results.push({ file_name: "unknown", status: "failed", reason: "Processing error" });
        }
      }
    }

    // Phase 3: Identity dedup + storage upload + DB insert (sequential for dedup correctness, but storage uploads batched)
    for (const pf of parsedFiles) {
      const { file, hash: fileHash, rawText, parsed, error } = pf;

      if (!parsed || error) {
        await supabase.from("candidate_profiles").insert({
          batch_id: batchId, source_zip_name: zipFileName, source_file_name: file.name,
          file_hash: fileHash, processing_status: "failed",
          failure_reason: error || "AI parsing failed", full_name: cleanFileName(file.name),
        });
        failures++;
        results.push({ file_name: file.name, status: "failed", reason: error || "AI parsing failed" });
        continue;
      }

      // Identity dedup
      const candidateEmail = parsed.email.toLowerCase().trim();
      const candidateNameNorm = normalizeName(parsed.full_name);
      const candidatePhoneNorm = normalizePhone(parsed.phone);

      let isDuplicate = false;
      let duplicateOf = "";
      let duplicateReason = "";

      if (candidateEmail) {
        const existingId = existingEmails.get(candidateEmail) || batchEmails.get(candidateEmail);
        if (existingId) { isDuplicate = true; duplicateOf = existingId; duplicateReason = `Duplicate email: ${candidateEmail}`; }
      }
      if (!isDuplicate && candidateNameNorm && candidatePhoneNorm) {
        const key = candidateNameNorm + "|" + candidatePhoneNorm;
        const existingId = existingNamePhone.get(key) || batchNamePhone.get(key);
        if (existingId) { isDuplicate = true; duplicateOf = existingId; duplicateReason = `Duplicate name+phone: ${parsed.full_name}`; }
      }

      if (isDuplicate) {
        await supabase.from("candidate_profiles").insert({
          batch_id: batchId, source_zip_name: zipFileName, source_file_name: file.name,
          file_hash: fileHash, full_name: parsed.full_name, email: parsed.email, phone: parsed.phone,
          duplicate_status: "duplicate_identity", processing_status: "duplicate_skipped", failure_reason: duplicateReason,
        });
        duplicatesSkipped++;
        results.push({ file_name: file.name, status: "duplicate_skipped", reason: duplicateReason, full_name: parsed.full_name, email: parsed.email, duplicate_of: duplicateOf });
        continue;
      }

      // Upload file to permanent storage
      const timestamp = Date.now() + Math.floor(Math.random() * 10000);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `candidate-resumes/${batchId}/${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from("resumes").upload(storagePath, file.data, {
        cacheControl: "3600", upsert: false, contentType: getMimeType(file.type),
      });
      let fileUrl = "";
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from("resumes").getPublicUrl(storagePath);
        fileUrl = urlData.publicUrl;
      }

      // Insert candidate profile
      const { data: profile, error: insertErr } = await supabase.from("candidate_profiles").insert({
        batch_id: batchId, full_name: parsed.full_name || "Unknown", email: parsed.email,
        phone: parsed.phone, location: parsed.location, resume_summary: parsed.resume_summary,
        skills: parsed.skills, education: parsed.education, experience: parsed.experience,
        projects: parsed.projects, certifications: parsed.certifications, links: parsed.links,
        ats_score: parsed.ats_score, ats_summary: parsed.ats_summary, strengths: parsed.strengths,
        gaps: parsed.gaps, years_experience: parsed.years_experience,
        source_zip_name: zipFileName, source_file_name: file.name, resume_file_url: fileUrl,
        file_hash: fileHash, raw_text: rawText.substring(0, 50000),
        duplicate_status: "unique", processing_status: "created", confirmed: false,
      }).select("id").single();

      if (insertErr || !profile) {
        failures++;
        results.push({ file_name: file.name, status: "failed", reason: insertErr?.message || "DB insert failed" });
        continue;
      }

      // Insert resume_files record (fire and forget)
      supabase.from("resume_files").insert({
        candidate_id: profile.id, batch_id: batchId, file_name: file.name,
        file_url: fileUrl, file_type: file.type, file_size: file.data.length, file_hash: fileHash,
      }).then(() => {});

      // Track for intra-batch dedup
      if (candidateEmail) batchEmails.set(candidateEmail, profile.id);
      if (candidateNameNorm && candidatePhoneNorm) batchNamePhone.set(candidateNameNorm + "|" + candidatePhoneNorm, profile.id);

      profilesCreated++;
      results.push({ file_name: file.name, status: "created", candidate_id: profile.id, full_name: parsed.full_name, email: parsed.email });
      console.log(`CREATED: ${file.name} -> ${parsed.full_name}`);
    }

    // Update batch with final stats
    await supabase.from("upload_batches").update({
      profiles_created: profilesCreated,
      duplicates_skipped: duplicatesSkipped,
      failures,
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", batchId);

    return json({
      ok: true,
      batch_id: batchId,
      summary: {
        total_files: totalFiles,
        supported_resumes: totalFiles,
        profiles_created: profilesCreated,
        duplicates_skipped: duplicatesSkipped,
        failed: failures,
      },
      results,
    });
  } catch (error) {
    console.error("upload-resumes fatal error:", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}, { rules: MEDIA_LIMITS }));

// --- Zip Extraction (native, no npm dependency) ---

async function extractFilesFromZipAsync(data: Uint8Array): Promise<ExtractedFile[]> {
  const files: ExtractedFile[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  try {
    while (offset < data.length - 30) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;

      const compressionMethod = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const uncompressedSize = view.getUint32(offset + 22, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraFieldLen = view.getUint16(offset + 28, true);

      const fileNameBytes = data.slice(offset + 30, offset + 30 + fileNameLen);
      const filePath = new TextDecoder().decode(fileNameBytes);

      const dataStart = offset + 30 + fileNameLen + extraFieldLen;
      const dataEnd = dataStart + compressedSize;
      offset = dataEnd;

      // Skip directories and system files
      if (filePath.endsWith("/")) continue;
      if (filePath.includes("__MACOSX")) continue;
      if (filePath.includes(".DS_Store")) continue;
      if (filePath.includes("Thumbs.db")) continue;
      const baseName = filePath.split("/").pop() || "";
      if (!baseName || baseName.startsWith(".") || baseName.startsWith("~")) continue;

      const ext = getExtension(baseName);
      if (!VALID_EXTENSIONS.includes(ext)) continue;

      const compressedData = data.slice(dataStart, dataEnd);
      let fileData: Uint8Array;

      if (compressionMethod === 0) {
        // Stored (uncompressed)
        fileData = compressedData;
      } else if (compressionMethod === 8) {
        // Deflate - use native DecompressionStream
        try {
          fileData = await inflateWithStream(compressedData, uncompressedSize);
        } catch (e) {
          console.error(`Deflate failed for ${baseName}:`, e);
          continue;
        }
      } else {
        console.log(`Skipping ${baseName}: unsupported compression method ${compressionMethod}`);
        continue;
      }

      if (fileData.length === 0) continue;
      files.push({ name: baseName, data: fileData, type: ext, path: baseName });
    }
  } catch (err) {
    console.error("ZIP parsing error:", err);
  }

  return files;
}

async function inflateWithStream(compressed: Uint8Array, _expectedSize: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const writePromise = writer.write(compressed).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  await writePromise;

  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function isZipArchive(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  return data[0] === 0x50 && data[1] === 0x4B && data[2] === 0x03 && data[3] === 0x04;
}

// --- Text Extraction ---

async function extractText(file: ExtractedFile): Promise<string> {
  try {
    if (file.type === "txt" || file.type === "rtf") {
      let text = new TextDecoder().decode(file.data);
      if (file.type === "rtf") {
        text = stripRtf(text);
      }
      return text.trim();
    }

    if (file.type === "pdf") {
      return extractPdfText(file.data);
    }

    if (file.type === "docx") {
      return await extractDocxText(file.data);
    }

    if (file.type === "doc") {
      return extractDocText(file.data);
    }
  } catch (err) {
    console.error(`Text extraction error for ${file.name}:`, err);
  }

  return "";
}

function stripRtf(rtf: string): string {
  const text = rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\[^{}]*\}/g, "")
    .replace(/\\[a-z]+\d*\s?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\\'([0-9a-f]{2})/gi, (_m: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function extractPdfText(data: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(data);
  const textParts: string[] = [];

  // Extract text from PDF streams using simple bracket matching
  const streamMatches = raw.split("stream");
  for (let i = 1; i < streamMatches.length; i++) {
    const endIdx = streamMatches[i].indexOf("endstream");
    if (endIdx === -1) continue;
    const stream = streamMatches[i].substring(0, endIdx);

    // Extract text between parentheses (Tj/TJ operators)
    let bracketDepth = 0;
    let current = "";
    for (let j = 0; j < stream.length; j++) {
      const ch = stream[j];
      if (ch === "(" && (j === 0 || stream[j - 1] !== "\\")) {
        if (bracketDepth === 0) current = "";
        bracketDepth++;
      } else if (ch === ")" && stream[j - 1] !== "\\") {
        bracketDepth--;
        if (bracketDepth === 0 && current.trim().length > 0) {
          const cleaned = current
            .replace(/\\050/g, "(")
            .replace(/\\051/g, ")")
            .replace(/\\134/g, "\\")
            .replace(/\\([0-7]{3})/g, (_m: string, oct: string) => String.fromCharCode(parseInt(oct, 8)));
          textParts.push(cleaned);
        }
      } else if (bracketDepth > 0) {
        current += ch;
      }
    }
  }

  // If bracket extraction got meaningful text
  if (textParts.length >= 5) {
    return textParts.join(" ").substring(0, 20000);
  }

  // Fallback: extract any readable ASCII sequences
  const readable = raw
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s{4,}/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 3 && /[a-zA-Z]{2,}/.test(line.trim()))
    .join("\n");

  return readable.substring(0, 20000);
}

async function extractDocxText(data: Uint8Array): Promise<string> {
  try {
    const xmlContent = await extractFileFromDocx(data, "word/document.xml");
    if (!xmlContent) return extractDocText(data);

    const xmlText = new TextDecoder().decode(xmlContent);
    return xmlText
      .replace(/<w:p[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return extractDocText(data);
  }
}

async function extractFileFromDocx(data: Uint8Array, targetPath: string): Promise<Uint8Array | null> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  try {
    while (offset < data.length - 30) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;

      const compressionMethod = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const uncompressedSize = view.getUint32(offset + 22, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraFieldLen = view.getUint16(offset + 28, true);

      const fileNameBytes = data.slice(offset + 30, offset + 30 + fileNameLen);
      const fileName = new TextDecoder().decode(fileNameBytes);

      const dataStart = offset + 30 + fileNameLen + extraFieldLen;
      const dataEnd = dataStart + compressedSize;
      offset = dataEnd;

      if (fileName === targetPath || fileName.endsWith("/" + targetPath)) {
        if (compressionMethod === 0) {
          return data.slice(dataStart, dataEnd);
        } else if (compressionMethod === 8) {
          return await inflateWithStream(data.slice(dataStart, dataEnd), uncompressedSize);
        }
      }
    }
  } catch (err) {
    console.error("DOCX ZIP extraction error:", err);
  }

  return null;
}

function extractDocText(data: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(data);
  return raw
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s{4,}/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 3 && /[a-zA-Z]{2,}/.test(line.trim()))
    .join("\n")
    .substring(0, 20000);
}

// --- AI Parsing ---

const EXTRACTION_MODEL = "gemini-2.5-flash-lite-preview-06-17";

const PARSE_PROMPT = `You are an expert ATS (Applicant Tracking System) resume parser and grader. You have two jobs:

1. EXTRACT structured data from the resume text accurately.
2. GRADE the resume quality on a 0-100 scale like an ATS scanner would.

CRITICAL RULES FOR NAME EXTRACTION:
- The candidate's full name is almost ALWAYS the very first line or heading of the resume.
- It is typically in a larger font, bold, or standalone at the top.
- Do NOT confuse company names, job titles, or section headers with the person's name.
- Look for a proper noun (First Last or First Middle Last) at the very beginning.
- The name should be 2-4 words, all proper nouns, no numbers, no special characters.

ATS SCORING CRITERIA (0-100):
- 90-100: Exceptional - clear formatting, strong quantified achievements, relevant skills, consistent employment
- 75-89: Strong - well-organized, good experience descriptions, relevant skills listed
- 60-74: Average - adequate information but lacks specifics, some formatting issues
- 40-59: Below average - missing key sections, vague descriptions, gaps unexplained
- 0-39: Poor - very sparse, unreadable, or severely lacking content

Score based on: completeness of contact info, clear work history with dates, quantified achievements, relevant skills section, education details, professional formatting, no unexplained gaps.

Return ONLY valid JSON with no markdown fences.`;

async function parseResumeGemini(text: string, apiKey: string): Promise<ParsedCandidate | null> {
  try {
    const userPrompt = `Parse and grade this resume. Return JSON with these exact fields:
{
  "full_name": "Person's actual full name from the top of the resume",
  "email": "",
  "phone": "",
  "location": "",
  "resume_summary": "2-3 sentence professional summary of this candidate",
  "skills": [],
  "education": "Degree, school, year if available",
  "experience": [{"title":"","company":"","duration":"","description":""}],
  "projects": [],
  "certifications": [],
  "links": ["only plain URL strings like https://..."],
  "ats_score": 0,
  "ats_summary": "One sentence explaining the score",
  "strengths": ["2-4 key strengths"],
  "gaps": ["1-3 concerns or missing items"],
  "years_experience": null
}

Rules:
- full_name: MUST be the person's real name from the FIRST LINE.
- ats_score: Integer 0-100 based on ATS criteria above
- years_experience: Count only full-time professional roles (integer or null)
- links: MUST be plain URL strings only
- experience: Include all roles found. description should mention key achievements.
- skills: Individual skill names as separate strings

RESUME TEXT:
${text.substring(0, 12000)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EXTRACTION_MODEL}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PARSE_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!res.ok) {
      console.error("Gemini extraction error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return normalizeParsed(parsed);
  } catch (err) {
    console.error("Gemini parse error:", err);
    return null;
  }
}

async function parseResumeAI(text: string, apiKey: string): Promise<ParsedCandidate | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: `You are an expert ATS (Applicant Tracking System) resume parser and grader. You have two jobs:

1. EXTRACT structured data from the resume text accurately.
2. GRADE the resume quality on a 0-100 scale like an ATS scanner would.

CRITICAL RULES FOR NAME EXTRACTION:
- The candidate's full name is almost ALWAYS the very first line or heading of the resume.
- It is typically in a larger font, bold, or standalone at the top.
- Do NOT confuse company names, job titles, or section headers with the person's name.
- Look for a proper noun (First Last or First Middle Last) at the very beginning.
- If the text starts with something like "JOHN DOE" or "Jane Smith" on its own line, that is the name.
- The name should be 2-4 words, all proper nouns, no numbers, no special characters.

ATS SCORING CRITERIA (0-100):
- 90-100: Exceptional - clear formatting, strong quantified achievements, relevant skills, consistent employment
- 75-89: Strong - well-organized, good experience descriptions, relevant skills listed
- 60-74: Average - adequate information but lacks specifics, some formatting issues
- 40-59: Below average - missing key sections, vague descriptions, gaps unexplained
- 0-39: Poor - very sparse, unreadable, or severely lacking content

Score based on: completeness of contact info, clear work history with dates, quantified achievements, relevant skills section, education details, professional formatting, no unexplained gaps.

Return ONLY valid JSON with no markdown fences.`,
          },
          {
            role: "user",
            content: `Parse and grade this resume. Return JSON with these exact fields:
{
  "full_name": "Person's actual full name from the top of the resume",
  "email": "",
  "phone": "",
  "location": "",
  "resume_summary": "2-3 sentence professional summary of this candidate",
  "skills": [],
  "education": "Degree, school, year if available",
  "experience": [{"title":"","company":"","duration":"","description":""}],
  "projects": [],
  "certifications": [],
  "links": ["only plain URL strings like https://..."],
  "ats_score": 0,
  "ats_summary": "One sentence explaining the score",
  "strengths": ["2-4 key strengths"],
  "gaps": ["1-3 concerns or missing items"],
  "years_experience": null
}

Rules:
- full_name: MUST be the person's real name. Look at the FIRST LINE. It is NOT a company name or job title.
- ats_score: Integer 0-100 based on ATS criteria above
- years_experience: Count only full-time professional roles (integer or null if unclear)
- links: MUST be plain URL strings only, never objects. Example: ["https://linkedin.com/in/name"]
- experience: Include all roles found. description should mention key achievements.
- skills: Individual skill names as separate strings

RESUME TEXT:
${text.substring(0, 10000)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("OpenAI API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return normalizeParsed(parsed);
  } catch (err) {
    console.error("AI parse error:", err);
    return null;
  }
}

function normalizeParsed(parsed: Record<string, unknown>): ParsedCandidate {
  return {
    full_name: String(parsed.full_name || "").trim(),
    email: String(parsed.email || "").trim(),
    phone: String(parsed.phone || "").trim(),
    location: String(parsed.location || "").trim(),
    resume_summary: String(parsed.resume_summary || "").trim(),
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
    education: String(parsed.education || "").trim(),
    experience: Array.isArray(parsed.experience) ? parsed.experience : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects.map(String) : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications.map(String) : [],
    links: Array.isArray(parsed.links) ? parsed.links.map((l: unknown) => {
      if (typeof l === "string") return l;
      if (l && typeof l === "object") {
        const obj = l as Record<string, unknown>;
        return String(obj.url || obj.href || obj.link || "");
      }
      return "";
    }).filter(Boolean) : [],
    ats_score: typeof parsed.ats_score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.ats_score))) : 0,
    ats_summary: String(parsed.ats_summary || "").trim(),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
    years_experience: typeof parsed.years_experience === "number" ? parsed.years_experience : null,
  };
}

function parseResumeFallback(text: string, fileName: string): ParsedCandidate {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Name extraction: look at the first few non-empty lines for a proper name
  let name = "";
  const skipWords = ["resume", "curriculum", "vitae", "cv", "objective", "summary", "profile", "contact", "address", "phone", "email"];
  for (const line of lines.slice(0, 10)) {
    const cleaned = line.replace(/[^a-zA-Z\s'.-]/g, "").trim();
    if (cleaned.length < 3 || cleaned.length > 50) continue;
    const lower = cleaned.toLowerCase();
    if (skipWords.some((w) => lower.includes(w))) continue;
    const words = cleaned.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    // Each word should start with uppercase (proper noun pattern)
    if (words.every((w) => /^[A-Z]/.test(w) && w.length >= 2)) {
      name = cleaned;
      break;
    }
  }

  if (!name) {
    name = cleanFileName(fileName);
  }

  return {
    full_name: name,
    email: emailMatch?.[0] || "",
    phone: phoneMatch?.[0] || "",
    location: "",
    resume_summary: "",
    skills: [],
    education: "",
    experience: [],
    projects: [],
    certifications: [],
    links: [],
    ats_score: 0,
    ats_summary: "Could not grade - AI parsing unavailable",
    strengths: [],
    gaps: [],
    years_experience: null,
  };
}

// --- Utilities ---

async function computeHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "").trim();
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

function getExtension(filename: string): string {
  return (filename.split(".").pop() || "").toLowerCase();
}

function cleanFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/^\d{10,}-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\d{8,}/g, "")
    .trim();
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    rtf: "application/rtf",
  };
  return map[ext] || "application/octet-stream";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
// deploy: upload-resumes guarded v2
```

---

## FILE: `supabase/migrations/20260513173211_add_resume_scan_reports.sql`

```sql
/*
  # Resume scan reports (OpenAI-powered)

  1. New Tables
    - `resume_scan_reports` — stores AI analysis of an applicant's resume.
      - `id` (uuid, pk)
      - `application_id` (uuid, FK -> job_applications.id, ON DELETE CASCADE) — the application this report is for
      - `job_id` (uuid, FK -> jobs.id, nullable, ON DELETE SET NULL) — denormalized for fast filtering
      - `summary` (text) — a 2-3 sentence executive summary of the candidate
      - `match_score` (integer) — 0-100 fit score for the role
      - `years_experience` (integer, nullable) — total professional years detected
      - `top_skills` (jsonb) — array of strings of the candidate's strongest skills
      - `strengths` (jsonb) — array of strings: relevant strengths for this role
      - `gaps` (jsonb) — array of strings: notable gaps or risks vs the role
      - `red_flags` (jsonb) — array of strings: anything to flag (e.g. job hopping, missing required tech)
      - `recommended_questions` (jsonb) — array of strings: targeted follow-up questions
      - `model` (text) — the model used (e.g. gpt-4o-mini)
      - `raw_response` (jsonb) — the full structured response for auditing
      - `status` (text) — 'pending' | 'completed' | 'failed'
      - `error` (text, nullable) — error message if status='failed'
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - RLS enabled.
    - Anyone (anon + authenticated) may SELECT/INSERT/UPDATE/DELETE — matches the existing admin pattern in this codebase where /jobposter uses the anon key.

  3. Notes
    - One report per application is the typical pattern, but the table allows multiples (rescans). Latest is determined by created_at DESC.
*/

CREATE TABLE IF NOT EXISTS resume_scan_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  summary text NOT NULL DEFAULT '',
  match_score integer NOT NULL DEFAULT 0,
  years_experience integer,
  top_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  red_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT '',
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_scan_reports_application
  ON resume_scan_reports (application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_scan_reports_job
  ON resume_scan_reports (job_id, created_at DESC);

ALTER TABLE resume_scan_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='resume_scan_reports' AND policyname='Public can view resume scan reports') THEN
    CREATE POLICY "Public can view resume scan reports"
      ON resume_scan_reports FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='resume_scan_reports' AND policyname='Anyone can insert resume scan reports') THEN
    CREATE POLICY "Anyone can insert resume scan reports"
      ON resume_scan_reports FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='resume_scan_reports' AND policyname='Anyone can update resume scan reports') THEN
    CREATE POLICY "Anyone can update resume scan reports"
      ON resume_scan_reports FOR UPDATE
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='resume_scan_reports' AND policyname='Anyone can delete resume scan reports') THEN
    CREATE POLICY "Anyone can delete resume scan reports"
      ON resume_scan_reports FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
```

---

## FILE: `supabase/migrations/20260527033146_create_resumes_bank_table.sql`

```sql
/*
  # Create unified resumes bank table

  1. New Tables
    - `resumes`
      - `id` (uuid, primary key)
      - `name` (text) - candidate name extracted from resume
      - `email` (text) - candidate email if found
      - `phone` (text) - candidate phone if found
      - `file_name` (text) - original file name
      - `file_url` (text) - URL in storage
      - `file_type` (text) - pdf, doc, docx etc
      - `file_size` (integer) - file size in bytes
      - `raw_text` (text) - extracted text content from resume
      - `summary` (text) - AI-generated summary
      - `skills` (text[]) - extracted skills
      - `experience_years` (integer) - years of experience
      - `education` (text) - education summary
      - `highlights` (text[]) - key highlights
      - `category_tag` (text) - user-assigned category/title tag
      - `match_notes` (text) - notes about job matches
      - `source` (text) - where resume came from: upload, zip, application
      - `status` (text) - new, reviewed, shortlisted, archived
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `resumes` table
    - Add policy for admin access via is_admin_request function
*/

CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_url text DEFAULT '',
  file_type text DEFAULT '',
  file_size integer DEFAULT 0,
  raw_text text DEFAULT '',
  summary text DEFAULT '',
  skills text[] DEFAULT '{}',
  experience_years integer,
  education text DEFAULT '',
  highlights text[] DEFAULT '{}',
  category_tag text DEFAULT '',
  match_notes text DEFAULT '',
  source text DEFAULT 'upload',
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can select resumes"
  ON resumes FOR SELECT
  TO anon
  USING (public.is_admin_request());

CREATE POLICY "Admin can insert resumes"
  ON resumes FOR INSERT
  TO anon
  WITH CHECK (public.is_admin_request());

CREATE POLICY "Admin can update resumes"
  ON resumes FOR UPDATE
  TO anon
  USING (public.is_admin_request())
  WITH CHECK (public.is_admin_request());

CREATE POLICY "Admin can delete resumes"
  ON resumes FOR DELETE
  TO anon
  USING (public.is_admin_request());
```

---

## FILE: `supabase/migrations/20260527151542_create_candidate_profiles_and_upload_batches.sql`

```sql
/*
  # Create candidate profiles, resume files, and upload batches tables

  1. New Tables
    - `upload_batches`
      - `id` (uuid, primary key)
      - `zip_file_name` (text) - original ZIP filename
      - `total_files` (int) - total files found in ZIP
      - `supported_files` (int) - files with valid extensions
      - `profiles_created` (int) - successfully created profiles
      - `duplicates_skipped` (int) - skipped due to dedup
      - `failures` (int) - failed to process
      - `status` (text) - pending, processing, completed, failed
      - `created_at` (timestamptz)
      - `completed_at` (timestamptz)

    - `candidate_profiles`
      - `id` (uuid, primary key)
      - `batch_id` (uuid, FK to upload_batches)
      - `full_name` (text)
      - `email` (text)
      - `phone` (text)
      - `location` (text)
      - `resume_summary` (text)
      - `skills` (text[])
      - `education` (text)
      - `experience` (jsonb) - array of work experience objects
      - `projects` (text[])
      - `certifications` (text[])
      - `links` (text[])
      - `source_zip_name` (text)
      - `source_file_name` (text)
      - `resume_file_url` (text)
      - `file_hash` (text) - SHA-256 hash for dedup
      - `duplicate_status` (text) - unique, duplicate_hash, duplicate_identity
      - `processing_status` (text) - processing, created, duplicate_skipped, failed
      - `failure_reason` (text)
      - `raw_text` (text) - extracted resume text
      - `confirmed` (boolean) - whether user confirmed the profile
      - `created_at` (timestamptz)

    - `resume_files`
      - `id` (uuid, primary key)
      - `candidate_id` (uuid, FK to candidate_profiles)
      - `batch_id` (uuid, FK to upload_batches)
      - `file_name` (text)
      - `file_url` (text)
      - `file_type` (text)
      - `file_size` (int)
      - `file_hash` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Admin token policies for all CRUD operations
*/

-- Upload Batches
CREATE TABLE IF NOT EXISTS upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_file_name text NOT NULL DEFAULT '',
  total_files int NOT NULL DEFAULT 0,
  supported_files int NOT NULL DEFAULT 0,
  profiles_created int NOT NULL DEFAULT 0,
  duplicates_skipped int NOT NULL DEFAULT 0,
  failures int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage upload_batches"
  ON upload_batches FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Candidate Profiles
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  location text DEFAULT '',
  resume_summary text DEFAULT '',
  skills text[] DEFAULT '{}',
  education text DEFAULT '',
  experience jsonb DEFAULT '[]',
  projects text[] DEFAULT '{}',
  certifications text[] DEFAULT '{}',
  links text[] DEFAULT '{}',
  source_zip_name text DEFAULT '',
  source_file_name text DEFAULT '',
  resume_file_url text DEFAULT '',
  file_hash text DEFAULT '',
  duplicate_status text NOT NULL DEFAULT 'unique',
  processing_status text NOT NULL DEFAULT 'processing',
  failure_reason text DEFAULT '',
  raw_text text DEFAULT '',
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage candidate_profiles"
  ON candidate_profiles FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow anon access for edge function service role operations
CREATE POLICY "Service role can manage candidate_profiles"
  ON candidate_profiles FOR ALL
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.is_admin_request()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.is_admin_request()
    )
  );

CREATE POLICY "Service role can manage upload_batches"
  ON upload_batches FOR ALL
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.is_admin_request()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.is_admin_request()
    )
  );

-- Resume Files
CREATE TABLE IF NOT EXISTS resume_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL,
  file_name text NOT NULL DEFAULT '',
  file_url text DEFAULT '',
  file_type text DEFAULT '',
  file_size int DEFAULT 0,
  file_hash text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE resume_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage resume_files"
  ON resume_files FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage resume_files"
  ON resume_files FOR ALL
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.is_admin_request()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.is_admin_request()
    )
  );

-- Index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_file_hash ON candidate_profiles(file_hash) WHERE file_hash != '';
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_email ON candidate_profiles(email) WHERE email != '';
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_batch_id ON candidate_profiles(batch_id);
```

---

## FILE: `supabase/migrations/20260527194718_add_ats_score_to_candidate_profiles.sql`

```sql
/*
  # Add ATS scoring fields to candidate profiles

  1. Modified Tables
    - `candidate_profiles`
      - `ats_score` (integer, 0-100) - ATS quality/readiness score
      - `ats_summary` (text) - brief AI-generated assessment
      - `strengths` (text[]) - key strengths identified
      - `gaps` (text[]) - areas of concern or missing info
      - `years_experience` (integer) - estimated years of professional experience

  2. Important Notes
    - These fields enable ATS-style grading during bulk resume uploads
    - Scores are generated by AI during the upload-resumes edge function
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidate_profiles' AND column_name = 'ats_score'
  ) THEN
    ALTER TABLE candidate_profiles ADD COLUMN ats_score integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidate_profiles' AND column_name = 'ats_summary'
  ) THEN
    ALTER TABLE candidate_profiles ADD COLUMN ats_summary text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidate_profiles' AND column_name = 'strengths'
  ) THEN
    ALTER TABLE candidate_profiles ADD COLUMN strengths text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidate_profiles' AND column_name = 'gaps'
  ) THEN
    ALTER TABLE candidate_profiles ADD COLUMN gaps text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidate_profiles' AND column_name = 'years_experience'
  ) THEN
    ALTER TABLE candidate_profiles ADD COLUMN years_experience integer DEFAULT NULL;
  END IF;
END $$;
```

---

## FILE: `supabase/migrations/20260611142037_add_enrichment_columns_to_candidate_profiles.sql`

```sql
-- Add richer profile columns to candidate_profiles for parsed resume data

ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS current_title text DEFAULT '',
  ADD COLUMN IF NOT EXISTS years_experience int,
  ADD COLUMN IF NOT EXISTS linkedin text DEFAULT '',
  ADD COLUMN IF NOT EXISTS portfolio_github text DEFAULT '',
  ADD COLUMN IF NOT EXISTS industries text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS employers text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS employment_timeline jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS technical_skills text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS soft_skills text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS security_clearances text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_authorization text DEFAULT '',
  ADD COLUMN IF NOT EXISTS seniority_level text DEFAULT '',
  ADD COLUMN IF NOT EXISTS functional_area text DEFAULT '',
  ADD COLUMN IF NOT EXISTS candidate_summary text DEFAULT '',
  ADD COLUMN IF NOT EXISTS career_narrative text DEFAULT '',
  ADD COLUMN IF NOT EXISTS leadership_indicators jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS achievements text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_format text DEFAULT '';

-- Index for filtering by seniority/functional area
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_seniority ON candidate_profiles(seniority_level) WHERE seniority_level != '';
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_functional_area ON candidate_profiles(functional_area) WHERE functional_area != '';
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_current_title ON candidate_profiles(current_title) WHERE current_title != '';
```

---

## FILE: `README_EXTRACTED.md`

```markdown
# GoldenHire Resume ATS & AI Scanner — extracted original source

This archive preserves the original code from the uploaded GoldenHire project, with its relative directory structure.

## Main entry points
- `src/pages/jobposter/ResumesSection.tsx`: recruiter-facing ATS resume bank, uploads, candidate records.
- `supabase/functions/upload-resumes/index.ts`: ingestion, extraction, AI enrichment and candidate profile persistence.
- `src/pages/ResumeScannerPage.tsx`: public resume scanner React UI.
- `supabase/functions/scan-resume-public/index.ts`: public resume analysis API.
- `supabase/functions/scan-resume/index.ts`: internal job-application resume analysis API.
- `supabase/functions/scan-talent-resume/index.ts`: additional talent scan endpoint.
- `src/pages/jobposter/ResumesChatPanel.tsx` / `supabase/functions/resumes-chat/index.ts`: resume bank chat capability.
- `supabase/migrations/`: selected ATS database schema migrations.

## Integration notes
- **This is an extracted module source archive, not a standalone runnable app.** It requires integration into a React/Vite + Supabase project, other app routing/UI and database tables, dependencies, and environment configuration.
- Inspect `package.json` and imports for frontend dependencies; Supabase Edge Functions use Deno imports.
- Configure your own Supabase project, storage bucket(s), database migration chain, edge functions, authentication and server-side AI credentials.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` in a browser bundle.
- This archive includes selected migrations only; other schema dependencies might be defined in omitted full-project migrations.
- AI scoring is heuristic/model-generated, not a validated hiring assessment. Audit accuracy, bias, security and privacy before live use.

## Files included
- `package.json`
- `src/lib/jobposter-auth.ts`
- `src/lib/python-parser.ts`
- `src/lib/supabase.ts`
- `src/lib/zip-extract.ts`
- `src/pages/ResumeScannerPage.tsx`
- `src/pages/combine/CandidateResume.tsx`
- `src/pages/jobposter/CandidatesTab.tsx`
- `src/pages/jobposter/PythonImportModal.tsx`
- `src/pages/jobposter/ResumesChatPanel.tsx`
- `src/pages/jobposter/ResumesSection.tsx`
- `supabase/functions/_shared/adminAuth.ts`
- `supabase/functions/_shared/aiGuard.ts`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/cron.ts`
- `supabase/functions/_shared/email.ts`
- `supabase/functions/_shared/qwenTranscribe.ts`
- `supabase/functions/_shared/rateLimit.ts`
- `supabase/functions/_shared/season.ts`
- `supabase/functions/_shared/secrets.ts`
- `supabase/functions/_shared/storageFetch.ts`
- `supabase/functions/_shared/userAuth.ts`
- `supabase/functions/admin-candidates/index.ts`
- `supabase/functions/bulk-import-candidates/index.ts`
- `supabase/functions/extract-card-from-resume/index.ts`
- `supabase/functions/extract-resume-text/index.ts`
- `supabase/functions/pipeline-stats/index.ts`
- `supabase/functions/resumes-chat/index.ts`
- `supabase/functions/scan-resume-public/index.ts`
- `supabase/functions/scan-resume/index.ts`
- `supabase/functions/scan-talent-resume/index.ts`
- `supabase/functions/upload-resumes/index.ts`
- `supabase/migrations/20260513173211_add_resume_scan_reports.sql`
- `supabase/migrations/20260527033146_create_resumes_bank_table.sql`
- `supabase/migrations/20260527151542_create_candidate_profiles_and_upload_batches.sql`
- `supabase/migrations/20260527194718_add_ats_score_to_candidate_profiles.sql`
- `supabase/migrations/20260611142037_add_enrichment_columns_to_candidate_profiles.sql`
```
