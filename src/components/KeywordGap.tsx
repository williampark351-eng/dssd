import { useEffect, useState } from 'react';
import { CheckCircle2, CircleHelp, Search, XCircle } from 'lucide-react';
import { fetchJobDescription } from '@/lib/jobs';
import type { Resume } from '@/lib/types';

const STOP = new Set(['and', 'the', 'with', 'for', 'you', 'your', 'our', 'will', 'are', 'have', 'has', 'this', 'that', 'from', 'their', 'they', 'all', 'can', 'who', 'was', 'not', 'but', 'its', 'job', 'work', 'team', 'role', 'years', 'year', 'experience', 'including', 'across', 'using', 'etc', 'new', 'other', 'ability', 'strong', 'plus', 'preferred', 'required', 'requirements', 'responsibilities', 'about', 'opportunity', 'company', 'candidates', 'candidate', 'join', 'help', 'well', 'best', 'more', 'than', 'also', 'into', 'over', 'within', 'may', 'must', 'should', 'would', 'could', 'get', 'set', 'per', 'via', 'us', 'we', 'us.']);

function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z+#.\-]{1,24}/g) ?? [];
  return words.map((w) => w.replace(/[.\-]+$/, '')).filter((w) => w.length >= 3 && !STOP.has(w));
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#]/g, '');
}

export default function KeywordGap({ jobId, resume }: { jobId: string; resume: Resume | null }) {
  const [state, setState] = useState<{ id: string; matched: string[]; missing: string[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    setState(null);
    fetchJobDescription(jobId).then((desc) => {
      if (!live) return;
      const skills = (resume?.parsed?.skills ?? []).map((s) => s.trim()).filter(Boolean);
      if (!skills.length || !desc) { setState({ id: jobId, matched: [], missing: [] }); return; }
      const haystack = new Set(tokenize(desc));
      const bigrams = new Set<string>();
      const words = tokenize(desc);
      for (let i = 0; i < words.length - 1; i++) bigrams.add(`${words[i]} ${words[i + 1]}`);
      const matched: string[] = [];
      const missing: string[] = [];
      for (const skill of skills) {
        const n = norm(skill);
        const parts = tokenize(skill);
        const hit = haystack.has(n) || bigrams.has(parts.join(' ')) || (parts.length === 1 && haystack.has(parts[0]));
        (hit ? matched : missing).push(skill);
      }
      setState({ id: jobId, matched, missing });
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [jobId, resume?.id, resume?.parsed?.skills]);

  if (!resume) return null;
  if (failed) return null;
  if (!state || state.id !== jobId) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-500">
        <Search className="h-3.5 w-3.5 animate-pulse" /> Checking your skills against this posting…
      </div>
    );
  }
  if (!state.matched.length && !state.missing.length) return null;

  return (
    <section className="rounded-2xl border border-ink-200 p-5">
      <p className="text-sm font-bold text-ink-900">Your skills in this posting</p>
      <p className="mt-0.5 text-xs text-ink-500">A plain word match between the skills on your resume and the job description text. It misses skills worded differently, so treat it as a hint, not a verdict.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-800">Mentioned in the posting ({state.matched.length})</p>
          {state.matched.length === 0 ? <p className="text-xs text-emerald-700/70">None matched</p> : (
            <div className="flex flex-wrap gap-1">
              {state.matched.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"><CheckCircle2 className="h-3 w-3" />{s}</span>)}
            </div>
          )}
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">Not found in the posting ({state.missing.length})</p>
          {state.missing.length === 0 ? <p className="text-xs text-amber-700/70">All your skills appear</p> : (
            <div className="flex flex-wrap gap-1">
              {state.missing.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200"><XCircle className="h-3 w-3" />{s}</span>)}
            </div>
          )}
        </div>
      </div>
      {state.missing.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-500"><CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />Skills listed here are simply not in the posting text — that says nothing about whether you should apply.</p>
      )}
    </section>
  );
}
