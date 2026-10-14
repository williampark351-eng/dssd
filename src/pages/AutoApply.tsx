import { useState, type ReactNode } from 'react';
import { Bot, Hand, Play, ShieldAlert, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { supabase, callFunction, friendlyError, audit } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { formatDate } from '@/lib/format';
import type { ApplyMode, Preferences } from '@/lib/types';
import { Button, Card, Modal, PageHeader, StatCard, Toggle, useToast } from '@/components/ui';

const MODES: { key: ApplyMode; title: string; icon: typeof Hand; body: string; points: string[] }[] = [
  { key: 'manual', title: 'Manual', icon: Hand, body: 'We prepare packets. You submit on the employer site yourself.',
    points: ['Tailored resume and cover letter', 'Answers pre-filled for copy and paste', 'You record when you have applied'] },
  { key: 'assisted', title: 'Assisted', icon: Sparkles, body: 'We prepare everything and wait for your approval on every application.',
    points: ['You review each packet', 'Submits only after you approve', 'Recommended for most people'] },
  { key: 'auto', title: 'Auto-apply', icon: Zap, body: 'Strong matches with complete answers are submitted without asking, within your limits.',
    points: ['Only at or above your minimum score', 'Never answers sensitive questions for you', 'Stops at your daily limit'] },
];

const CONSENT_VERSION = 'auto-apply-v1';

const CONSENT_ITEMS = [
  'Applications may be sent in my name to employers without asking me each time.',
  'Only information from my profile, reviewed resume and approved answers will be used. Nothing will be invented.',
  'Anything uncertain, sensitive, or protected by a CAPTCHA or login check will pause and ask me.',
  'I can pause or stop automation at any time, and switching modes withdraws this consent.',
];

export default function AutoApply() {
  const { prefs, setPrefs, refresh } = useAuth();
  const { navigate } = useNav();
  const toast = useToast();
  const [consentOpen, setConsentOpen] = useState(false);
  const [checks, setChecks] = useState<boolean[]>(CONSENT_ITEMS.map(() => false));
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const stats = useAsync(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const apps = await must(supabase.from('applications').select('state, submitted_at, submission_method'));
    const rows = apps as { state: string; submitted_at: string | null; submission_method: string | null }[];
    return {
      queued: rows.filter((r) => r.state === 'QUEUED').length,
      review: rows.filter((r) => r.state === 'READY_FOR_REVIEW' || r.state === 'NEEDS_USER_ACTION').length,
      today: rows.filter((r) => r.submitted_at && new Date(r.submitted_at) >= today && r.submission_method === 'provider_api').length,
    };
  });

  if (!prefs) return null;

  const save = async (fields: Partial<Preferences>, message?: string) => {
    setSaving(true);
    const { data, error } = await supabase.from('candidate_preferences').update(fields).eq('user_id', prefs.user_id).select().maybeSingle();
    setSaving(false);
    if (error || !data) { toast('error', friendlyError(error, 'Could not save these settings.')); return false; }
    const next = data as Preferences;
    setPrefs(next);
    if (prefs.apply_mode === 'auto' && next.apply_mode !== 'auto') {
      toast('info', 'You loosened your auto-apply limits, so auto-apply was turned off. Turn it on again to agree to the new limits.');
    } else if (message) toast('success', message);
    return true;
  };

  const chooseMode = async (mode: ApplyMode) => {
    if (mode === prefs.apply_mode) return;
    if (mode === 'auto') { setChecks(CONSENT_ITEMS.map(() => false)); setConsentOpen(true); return; }
    setSaving(true);
    const { error } = await supabase.rpc('set_apply_mode', { p_mode: mode });
    if (!error) await refresh();
    setSaving(false);
    if (error) { toast('error', friendlyError(error, 'Could not change the mode.')); return; }
    toast('success', `Switched to ${mode} mode.`);
  };

  const grantConsent = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('grant_auto_apply_consent', { p_policy_version: CONSENT_VERSION, p_statements: CONSENT_ITEMS });
    if (!error) await refresh();
    setSaving(false);
    if (error) { toast('error', friendlyError(error, 'Could not turn on auto-apply.')); return; }
    toast('success', 'Auto-apply is on.');
    setConsentOpen(false);
  };

  const run = async () => {
    setRunning(true);
    try {
      const res = await callFunction<{ processed: number; paused: boolean }>('application-worker', {});
      toast(res.paused ? 'info' : 'success', res.paused ? 'Automation is paused, so nothing was processed.' : `Processed ${res.processed} application${res.processed === 1 ? '' : 's'}.`);
      stats.reload();
    } catch (err) {
      toast('error', friendlyError(err, 'The queue could not be processed.'));
    }
    setRunning(false);
  };

  return (
    <>
      <PageHeader title="Auto-apply" subtitle="Decide how much happens without you. Every submission is logged with the exact resume, letter and answers used."
        actions={<Button onClick={run} loading={running} disabled={prefs.automation_paused} icon={<Play className="h-4 w-4" />}>Process queue now</Button>} />

      {prefs.automation_paused && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span className="flex-1">All automation is paused. Nothing will be prepared or submitted until you resume.</span>
          <Button size="sm" variant="dark" onClick={() => save({ automation_paused: false }, 'Automation resumed.')}>Resume</Button>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting in queue" value={stats.data?.queued ?? '—'} icon={<Bot className="h-4 w-4" />} tone="sky" />
        <StatCard label="Waiting on you" value={stats.data?.review ?? '—'} icon={<Hand className="h-4 w-4" />} tone="amber" hint="Open the queue to review" />
        <StatCard label="Sent today" value={`${stats.data?.today ?? '—'} / ${prefs.daily_quota}`} icon={<Zap className="h-4 w-4" />} hint="Daily limit applies to automated sends" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {MODES.map(({ key, title, icon: Icon, body, points }) => {
          const active = prefs.apply_mode === key;
          return (
            <button key={key} onClick={() => chooseMode(key)} disabled={saving}
              className={`card relative p-6 text-left transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-brand-500 ring-4 ring-brand-500/15' : ''}`}>
              {active && <span className="absolute right-4 top-4 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Active</span>}
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${active ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}><Icon className="h-5 w-5" /></span>
              <h3 className="mt-4 text-base font-bold text-ink-950">{title}</h3>
              <p className="mt-1 text-sm text-ink-600">{body}</p>
              <ul className="mt-4 space-y-1.5 text-xs text-ink-600">{points.map((p) => <li key={p} className="flex gap-2"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" />{p}</li>)}</ul>
            </button>
          );
        })}
      </div>
      {prefs.apply_mode === 'auto' && prefs.auto_apply_consent_at && (
        <p className="mt-3 text-xs text-ink-500">
          You agreed on {formatDate(prefs.auto_apply_consent_at, true)} to auto-apply at score {prefs.auto_min_score}+ and up to {prefs.daily_quota} per day.
          Switching modes, lowering the score or raising the daily limit turns auto-apply off until you agree again.
        </p>
      )}

      <Card className="mt-8 divide-y divide-ink-100">
        <SettingRow title="Minimum match score for auto-submit" body="Lower-scoring roles in the queue are prepared and wait for your review instead.">
          <div className="flex items-center gap-3">
            <input type="range" min={50} max={100} step={1} value={prefs.auto_min_score} className="w-40 accent-brand-600"
              onMouseUp={(e) => save({ auto_min_score: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => save({ auto_min_score: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={(e) => save({ auto_min_score: Number((e.target as HTMLInputElement).value) })}
              onChange={(e) => setPrefs({ ...prefs, auto_min_score: Number(e.target.value) })} />
            <span className="w-8 text-right text-sm font-bold text-ink-900">{prefs.auto_min_score}</span>
          </div>
        </SettingRow>
        <SettingRow title="Daily submission limit" body="Automated submissions stop at this number each day. Remaining items roll to tomorrow.">
          <input type="number" min={0} max={50} className="input w-24" defaultValue={prefs.daily_quota}
            onBlur={(e) => save({ daily_quota: Math.max(0, Math.min(50, Math.round(Number(e.target.value) || 0))) }, 'Daily limit updated.')} />
        </SettingRow>
        <SettingRow title="Write cover letters" body="Generated only from facts on your resume. You can edit each one before it is sent.">
          <Toggle checked={prefs.generate_cover_letters} onChange={(v) => save({ generate_cover_letters: v })} disabled={saving} />
        </SettingRow>
        <SettingRow title="Pause all automation" body="Stops anything new from being prepared or sent. Applications an employer has already received stay sent; pausing does not withdraw them.">
          <Toggle checked={prefs.automation_paused} onChange={(v) => { save({ automation_paused: v }, v ? 'Automation paused.' : 'Automation resumed.'); audit(v ? 'automation_paused' : 'automation_resumed', 'candidate_preferences'); }} disabled={saving} />
        </SettingRow>
      </Card>

      <Card className="mt-6 bg-ink-950 p-6 text-sm text-ink-200">
        <h3 className="mb-3 font-bold text-white">How submissions actually happen</h3>
        <ul className="space-y-2 leading-relaxed">
          <li>Greenhouse roles can be sent directly only where the employer has authorized it. Right before sending we reload the employer's current form; if any required item can't be filled exactly, it comes back to you instead.</li>
          <li>Lever, Workday, Ashby and other systems are never sent automatically, because we can't see every question they ask. The packet waits for you: open the employer's form, use your Fill button, attach your resume and submit, then record it here.</li>
          <li>Every send is re-checked at the last moment against your current limits, pause setting, excluded companies and whether the listing is still open.</li>
          <li>We never get around CAPTCHAs or login checks. If a site asks for one, the application pauses and asks you to finish it.</li>
          <li>If we cannot confirm a submission went through, it is marked as unverified, never as submitted.</li>
        </ul>
        <button onClick={() => navigate('queue')} className="mt-4 text-sm font-semibold text-brand-300 hover:text-brand-200">Open the application queue →</button>
      </Card>

      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Turn on auto-apply"
        footer={<><Button variant="secondary" onClick={() => setConsentOpen(false)}>Cancel</Button><Button onClick={grantConsent} loading={saving} disabled={!checks.every(Boolean)}>I agree, turn it on</Button></>}>
        <p className="mb-4 text-sm text-ink-600">Please confirm each statement. Your consent is recorded with a timestamp in your activity log.</p>
        <div className="space-y-3">
          {CONSENT_ITEMS.map((c, i) => (
            <label key={c} className="flex cursor-pointer gap-3 rounded-xl border border-ink-200 p-3 text-sm text-ink-800 transition hover:bg-ink-50">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={checks[i]}
                onChange={(e) => setChecks((xs) => xs.map((x, j) => (j === i ? e.target.checked : x)))} />
              {c}
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-500">
          You are agreeing to these limits: score {prefs.auto_min_score}+ and up to {prefs.daily_quota} per day (consent version {CONSENT_VERSION}).
          If you later lower the score or raise the limit, auto-apply turns off until you agree again.
        </p>
      </Modal>
    </>
  );
}

function SettingRow({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-lg">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="text-xs text-ink-500">{body}</p>
      </div>
      {children}
    </div>
  );
}
