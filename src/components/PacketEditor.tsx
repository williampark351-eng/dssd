import { useEffect, useState } from 'react';
import { AlertTriangle, BookmarkPlus, Copy, Loader2, Lock, Sparkles, Wand2 } from 'lucide-react';
import { callFunction, friendlyError, supabase } from '@/lib/supabase';
import type { Application, PacketAnswer, Resume } from '@/lib/types';
import { Badge, useToast } from '@/components/ui';

export type PacketDraft = { cover_letter: string; answers: PacketAnswer[]; resume_id: string | null; remember: Set<number> };

export function draftFrom(app: Application): PacketDraft {
  return { cover_letter: app.cover_letter ?? '', answers: (app.answers ?? []).map((a) => ({ ...a })), resume_id: app.resume_id, remember: new Set() };
}

export async function saveToLibrary(answers: PacketAnswer[]) {
  for (const a of answers) {
    if (!a.answer.trim()) continue;
    const { data: existing } = await supabase.from('answer_library').select('id').ilike('question', a.question.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    const row = { question: a.question.slice(0, 1000), answer: a.answer.slice(0, 10000), sensitive: a.sensitive, approved: true, category: a.sensitive ? 'sensitive' : 'general', updated_at: new Date().toISOString() };
    if (existing) await supabase.from('answer_library').update(row).eq('id', existing.id);
    else await supabase.from('answer_library').insert(row);
  }
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function AiButton({ busy, onClick, label = 'Draft with AI' }: { busy: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-60">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{busy ? 'Drafting...' : label}
    </button>
  );
}

export default function PacketEditor({ app, draft, onChange, editable }: { app: Application; draft: PacketDraft; onChange: (d: PacketDraft) => void; editable: boolean }) {
  const toast = useToast();
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [resumes, setResumes] = useState<Pick<Resume, 'id' | 'name' | 'reviewed' | 'is_primary'>[]>([]);

  useEffect(() => {
    if (!editable) return;
    supabase.from('resumes').select('id, name, reviewed, is_primary').order('created_at').then(({ data }) => setResumes((data as typeof resumes) ?? []));
  }, [editable]);

  const setAnswer = (i: number, answer: string) => onChange({ ...draft, answers: draft.answers.map((a, j) => (j === i ? { ...a, answer } : a)) });

  const draftWithAi = async (key: string, body: Record<string, unknown>, apply: (r: { cover_letter?: string; answer?: string }) => boolean) => {
    if (!draft.resume_id) { toast('error', 'Choose a resume first.'); return; }
    setAiBusy(key);
    try {
      const r = await callFunction<{ cover_letter?: string; answer?: string }>('ai-assist', { application_id: app.id, resume_id: draft.resume_id, ...body });
      if (apply(r)) toast('success', 'AI draft added. Read it carefully and edit before saving.');
      else toast('error', 'The AI returned an empty draft. Please try again.');
    } catch (err) {
      toast('error', friendlyError(err, 'The AI assistant is unavailable right now.'));
    } finally {
      setAiBusy(null);
    }
  };
  const aiCoverLetter = () => draftWithAi('cover', { action: 'cover_letter' }, (r) => {
    if (typeof r.cover_letter !== 'string' || !r.cover_letter.trim()) return false;
    onChange({ ...draft, cover_letter: r.cover_letter });
    return true;
  });
  const aiAnswer = (i: number) => draftWithAi(`q${i}`, { action: 'answer', index: i }, (r) => {
    if (typeof r.answer !== 'string' || !r.answer.trim()) return false;
    onChange({ ...draft, answers: draft.answers.map((a, j) => (j === i ? { ...a, answer: r.answer as string, source: 'ai_draft' } : a)) });
    return true;
  });
  const toggleRemember = (i: number) => {
    const n = new Set(draft.remember);
    if (n.has(i)) n.delete(i); else n.add(i);
    onChange({ ...draft, remember: n });
  };

  const snap = app.resume_snapshot;
  const missing = draft.answers.filter((a) => a.required && !a.answer.trim()).length;

  return (
    <div className="space-y-6">
      <section>
        <p className="label">Resume used</p>
        {editable ? (
          <select className="input" value={draft.resume_id ?? ''} onChange={(e) => onChange({ ...draft, resume_id: e.target.value || null })}>
            {!draft.resume_id && <option value="">Choose a resume</option>}
            {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_primary ? ' (primary)' : ''}{r.reviewed ? '' : ' — not reviewed'}</option>)}
          </select>
        ) : (
          <p className="text-sm font-semibold text-ink-900">{snap?.name ?? 'None'}{snap?.file_name ? <span className="font-normal text-ink-500"> · {snap.file_name}</span> : null}</p>
        )}
        {snap && snap.reviewed === false && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />This resume has not been reviewed yet. Auto-apply skips unreviewed resumes.</p>
        )}
      </section>

      {app.tailoring_notes?.length > 0 && (
        <section className="rounded-xl bg-brand-50/70 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-800"><Wand2 className="h-3.5 w-3.5" />How it was tailored</p>
          <ul className="space-y-1 text-sm text-brand-900">{app.tailoring_notes.map((n) => <li key={n}>• {n}</li>)}</ul>
        </section>
      )}

      <section>
        <div className="mb-1 flex items-center justify-between">
          <p className="label mb-0">Cover letter</p>
          <div className="flex items-center gap-2">
            {editable && <AiButton busy={aiBusy === 'cover'} onClick={aiCoverLetter} label={draft.cover_letter ? 'Rewrite with AI' : 'Draft with AI'} />}
            {draft.cover_letter && <button onClick={() => copy(draft.cover_letter)} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-800"><Copy className="h-3 w-3" />Copy</button>}
          </div>
        </div>
        {editable && <p className="mb-2 text-[11px] text-ink-400">AI drafts only use facts from your resume. Anything it can't back up is rejected.</p>}
        {editable ? (
          <textarea className="input min-h-[220px] leading-relaxed" value={draft.cover_letter} maxLength={20000} onChange={(e) => onChange({ ...draft, cover_letter: e.target.value })} placeholder="No cover letter. Write one or leave empty." />
        ) : (
          <div className="whitespace-pre-line rounded-xl bg-ink-50 p-4 text-sm leading-relaxed text-ink-700">{draft.cover_letter || 'No cover letter was included.'}</div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="label mb-0">Application questions</p>
          {missing > 0 && <Badge tone="amber">{missing} required answer{missing > 1 ? 's' : ''} missing</Badge>}
        </div>
        {draft.answers.length === 0 ? <p className="text-sm text-ink-500">This employer did not ask additional questions.</p> : (
          <div className="space-y-4">
            {draft.answers.map((a, i) => (
              <div key={`${a.field}-${i}`} className={`rounded-xl border p-4 ${a.required && !a.answer.trim() ? 'border-amber-300 bg-amber-50/40' : 'border-ink-200'}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{a.question}</span>
                  {a.required && <Badge tone="neutral">Required</Badge>}
                  {a.sensitive && <Badge tone="rose"><Lock className="h-3 w-3" />Sensitive — your answer only</Badge>}
                  {a.source && a.answer && <span className={`text-[11px] ${a.source === 'ai_draft' ? 'font-semibold text-brand-700' : 'text-ink-400'}`}>{a.source === 'ai_draft' ? 'AI draft, please review' : `from ${a.source.replace('_', ' ')}`}</span>}
                  {editable && !a.sensitive && !a.answer.trim() && <span className="ml-auto"><AiButton busy={aiBusy === `q${i}`} onClick={() => aiAnswer(i)} /></span>}
                </div>
                {!editable ? (
                  <div className="flex items-start justify-between gap-2">
                    <p className="whitespace-pre-line text-sm text-ink-700">{a.options?.find((o) => o.value === a.answer)?.label ?? (a.answer || '—')}</p>
                    {a.answer && <button onClick={() => copy(a.options?.find((o) => o.value === a.answer)?.label ?? a.answer)} className="text-ink-400 hover:text-ink-700" aria-label="Copy answer"><Copy className="h-3.5 w-3.5" /></button>}
                  </div>
                ) : a.options?.length ? (
                  <select className="input" value={a.answer} onChange={(e) => setAnswer(i, e.target.value)}>
                    <option value="">Select an answer</option>
                    {a.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : a.type === 'textarea' ? (
                  <textarea className="input min-h-[90px]" value={a.answer} maxLength={10000} onChange={(e) => setAnswer(i, e.target.value)} />
                ) : (
                  <input className="input" value={a.answer} maxLength={2000} onChange={(e) => setAnswer(i, e.target.value)} />
                )}
                {editable && a.answer.trim() && a.source !== 'library' && (
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-500">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600" checked={draft.remember.has(i)} onChange={() => toggleRemember(i)} />
                    <BookmarkPlus className="h-3.5 w-3.5" />Save to my answer library for next time
                  </label>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
