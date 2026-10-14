import { useEffect, useState } from 'react';
import { Mic, Plus, Trash2 } from 'lucide-react';
import { supabase, friendlyError, callFunction, audit } from '@/lib/supabase';
import { useNav } from '@/context/NavContext';
import { useAsync, must } from '@/lib/useAsync';
import { formatDate } from '@/lib/format';
import { LANGUAGES, answeredCount, languageLabel, sessionScore } from '@/lib/interview';
import type { MockInterview as Session, Resume } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Modal, PageHeader, Spinner, useToast } from '@/components/ui';
import PracticeSession from '@/components/interview/PracticeSession';

type AppOption = { id: string; resume_id: string | null; job: { title: string; company: string; description: string } | null };
type Draft = { application_id: string; resume_id: string; role_title: string; company: string; job_description: string; answer_language: string; translate_to: string; count: number };

const EMPTY: Draft = { application_id: '', resume_id: '', role_title: '', company: '', job_description: '', answer_language: 'en', translate_to: '', count: 6 };

function NewSessionModal({ open, onClose, onCreated, apps, resumes, presetApp }: { open: boolean; onClose: () => void; onCreated: (s: Session) => void; apps: AppOption[]; resumes: Pick<Resume, 'id' | 'name' | 'is_primary'>[]; presetApp: string | null }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = { ...EMPTY, resume_id: resumes.find((r) => r.is_primary)?.id ?? resumes[0]?.id ?? '' };
    const a = presetApp ? apps.find((x) => x.id === presetApp) : undefined;
    setD(a ? {
      ...base, application_id: a.id, role_title: a.job?.title ?? '', company: a.job?.company ?? '',
      job_description: (a.job?.description ?? '').slice(0, 20000), resume_id: a.resume_id ?? base.resume_id,
    } : base);
    setError(null);
  }, [open, resumes, apps, presetApp]);

  const pickApp = (id: string) => {
    const a = apps.find((x) => x.id === id);
    setD((p) => ({
      ...p, application_id: id,
      role_title: a?.job?.title ?? p.role_title, company: a?.job?.company ?? p.company,
      job_description: (a?.job?.description ?? p.job_description).slice(0, 20000),
      resume_id: a?.resume_id ?? p.resume_id,
    }));
  };

  const create = async () => {
    if (!d.role_title.trim()) { setError('Enter the role you are practicing for.'); return; }
    if (!d.resume_id) { setError('Add a resume first so questions can be tailored to you.'); return; }
    setSaving(true);
    setError(null);
    try {
      const row = await must(supabase.from('mock_interviews').insert({
        application_id: d.application_id || null, resume_id: d.resume_id, role_title: d.role_title.trim().slice(0, 200),
        company: d.company.trim().slice(0, 200), job_description: d.job_description.slice(0, 20000),
        answer_language: d.answer_language, translate_to: d.translate_to || null,
      }).select('*').single()) as Session;
      audit('mock_interview.create', 'mock_interviews', { id: row.id });
      try {
        const r = await callFunction<{ questions?: Session['questions'] }>('ai-assist', { action: 'interview_questions', interview_id: row.id, count: d.count });
        if (Array.isArray(r?.questions)) row.questions = r.questions;
      } catch (err) {
        toast('error', friendlyError(err, 'Session created, but questions could not be written yet. You can retry inside the session.'));
      }
      onCreated(row);
    } catch (err) {
      setError(friendlyError(err, 'Could not start the practice session.'));
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title="New practice interview"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} icon={<Mic className="h-4 w-4" />} onClick={create}>{saving ? 'Writing questions...' : 'Start practice'}</Button></>}>
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        {apps.length > 0 && (
          <Field label="Practice for an application" hint="Optional. Fills in the role and job description for you.">
            <select className="input" value={d.application_id} onChange={(e) => pickApp(e.target.value)}>
              <option value="">Not linked to an application</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.job?.title ?? 'Untitled role'}{a.job?.company ? `, ${a.job.company}` : ''}</option>)}
            </select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role"><input className="input" value={d.role_title} maxLength={200} onChange={(e) => set('role_title', e.target.value)} placeholder="e.g. Data Analyst" /></Field>
          <Field label="Company"><input className="input" value={d.company} maxLength={200} onChange={(e) => set('company', e.target.value)} placeholder="Optional" /></Field>
        </div>
        <Field label="Job description" hint="Optional, but questions are sharper with it.">
          <textarea className="input min-h-[96px]" value={d.job_description} maxLength={20000} onChange={(e) => set('job_description', e.target.value)} />
        </Field>
        <Field label="Resume">
          {resumes.length ? (
            <select className="input" value={d.resume_id} onChange={(e) => set('resume_id', e.target.value)}>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_primary ? ' (primary)' : ''}</option>)}
            </select>
          ) : <p className="text-sm text-ink-500">You don't have a resume yet. Add one on the Resumes page first.</p>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="I'll answer in">
            <select className="input" value={d.answer_language} onChange={(e) => set('answer_language', e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Translate my answers to">
            <select className="input" value={d.translate_to} onChange={(e) => set('translate_to', e.target.value)}>
              <option value="">No translation</option>
              {LANGUAGES.filter((l) => l.code !== d.answer_language).map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Questions">
            <select className="input" value={d.count} onChange={(e) => set('count', Number(e.target.value))}>
              {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs leading-relaxed text-ink-500">Your voice is sent to the speech service only while you are recording an answer. Questions and feedback are based on your resume, and the coach will not suggest experience you don't have.</p>
      </div>
    </Modal>
  );
}

export default function MockInterview() {
  const toast = useToast();
  const { param, navigate } = useNav();
  const presetApp = param?.startsWith('app-') ? param.slice(4) : null;
  const [creating, setCreating] = useState(!!presetApp);
  const [active, setActive] = useState<Session | null>(null);
  const [removing, setRemoving] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data, loading, error, reload, setData } = useAsync(async () => {
    const [sessions, apps, resumes] = await Promise.all([
      must(supabase.from('mock_interviews').select('*').order('updated_at', { ascending: false })),
      must(supabase.from('applications').select('id, resume_id, job:jobs(title, company, description)').order('updated_at', { ascending: false }).limit(100)),
      must(supabase.from('resumes').select('id, name, is_primary').order('is_primary', { ascending: false })),
    ]);
    return { sessions: sessions as Session[], apps: apps as unknown as AppOption[], resumes: resumes as Pick<Resume, 'id' | 'name' | 'is_primary'>[] };
  });

  const upsertLocal = (s: Session) => {
    setActive(s);
    setData((p) => (p ? { ...p, sessions: [s, ...p.sessions.filter((x) => x.id !== s.id)] } : p));
  };

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from('mock_interviews').delete().eq('id', removing.id);
      if (err) throw err;
      audit('mock_interview.delete', 'mock_interviews', { id: removing.id });
      setData((p) => (p ? { ...p, sessions: p.sessions.filter((x) => x.id !== removing.id) } : p));
      toast('success', 'Practice session deleted.');
      setRemoving(null);
    } catch (err) {
      toast('error', friendlyError(err, 'Could not delete that session.'));
    } finally {
      setDeleting(false);
    }
  };

  if (active) return <PracticeSession key={active.id} mi={active} onChange={upsertLocal} onBack={() => setActive(null)} />;

  const sessions = data?.sessions ?? [];
  const scored = sessions.map(sessionScore).filter((s): s is number => s !== null);
  const avg = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null;
  const answered = sessions.reduce((n, s) => n + answeredCount(s), 0);

  return (
    <div>
      <PageHeader title="Mock interviews" subtitle="Practice out loud with live transcription, optional translation, and honest feedback on every answer."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)} disabled={!data}>New practice</Button>} />

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data ? <Spinner label="Loading sessions" /> : data && (
        <>
          {sessions.length > 0 && (
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Card className="p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Sessions</div><div className="mt-2 text-2xl font-bold text-ink-950">{sessions.length}</div></Card>
              <Card className="p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Answers reviewed</div><div className="mt-2 text-2xl font-bold text-ink-950">{answered}</div></Card>
              <Card className="p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Average score</div><div className="mt-2 text-2xl font-bold text-ink-950">{avg ?? '--'}<span className="text-sm font-medium text-ink-400"> / 5</span></div></Card>
            </div>
          )}

          {sessions.length === 0 ? (
            <Card>
              <EmptyState icon={<Mic className="h-6 w-6" />} title="No practice sessions yet"
                body="Pick a role, and the AI writes interview questions from the job and your resume. Answer out loud and get feedback on structure, pace, and content."
                action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Start your first practice</Button>} />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sessions.map((s) => {
                const score = sessionScore(s);
                const n = answeredCount(s);
                return (
                  <Card key={s.id} className="group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-ink-950">{s.role_title}</h3>
                        <p className="truncate text-xs text-ink-500">{s.company || 'No company'} · {formatDate(s.updated_at)}</p>
                      </div>
                      <Badge tone={s.status === 'completed' ? 'success' : 'amber'}>{s.status === 'completed' ? 'Completed' : 'In progress'}</Badge>
                    </div>
                    <div className="mt-4 flex items-end gap-6">
                      <div><div className="text-2xl font-bold text-ink-950">{score ?? '--'}</div><div className="text-xs text-ink-500">avg score</div></div>
                      <div><div className="text-2xl font-bold text-ink-950">{n}<span className="text-sm text-ink-400">/{s.questions?.length ?? 0}</span></div><div className="text-xs text-ink-500">answered</div></div>
                    </div>
                    {s.translate_to && <p className="mt-3 text-xs text-sky-700">Translating to {languageLabel(s.translate_to)}</p>}
                    <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
                      <button onClick={() => setRemoving(s)} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Delete session"><Trash2 className="h-4 w-4" /></button>
                      <Button size="sm" onClick={() => setActive(s)}>{s.status === 'completed' ? 'Review' : n ? 'Continue' : 'Begin'}</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <NewSessionModal open={creating} onClose={() => { setCreating(false); if (presetApp) navigate('practice'); }} apps={data.apps} resumes={data.resumes} presetApp={presetApp}
            onCreated={(s) => { setCreating(false); upsertLocal(s); if (presetApp) navigate('practice'); }} />
        </>
      )}

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete practice session?"
        footer={<><Button variant="secondary" onClick={() => setRemoving(null)}>Keep it</Button><Button variant="danger" loading={deleting} onClick={remove}>Delete</Button></>}>
        <p className="text-sm leading-relaxed text-ink-600">This removes the questions, your transcripts, and the feedback for "{removing?.role_title}". This can't be undone.</p>
      </Modal>
    </div>
  );
}
