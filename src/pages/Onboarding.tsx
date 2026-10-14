import { useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Route, UploadCloud } from 'lucide-react';
import { supabase, friendlyError, audit, callFunction } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button, Field, useToast } from '@/components/ui';
import { ProfileForm, PreferencesForm, pickPreferences, pickProfile, type PreferencesDraft, type ProfileDraft } from '@/components/ProfileForms';
import { createResumeFromText, resumeFileProblem, uploadResume } from '@/lib/resumes';
import { PROVIDER_LABEL } from '@/lib/format';

const STEPS = ['About you', 'What you want', 'Your resume', 'Job sources'];

export default function Onboarding() {
  const { profile, prefs, refresh } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [p, setP] = useState<ProfileDraft>(() => pickProfile(profile!));
  const [pr, setPr] = useState<PreferencesDraft>(() => pickPreferences(prefs!));
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [resumeDone, setResumeDone] = useState(false);
  const [provider, setProvider] = useState<'greenhouse' | 'lever' | 'ashby'>('greenhouse');
  const [token, setToken] = useState('');

  const saveProfile = async () => {
    if (!p.full_name.trim()) { toast('error', 'Add your name to continue.'); return false; }
    const { error } = await supabase.from('profiles').update(p).eq('id', profile!.id);
    if (error) { toast('error', friendlyError(error, 'Could not save your profile.')); return false; }
    return true;
  };

  const savePrefs = async () => {
    const { error } = await supabase.from('candidate_preferences').update(pr).eq('user_id', prefs!.user_id);
    if (error) { toast('error', friendlyError(error, 'Could not save your preferences.')); return false; }
    return true;
  };

  const saveResume = async () => {
    if (resumeDone || (!file && !pasted.trim())) return true;
    try {
      const r = file ? await uploadResume(file, 'Primary resume', true) : await createResumeFromText(pasted, 'Primary resume', true);
      setResumeDone(true);
      toast(r.parse_status === 'parsed' ? 'success' : 'info', r.parse_status === 'parsed'
        ? 'Resume read. Review the details in Resume Studio before applying.'
        : 'Resume saved, but we could not read it automatically. You can paste the text in Resume Studio.');
      return true;
    } catch (err) {
      toast('error', friendlyError(err, 'Could not upload your resume.'));
      return false;
    }
  };

  const finish = async () => {
    const rows: { provider: string; board_token: string; company_name: string }[] = [];
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
    audit('onboarding_completed', 'profile');
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
    else await refresh();
  };

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="mb-10 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white"><Route className="h-5 w-5" /></div>
          <span className="text-lg font-bold">Applyline</span>
        </div>
        <ol className="mb-8 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-brand-600' : 'bg-ink-200'}`} />
              <div className={`mt-2 hidden text-xs font-semibold sm:block ${i === step ? 'text-ink-900' : 'text-ink-400'}`}>{i + 1}. {s}</div>
            </li>
          ))}
        </ol>

        <div key={step} className="card animate-fade-up p-6 sm:p-8">
          {step === 0 && (
            <>
              <h1 className="font-display text-4xl">Tell us about you</h1>
              <p className="mb-6 mt-2 text-sm text-ink-500">These facts fill application forms. We only ever use what you enter here or on your resume.</p>
              <ProfileForm value={p} onChange={setP} />
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="font-display text-4xl">What are you looking for?</h1>
              <p className="mb-6 mt-2 text-sm text-ink-500">Matching uses these to score every role from 0 to 100. You can refine them later.</p>
              <PreferencesForm value={pr} onChange={setPr} compact />
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="font-display text-4xl">Add your resume</h1>
              <p className="mb-6 mt-2 text-sm text-ink-500">Upload a PDF or Word file. We extract your experience and skills, then you review and correct them.</p>
              {resumeDone ? (
                <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-sm font-semibold text-brand-800"><Check className="h-5 w-5" /> Resume saved.</div>
              ) : (
                <>
                  <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-ink-200 px-6 py-10 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
                    <UploadCloud className="h-8 w-8 text-brand-600" />
                    <span className="mt-3 text-sm font-semibold text-ink-900">{file ? file.name : 'Choose a PDF or DOCX'}</span>
                    <span className="mt-1 text-xs text-ink-500">Up to 10 MB. Stored privately in your account.</span>
                    <input type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const problem = resumeFileProblem(f);
                      if (problem) toast('error', problem); else setFile(f);
                    }} />
                  </label>
                  <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase text-ink-400"><span className="h-px flex-1 bg-ink-200" />or paste text<span className="h-px flex-1 bg-ink-200" /></div>
                  <textarea className="input min-h-[140px]" value={pasted} onChange={(e) => setPasted(e.target.value)} disabled={!!file} placeholder="Paste the full text of your resume" />
                  <p className="mt-3 text-xs text-ink-500">You can skip this and add a resume later, but applications cannot be prepared without one.</p>
                </>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="font-display text-4xl">Where should we look?</h1>
              <p className="mb-6 mt-2 text-sm text-ink-500">Add employer job boards that publish public listings. You can add many more from Discover Jobs.</p>
              <div className="flex w-full items-start gap-4 rounded-2xl border border-brand-500 bg-brand-50/60 p-4 ring-4 ring-brand-500/10">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-200"><Building2 className="h-5 w-5" /></span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-ink-900">You already follow 17 companies</span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-600">Stripe, OpenAI, Databricks, NVIDIA, Salesforce, Airbnb, Figma, Ramp and more. Their live openings refresh every hour. Add another company below if you like.</span>
                </span>
                <span className="grid h-5 w-5 place-items-center rounded-full border border-brand-600 bg-brand-600 text-white"><Check className="h-3 w-3" /></span>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-[180px_1fr]">
                <Field label="Real employer board">
                  <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                    {(['greenhouse', 'lever', 'ashby'] as const).map((k) => <option key={k} value={k}>{PROVIDER_LABEL[k]}</option>)}
                  </select>
                </Field>
                <Field label="Board name" hint="The name in the company's careers link, e.g. boards.greenhouse.io/airbnb → airbnb">
                  <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional" maxLength={100} />
                </Field>
              </div>
            </>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-ink-100 pt-6">
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || busy} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button>
            <Button onClick={next} loading={busy}>
              {step === STEPS.length - 1 ? 'Finish and find jobs' : step === 2 && !file && !pasted.trim() && !resumeDone ? 'Skip for now' : 'Continue'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
