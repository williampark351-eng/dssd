import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Briefcase, Building2, Check, FileText, GraduationCap, Route, Sparkles, Target, Trash2, UploadCloud, User,
} from 'lucide-react';
import { supabase, friendlyError, audit, callFunction } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/lib/useAsync';
import { Badge, Button, Field, TagInput, useToast } from '@/components/ui';
import { ProfileForm, PreferencesForm, pickPreferences, pickProfile, type PreferencesDraft, type ProfileDraft } from '@/components/ProfileForms';
import { createResumeFromText, resumeFileProblem, resumeQualityLabel, uploadResume } from '@/lib/resumes';
import { PROVIDER_LABEL, relativeTime } from '@/lib/format';
import type { Resume } from '@/lib/types';

const STEPS = ['About you', 'Dream role', 'Your resume', 'Companies to watch'];
const RAIL = [
  { icon: User, desc: 'These facts quietly fill application forms for you.' },
  { icon: Target, desc: 'We score every opening 0–100 against this.' },
  { icon: FileText, desc: 'Your experience, extracted and ready for you to check.' },
  { icon: Building2, desc: 'We watch their boards for fresh openings.' },
];
const TITLE_SUGGESTIONS = ['Software Engineer', 'Frontend Engineer', 'Data Analyst', 'Product Manager', 'UX Designer', 'Marketing Manager', 'Financial Analyst', 'Project Manager'];

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function Onboarding() {
  const { profile, prefs, refresh } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [p, setP] = useState<ProfileDraft>(() => pickProfile(profile!));
  const [pr, setPr] = useState<PreferencesDraft>(() => pickPreferences(prefs!));
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [resumeDone, setResumeDone] = useState(false);
  const [parsed, setParsed] = useState<Resume | null>(null);
  const [provider, setProvider] = useState<'greenhouse' | 'lever' | 'ashby'>('greenhouse');
  const [token, setToken] = useState('');
  const [pickedBoards, setPickedBoards] = useState<Set<string>>(new Set());

  const following = useAsync(async () => {
    const { data, error } = await supabase.from('job_sources').select('company_name, board_token, last_synced_at').eq('active', true);
    if (error) throw error;
    return (data ?? []) as { company_name: string | null; board_token: string; last_synced_at: string | null }[];
  });
  const suggestions = useAsync(async () => {
    const { data, error } = await supabase.from('discovered_boards').select('company_name, board_token, provider, job_count').eq('status', 'active').order('job_count', { ascending: false }).limit(12);
    if (error) throw error;
    return (data ?? []) as { company_name: string | null; board_token: string; provider: string; job_count: number }[];
  });
  const sources = following.data ?? [];
  const boards = (suggestions.data ?? []).filter((b) => !sources.some((s) => s.board_token === b.board_token)).slice(0, 8);
  const lastSync = sources.map((s) => s.last_synced_at).filter(Boolean).sort().pop() ?? null;
  const names = sources.map((s) => s.company_name || s.board_token).slice(0, 6);

  const dreamPreview = useMemo(() => {
    const bits: string[] = [];
    if (pr.target_titles.length) bits.push(pr.target_titles.slice(0, 2).join(' or '));
    if (pr.locations.length) bits.push(pr.locations.slice(0, 2).join(' or '));
    if (pr.work_arrangements.length) bits.push(pr.work_arrangements.map((a) => a[0].toUpperCase() + a.slice(1)).join(' / '));
    if (pr.min_salary > 0) bits.push(`${money(pr.min_salary)}+`);
    return bits;
  }, [pr]);

  const saveProfile = async () => {
    if (!p.full_name.trim()) { toast('error', 'Add your name to continue.'); return false; }
    const { error } = await supabase.from('profiles').update(p).eq('id', profile!.id);
    if (error) { toast('error', friendlyError(error, 'Could not save your profile.')); return false; }
    return true;
  };

  const savePrefs = async () => {
    if (!pr.target_titles.length) { toast('error', 'Add at least one role you are aiming for — it powers your match scores.'); return false; }
    const { error } = await supabase.from('candidate_preferences').update(pr).eq('user_id', prefs!.user_id);
    if (error) { toast('error', friendlyError(error, 'Could not save your preferences.')); return false; }
    return true;
  };

  const saveResume = async () => {
    if (resumeDone || (!file && !pasted.trim())) return true;
    try {
      const r = file ? await uploadResume(file, 'Primary resume', true) : await createResumeFromText(pasted, 'Primary resume', true);
      setResumeDone(true);
      setParsed(r);
      audit('onboarding.resume_added', 'resume', { resume_id: r.id, via: file ? 'file' : 'text' });
      return true;
    } catch (err) {
      toast('error', friendlyError(err, 'Could not upload your resume.'));
      return false;
    }
  };

  const finish = async () => {
    const rows: { provider: string; board_token: string; company_name: string }[] = [];
    for (const b of boards) if (pickedBoards.has(b.board_token)) rows.push({ provider: b.provider, board_token: b.board_token, company_name: b.company_name ?? '' });
    const t = token.trim();
    if (t) {
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(t)) { toast('error', 'Board names can only contain letters, numbers, dots, dashes and underscores.'); return false; }
      rows.push({ provider, board_token: t, company_name: '' });
    }
    if (rows.length) {
      const { error } = await supabase.from('job_sources').upsert(rows, { onConflict: 'user_id,provider,board_token', ignoreDuplicates: true });
      if (error) { toast('error', friendlyError(error, 'Could not add that job source.')); return false; }
    }
    const { error } = await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', profile!.id);
    if (error) { toast('error', friendlyError(error)); return false; }
    audit('onboarding_completed', 'profile', { followed: rows.length });
    try {
      await callFunction('match-jobs', {});
      if (rows.length) await callFunction('job-sync', {});
    } catch (err) {
      console.error(err);
    }
    return true;
  };

  const next = async () => {
    setBusy(true);
    const ok = step === 0 ? await saveProfile() : step === 1 ? await savePrefs() : step === 2 ? await saveResume() : await finish();
    setBusy(false);
    if (!ok) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-ink-50">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
          <div className="animate-fade-up">
            <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/30">
              <Check className="h-10 w-10" strokeWidth={3} />
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/40" />
            </div>
            <h1 className="mt-8 font-display text-5xl text-ink-950">Your pipeline is live</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
              We are scoring openings against your dream role right now. Check the details anytime — everything stays editable, and nothing is ever sent without your approval.
            </p>
            <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Dream role</p>
                <p className="mt-1 text-sm font-bold text-ink-900">{pr.target_titles[0] || 'Any role'}</p>
                <p className="text-xs text-ink-500">{pr.locations[0] || 'Anywhere'}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Resume</p>
                <p className="mt-1 text-sm font-bold text-ink-900">{resumeDone ? 'Ready' : 'Add it later'}</p>
                <p className="text-xs text-ink-500">{resumeDone ? 'Review it in Resume Studio' : 'Needed before applying'}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Watching</p>
                <p className="mt-1 text-sm font-bold text-ink-900">{sources.length + pickedBoards.size + (token.trim() ? 1 : 0)} {sources.length + pickedBoards.size === 0 ? 'boards' : 'companies'}</p>
                <p className="text-xs text-ink-500">Fresh listings daily</p>
              </div>
            </div>
            <Button className="mt-8 w-full py-3 text-base" onClick={() => refresh()}>
              See my matches <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 lg:grid-cols-[300px_1fr] lg:py-16">
        <aside className="hidden lg:block">
          <div className="mb-10 flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white"><Route className="h-5 w-5" /></div>
            <span className="text-lg font-bold">Applyline</span>
          </div>
          <p className="label">Setup · step {step + 1} of {STEPS.length}</p>
          <ol className="mt-3 space-y-1">
            {STEPS.map((s, i) => {
              const Icon = RAIL[i].icon;
              return (
                <li key={s}>
                  <button
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                      i === step ? 'bg-white shadow-sm ring-1 ring-ink-200' : i < step ? 'hover:bg-white/60 cursor-pointer' : 'opacity-50'
                    }`}
                  >
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                      i < step ? 'bg-brand-100 text-brand-700' : i === step ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400'
                    }`}>
                      {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span>
                      <span className={`block text-sm font-bold ${i === step ? 'text-ink-950' : 'text-ink-600'}`}>{s}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{RAIL[i].desc}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-10 flex items-start gap-2 rounded-xl bg-white/70 p-3 text-xs leading-relaxed text-ink-500 ring-1 ring-ink-200/70">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
            Everything you enter stays private to your account and editable later. You can skip any step except your dream role.
          </p>
        </aside>

        <main>
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><Route className="h-4 w-4" /></div>
            <span className="font-bold text-ink-950">Applyline</span>
          </div>
          <div className="mb-6 lg:hidden">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
              <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs font-bold text-ink-500">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          </div>

          <div key={step} className="card animate-fade-up p-6 sm:p-8">
            {step === 0 && (
              <>
                <h1 className="font-display text-4xl">Tell us about you</h1>
                <p className="mb-6 mt-2 text-sm text-ink-500">These facts fill application forms automatically — accurately, and only with what you give us.</p>
                <ProfileForm value={p} onChange={setP} />
              </>
            )}
            {step === 1 && (
              <>
                <h1 className="font-display text-4xl">Describe your dream role</h1>
                <p className="mb-6 mt-2 text-sm text-ink-500">This is the compass for every match score. Aim high — you can refine it whenever.</p>
                <div className="space-y-5">
                  <Field label="Target job titles" hint="Press Enter after each one.">
                    <TagPicker value={pr.target_titles} onChange={(v) => setPr({ ...pr, target_titles: v })} placeholder="e.g. Frontend Engineer" />
                  </Field>
                  <div>
                    <span className="label">Popular right now — tap to add</span>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {TITLE_SUGGESTIONS.filter((t) => !pr.target_titles.some((v) => v.toLowerCase() === t.toLowerCase())).map((t) => (
                        <button key={t} type="button" onClick={() => setPr({ ...pr, target_titles: [...pr.target_titles, t] })}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 transition hover:-translate-y-0.5 hover:ring-brand-400 hover:text-brand-700">
                          + {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Where" hint="Press Enter after each place."><TagPicker value={pr.locations} onChange={(v) => setPr({ ...pr, locations: v })} placeholder="New York, Remote" /></Field>
                    <Field label="Minimum salary (annual)">
                      <div className="flex gap-2">
                        <select className="input w-24" value={pr.salary_currency} onChange={(e) => setPr({ ...pr, salary_currency: e.target.value })}>
                          {['USD', 'CAD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
                        </select>
                        <input className="input" type="number" min={0} step={1000} value={pr.min_salary || ''} placeholder="No floor"
                          onChange={(e) => setPr({ ...pr, min_salary: Math.max(0, Number(e.target.value) || 0) })} />
                      </div>
                    </Field>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="label mb-0">Salary floor</span>
                      <span className="text-sm font-bold text-brand-700">{pr.min_salary > 0 ? money(pr.min_salary) : 'Any salary'}</span>
                    </div>
                    <input type="range" min={0} max={300000} step={5000} value={pr.min_salary}
                      onChange={(e) => setPr({ ...pr, min_salary: Number(e.target.value) })}
                      className="mt-2 w-full accent-brand-600" aria-label="Minimum salary" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div><span className="label">Work arrangement</span><Chips options={['remote', 'hybrid', 'onsite']} value={pr.work_arrangements} onChange={(v) => setPr({ ...pr, work_arrangements: v })} /></div>
                    <div><span className="label">Seniority</span><Chips options={['intern', 'entry', 'mid', 'senior', 'lead']} value={pr.seniority_levels} onChange={(v) => setPr({ ...pr, seniority_levels: v })} /></div>
                    <div><span className="label">Employment type</span><Chips options={['Full-time', 'Part-time', 'Contract', 'Internship']} value={pr.employment_types} onChange={(v) => setPr({ ...pr, employment_types: v })} /></div>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-sky-50 p-5 ring-1 ring-brand-100">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-700"><Sparkles className="h-3.5 w-3.5" />Your dream role so far</p>
                    {dreamPreview.length ? (
                      <p className="mt-2 font-display text-2xl leading-snug text-ink-950">
                        {dreamPreview.map((b, i) => <span key={i}>{i > 0 && <span className="mx-2 text-ink-300">·</span>}{b}</span>)}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-ink-500">Add a title above and watch it take shape.</p>
                    )}
                  </div>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className="font-display text-4xl">Add your resume</h1>
                <p className="mb-6 mt-2 text-sm text-ink-500">Drop in a file and we will pull out your roles, skills and education — then you check every detail.</p>
                {resumeDone ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-200"><Check className="h-5 w-5" /></span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-ink-950">Resume read successfully</p>
                        <p className="text-xs text-ink-500">You can fine-tune everything in Resume Studio after setup.</p>
                      </div>
                    </div>
                    {parsed && (
                      <div className="rounded-2xl border border-ink-200 bg-white p-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-400">What we found</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge tone="brand"><Briefcase className="h-3 w-3" />{parsed.parsed?.experience?.length ?? 0} roles</Badge>
                          <Badge tone="sky"><Sparkles className="h-3 w-3" />{parsed.parsed?.skills?.length ?? 0} skills</Badge>
                          <Badge tone="neutral"><GraduationCap className="h-3 w-3" />{parsed.parsed?.education?.length ?? 0} education</Badge>
                          {typeof parsed.parsed?.estimated_years === 'number' && parsed.parsed.estimated_years > 0 && (
                            <Badge tone="success"><Target className="h-3 w-3" />~{parsed.parsed.estimated_years} yrs experience</Badge>
                          )}
                        </div>
                        {!!parsed.parsed?.skills?.length && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {parsed.parsed.skills.slice(0, 12).map((s) => <span key={s} className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">{s}</span>)}
                            {(parsed.parsed.skills.length ?? 0) > 12 && <span className="text-[11px] text-ink-400">+{parsed.parsed.skills.length - 12} more</span>}
                          </div>
                        )}
                        {parsed.quality && <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">{resumeQualityLabel(parsed.quality)} — you can re-check it anytime from Resume Studio.</p>}
                        {parsed.parse_status !== 'parsed' && <p className="mt-3 text-xs text-amber-700">We saved the file but could not read everything automatically. Resume Studio lets you paste text or fill details in.</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (!f) return;
                        const problem = resumeFileProblem(f);
                        if (problem) toast('error', problem); else setFile(f);
                      }}
                      className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                        dragOver ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/10' : 'border-ink-200 hover:border-brand-400 hover:bg-brand-50/40'
                      }`}
                    >
                      {file ? (
                        <>
                          <span className="flex w-full max-w-xs items-center gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-ink-200">
                            <FileText className="h-5 w-5 shrink-0 text-brand-600" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-ink-900">{file.name}</span>
                              <span className="block text-xs text-ink-500">{(file.size / 1024 / 1024).toFixed(1)} MB · ready to read</span>
                            </span>
                            <button type="button" aria-label="Remove file" onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-ink-400 transition hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                          </span>
                          <span className="mt-3 text-xs text-ink-500">Click again to choose a different file</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-8 w-8 text-brand-600" />
                          <span className="mt-3 text-sm font-semibold text-ink-900">Drop your resume here, or click to browse</span>
                          <span className="mt-1 text-xs text-ink-500">PDF or DOCX, up to 10 MB. Stored privately in your account.</span>
                        </>
                      )}
                      <input type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const problem = resumeFileProblem(f);
                        if (problem) toast('error', problem); else setFile(f);
                      }} />
                    </label>
                    {showPaste ? (
                      <textarea className="input min-h-[140px]" value={pasted} onChange={(e) => setPasted(e.target.value)} disabled={!!file} placeholder="Paste the full text of your resume" />
                    ) : (
                      <button type="button" onClick={() => setShowPaste(true)} className="text-xs font-semibold text-brand-700 underline-offset-2 hover:underline">
                        Prefer to paste text instead?
                      </button>
                    )}
                    <p className="text-xs text-ink-500">You can skip this and add a resume later, but applications cannot be prepared without one.</p>
                  </div>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h1 className="font-display text-4xl">Who should we watch?</h1>
                <p className="mb-6 mt-2 text-sm text-ink-500">Pick companies and we check their public job boards daily for fresh openings. You can add many more later.</p>
                {sources.length > 0 && (
                  <div className="mb-5 flex w-full items-start gap-4 rounded-2xl border border-brand-500 bg-brand-50/60 p-4 ring-4 ring-brand-500/10">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-200"><Building2 className="h-5 w-5" /></span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-ink-900">You follow {sources.length} {sources.length === 1 ? 'company' : 'companies'}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-600">
                        {names.join(', ')}{sources.length > names.length ? ' and more' : ''}.{' '}
                        {lastSync ? `Openings last updated ${relativeTime(lastSync)}.` : 'Openings will load shortly.'}
                      </span>
                    </span>
                    <span className="grid h-5 w-5 place-items-center rounded-full border border-brand-600 bg-brand-600 text-white"><Check className="h-3 w-3" /></span>
                  </div>
                )}
                {suggestions.loading ? (
                  <p className="text-sm text-ink-400">Loading popular companies…</p>
                ) : boards.length > 0 && (
                  <div>
                    <p className="label">Tap to follow</p>
                    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                      {boards.map((b) => {
                        const on = pickedBoards.has(b.board_token);
                        return (
                          <button key={b.board_token} type="button"
                            onClick={() => setPickedBoards((s) => { const n = new Set(s); if (on) n.delete(b.board_token); else n.add(b.board_token); return n; })}
                            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 transition ${
                              on ? 'bg-brand-600 text-white ring-brand-600 shadow-md shadow-brand-600/20' : 'bg-white ring-ink-200 hover:-translate-y-0.5 hover:ring-brand-400'
                            }`}>
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${on ? 'bg-white/15' : 'bg-brand-50 text-brand-700'}`}><Building2 className="h-4 w-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">{b.company_name || b.board_token}</span>
                              <span className={`block text-xs ${on ? 'text-brand-100' : 'text-ink-500'}`}>{b.job_count > 0 ? `${b.job_count} open roles` : 'Active board'}</span>
                            </span>
                            <span className={`grid h-5 w-5 place-items-center rounded-full border ${on ? 'border-white bg-white text-brand-700' : 'border-ink-300'}`}>
                              {on && <Check className="h-3 w-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mt-6 border-t border-ink-100 pt-5">
                  <p className="label">Or add a specific company</p>
                  <div className="mt-1.5 grid gap-4 sm:grid-cols-[180px_1fr]">
                    <Field label="Job board">
                      <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                        {(['greenhouse', 'lever', 'ashby'] as const).map((k) => <option key={k} value={k}>{PROVIDER_LABEL[k]}</option>)}
                      </select>
                    </Field>
                    <Field label="Board name" hint="From the careers link, e.g. boards.greenhouse.io/airbnb → airbnb">
                      <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional" maxLength={100} />
                    </Field>
                  </div>
                </div>
              </>
            )}

            <div className="mt-8 flex items-center justify-between border-t border-ink-100 pt-6">
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || busy} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button>
              <Button onClick={next} loading={busy} className="min-w-40">
                {step === STEPS.length - 1 ? 'Finish and find jobs' : step === 2 && !file && !pasted.trim() && !resumeDone ? 'Skip for now' : step === 1 && !pr.target_titles.length ? 'Add a role to continue' : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function TagPicker(props: Parameters<typeof TagInput>[0]) { return <TagInput {...props} />; }

function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.map((v) => v.toLowerCase()).includes(o.toLowerCase());
        return (
          <button key={o} type="button" onClick={() => onChange(on ? value.filter((v) => v.toLowerCase() !== o.toLowerCase()) : [...value, o])}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ring-1 ring-inset transition ${
              on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}
