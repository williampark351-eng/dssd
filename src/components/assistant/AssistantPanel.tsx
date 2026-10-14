import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Briefcase, Check, CheckCircle2, Copy, CornerDownLeft, Loader2, MessageSquareText, Trash2, X } from 'lucide-react';
import { supabase, callFunction, friendlyError } from '@/lib/supabase';

export type JobBrief = { kind: 'job'; title: string; company: string; summary: string; matches: string[]; gaps: string[]; keywords: string[]; pitch: string };
export type QuestionAnswer = { kind: 'answer'; question: string; answer: string; tip: string; style?: 'draft' | 'advice' | 'clarify' };
type Body = (JobBrief & { source: string }) | QuestionAnswer | { kind: 'error'; message: string };
type Entry = { id: string; at: number } & Body;
type Mode = 'auto' | 'job' | 'question';
type Saved = { entries: Entry[]; jobText: string; jobLabel: string; resumeId: string };

const STORE = 'applyline-hr-assistant';
const EMPTY: Saved = { entries: [], jobText: '', jobLabel: '', resumeId: '' };

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    return v && Array.isArray(v.entries) ? { ...EMPTY, ...v } : EMPTY;
  } catch { return EMPTY; }
}

function isResult(v: unknown): v is JobBrief | QuestionAnswer {
  const k = (v as { kind?: unknown })?.kind;
  return k === 'job' ? typeof (v as JobBrief).summary === 'string' : k === 'answer' && typeof (v as QuestionAnswer).answer === 'string';
}

function CopyButton({ text, win }: { text: string; win: Window }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await win.navigator.clipboard.writeText(text); } catch {
      const ta = win.document.createElement('textarea');
      ta.value = text; win.document.body.appendChild(ta); ta.select(); win.document.execCommand('copy'); ta.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  return (
    <button onClick={copy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-50">
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? 'Copied' : 'Copy'}
    </button>
  );
}

function List({ items, tone }: { items: string[]; tone: 'good' | 'gap' }) {
  return (
    <ul className="space-y-1.5">
      {items.map((m) => (
        <li key={m} className="flex gap-2 text-[13px] leading-relaxed text-ink-700">
          {tone === 'good' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}{m}
        </li>
      ))}
    </ul>
  );
}

function EntryCard({ e, win, active, onUseJob }: { e: Entry; win: Window; active: boolean; onUseJob: (label: string, source: string) => void }) {
  if (e.kind === 'error') return <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">{e.message}</div>;
  if (e.kind === 'answer') {
    const clarify = e.style === 'clarify';
    return (
      <div className={`rounded-xl border p-4 shadow-sm ${clarify ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-white'}`}>
        <p className="mb-2 flex items-start gap-2 text-xs font-semibold text-ink-500"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e.question}</p>
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-900">{e.answer}</p>
        {clarify ? <p className="mt-2 text-[11px] font-semibold text-amber-800">Reply below and I'll pick it up from here.</p> : (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-2">
            <p className="text-[11px] leading-snug text-ink-500">{e.tip}</p>
            <CopyButton text={e.answer} win={win} />
          </div>
        )}
      </div>
    );
  }
  const label = [e.title, e.company].filter(Boolean).join(' at ') || 'This role';
  return (
    <div className="space-y-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-bold text-ink-950">{label}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{e.summary}</p>
      </div>
      {e.matches.length > 0 && <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Where you match</p><List items={e.matches} tone="good" /></div>}
      {e.gaps.length > 0 && <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">Not on your resume</p><List items={e.gaps} tone="gap" /></div>}
      {e.keywords.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Words to mirror</p>
          <div className="flex flex-wrap gap-1.5">{e.keywords.map((k) => <span key={k} className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">{k}</span>)}</div>
        </div>
      )}
      {e.pitch && (
        <div className="rounded-lg bg-brand-50 p-3">
          <div className="mb-1 flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-wider text-brand-800">Why you fit</p><CopyButton text={e.pitch} win={win} /></div>
          <p className="text-[13px] leading-relaxed text-ink-900">{e.pitch}</p>
        </div>
      )}
      {active ? <p className="text-[11px] font-semibold text-emerald-700">Questions you paste now are answered for this job</p> : (
        <button onClick={() => onUseJob(label, e.source)} className="text-[11px] font-semibold text-brand-700 hover:text-brand-800">Use this job for my next questions</button>
      )}
    </div>
  );
}

export default function AssistantPanel({ win = window, headerActions }: { win?: Window; headerActions?: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(load);
  const [resumes, setResumes] = useState<{ id: string; name: string; is_primary: boolean }[] | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const [busy, setBusy] = useState(false);
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify({ ...saved, entries: saved.entries.slice(-20) })); }, [saved]);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [saved.entries.length]);
  useEffect(() => {
    supabase.from('resumes').select('id, name, is_primary').order('is_primary', { ascending: false }).order('updated_at', { ascending: false })
      .then(({ data, error }) => setResumes(error ? [] : data ?? []));
  }, []);

  const push = (e: Body, job?: { text: string; label: string }) =>
    setSaved((s) => ({ ...s, entries: [...s.entries, { ...e, id: crypto.randomUUID(), at: Date.now() }], ...(job ? { jobText: job.text, jobLabel: job.label } : {}) }));

  const send = async () => {
    const input = text.trim();
    if (input.length < 2 || busy) return;
    setBusy(true);
    const history = saved.entries.flatMap((e) => (e.kind === 'answer' ? [{ q: e.question, a: e.answer }] : [])).slice(-4);
    try {
      const r = await callFunction<unknown>('ai-assist', { action: 'assistant', text: input, mode, job_text: saved.jobText, resume_id: saved.resumeId || null, history });
      if (!isResult(r)) throw new Error('The assistant sent back something unexpected. Please try again.');
      if (r.kind === 'job') {
        const label = [r.title, r.company].filter(Boolean).join(' at ') || 'Pasted job';
        push({ ...r, source: input.slice(0, 8000) }, { text: input.slice(0, 8000), label });
      } else push({ ...r, question: input.slice(0, 300) });
      setText('');
    } catch (err) {
      push({ kind: 'error', message: friendlyError(err, 'The assistant is unavailable right now.') });
    }
    setBusy(false);
  };

  const noResume = resumes !== null && resumes.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-ink-50 text-ink-900">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><Briefcase className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-ink-950">HR assistant</p>
          <select className="mt-0.5 max-w-full truncate bg-transparent text-[11px] text-ink-500 outline-none" value={saved.resumeId} onChange={(e) => setSaved((s) => ({ ...s, resumeId: e.target.value }))} aria-label="Resume">
            <option value="">Using your primary resume</option>
            {(resumes ?? []).map((r) => <option key={r.id} value={r.id}>Using {r.name || 'Untitled resume'}</option>)}
          </select>
        </div>
        {saved.entries.length > 0 && (
          <button onClick={() => setSaved((s) => ({ ...s, entries: [], jobText: '', jobLabel: '' }))} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" title="Clear conversation" aria-label="Clear conversation"><Trash2 className="h-4 w-4" /></button>
        )}
        {headerActions}
      </div>

      <div ref={feed} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
        {saved.entries.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink-300 bg-white p-4 text-[13px] leading-relaxed text-ink-600">
            {noResume ? 'Upload a resume in Resume Studio first so the assistant knows your background.' : (
              <>
                <p className="font-semibold text-ink-900">Ask me anything while you job hunt.</p>
                <p className="mt-1.5">Ask a question in your own words, like how to follow up or how to explain a gap. Paste an <strong>application question</strong> and I'll draft an answer from your resume. Or paste a <strong>job description</strong> to see where you match.</p>
                <p className="mt-1.5 text-[11px] text-ink-500">Drafts only use what's on your resume. If I need more from you, I'll ask.</p>
              </>
            )}
          </div>
        )}
        {saved.entries.map((e) => <EntryCard key={e.id} e={e} win={win} active={e.kind === 'job' && e.source === saved.jobText}
          onUseJob={(label, source) => setSaved((s) => ({ ...s, jobLabel: label, jobText: source }))} />)}
        {busy && <div className="flex items-center gap-2 text-xs text-ink-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking...</div>}
      </div>

      <div className="border-t border-ink-200 bg-white p-3">
        {saved.jobLabel && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11px] text-brand-900">
            <Briefcase className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">Answering for <strong>{saved.jobLabel}</strong></span>
            <button onClick={() => setSaved((s) => ({ ...s, jobText: '', jobLabel: '' }))} aria-label="Stop using this job" className="rounded p-0.5 hover:bg-brand-100"><X className="h-3 w-3" /></button>
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} disabled={noResume}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask anything, or paste a job description or application question"
          className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-[13px] leading-relaxed outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-ink-50" />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex rounded-lg bg-ink-100 p-0.5 text-[11px] font-semibold">
            {(['auto', 'job', 'question'] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-md px-2 py-1 transition ${mode === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
                {m === 'auto' ? 'Auto' : m === 'job' ? 'Job post' : 'Just ask'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="hidden text-[10px] text-ink-400 sm:inline">Enter to send</span>
          <button onClick={send} disabled={busy || text.trim().length < 2 || noResume}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700 active:scale-[.98] disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CornerDownLeft className="h-3.5 w-3.5" />}Ask
          </button>
        </div>
      </div>
    </div>
  );
}
