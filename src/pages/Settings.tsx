import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabase, callFunction, friendlyError, audit } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import type { Weights } from '@/lib/types';
import { Button, Card, PageHeader, useToast } from '@/components/ui';
import { PreferencesForm, ProfileForm, pickPreferences, pickProfile, type PreferencesDraft, type ProfileDraft } from '@/components/ProfileForms';
import { WEIGHT_LABELS } from '@/components/JobDetail';
import PrivacyPanel from '@/components/PrivacyPanel';
import MembershipsPanel from '@/components/MembershipsPanel';
import FillButtonCard from '@/components/FillButtonCard';

const TABS = [['profile', 'Profile'], ['preferences', 'Job preferences'], ['organizations', 'Organizations'], ['privacy', 'Privacy and data']] as const;
type TabKey = (typeof TABS)[number][0];
const DEFAULT_WEIGHTS: Weights = { experience: 25, skills: 25, title: 15, location: 10, seniority: 10, compensation: 10, other: 5 };

export default function Settings() {
  const { profile, prefs, setProfile, setPrefs } = useAuth();
  const { param, navigate } = useNav();
  const toast = useToast();
  const inviteToken = param?.startsWith('invite-') ? param.slice(7) : '';
  const tab: TabKey = inviteToken ? 'organizations' : (TABS.find(([k]) => k === param)?.[0] ?? 'profile');

  const [pd, setPd] = useState<ProfileDraft | null>(null);
  const [prd, setPrd] = useState<PreferencesDraft | null>(null);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (profile) setPd(pickProfile(profile)); }, [profile]);
  useEffect(() => { if (prefs) { setPrd(pickPreferences(prefs)); setWeights({ ...DEFAULT_WEIGHTS, ...prefs.weights }); } }, [prefs]);

  const total = Object.values(weights).reduce((s, v) => s + v, 0);

  const saveProfile = async () => {
    if (!pd || !profile) return;
    if (!pd.full_name.trim()) { toast('error', 'Add your name.'); return; }
    setSaving(true);
    const row = { ...pd, years_experience: Math.max(0, Math.min(70, Number(pd.years_experience) || 0)), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('profiles').update(row).eq('id', profile.id);
    setSaving(false);
    if (error) { toast('error', friendlyError(error, 'Could not save your profile.')); return; }
    setProfile({ ...profile, ...row });
    audit('profile.updated', 'profile');
    toast('success', 'Profile saved. Matches will refresh in the background.');
    callFunction('match-jobs', {}).catch((e) => console.error(e));
  };

  const savePrefs = async () => {
    if (!prd || !prefs) return;
    if (total !== 100) { toast('error', 'Match weights must add up to 100.'); return; }
    setSaving(true);
    const row = { ...prd, min_salary: Math.max(0, Number(prd.min_salary) || 0), weights };
    const { error } = await supabase.from('candidate_preferences').update(row).eq('user_id', prefs.user_id);
    setSaving(false);
    if (error) { toast('error', friendlyError(error, 'Could not save your preferences.')); return; }
    setPrefs({ ...prefs, ...row });
    audit('preferences.updated', 'preferences');
    toast('success', 'Preferences saved. Re-scoring your matches now.');
    callFunction('match-jobs', {}).catch((e) => console.error(e));
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile, how jobs are matched, your organizations, and control over your data." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-100">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => navigate('settings', k)} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === k ? 'border-brand-600 text-ink-950' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>{l}</button>
        ))}
      </div>

      {tab === 'profile' && pd && (
        <div className="space-y-6">
          <Card className="p-6">
            <ProfileForm value={pd} onChange={setPd} />
            <div className="mt-6 flex justify-end"><Button onClick={saveProfile} loading={saving} icon={<Save className="h-4 w-4" />}>Save profile</Button></div>
          </Card>
          <FillButtonCard />
        </div>
      )}

      {tab === 'preferences' && prd && (
        <div className="space-y-6">
          <Card className="p-6"><PreferencesForm value={prd} onChange={setPrd} /></Card>
          <Card className="p-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink-950">Match weights</h2>
              <span className={`text-sm font-bold ${total === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>{total} / 100</span>
            </div>
            <p className="mb-5 text-sm text-ink-500">How much each factor counts toward a role's 0–100 score. Eligibility rules (like sponsorship and excluded companies) are always applied first.</p>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {(Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]).map((k) => (
                <label key={k} className="block">
                  <div className="mb-1 flex justify-between text-sm"><span className="font-semibold text-ink-800">{WEIGHT_LABELS[k]}</span><span className="tabular-nums text-ink-500">{weights[k]}</span></div>
                  <input type="range" min={0} max={50} value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} className="w-full accent-brand-600" />
                </label>
              ))}
            </div>
            <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="mt-4 text-xs font-semibold text-brand-700 hover:text-brand-800">Reset to recommended</button>
          </Card>
          <div className="flex justify-end"><Button onClick={savePrefs} loading={saving} disabled={total !== 100} icon={<Save className="h-4 w-4" />}>Save preferences</Button></div>
        </div>
      )}

      {tab === 'organizations' && <MembershipsPanel initialToken={inviteToken} />}
      {tab === 'privacy' && <PrivacyPanel />}
    </>
  );
}
