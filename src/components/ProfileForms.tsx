import type { Preferences, Profile } from '@/lib/types';
import { Field, TagInput, Toggle } from '@/components/ui';

export type ProfileDraft = Pick<Profile, 'full_name' | 'headline' | 'phone' | 'location' | 'linkedin_url' | 'portfolio_url' |
  'years_experience' | 'work_authorization' | 'requires_sponsorship' | 'willing_to_relocate'>;

export type PreferencesDraft = Pick<Preferences, 'target_titles' | 'locations' | 'work_arrangements' | 'seniority_levels' | 'industries' |
  'employment_types' | 'keywords' | 'excluded_companies' | 'min_salary' | 'salary_currency'>;

export const WORK_AUTH_OPTIONS = [
  { value: '', label: 'Prefer not to say yet' },
  { value: 'citizen', label: 'Citizen' },
  { value: 'permanent_resident', label: 'Permanent resident' },
  { value: 'work_visa', label: 'Work visa (current)' },
  { value: 'student_visa', label: 'Student visa / OPT / CPT' },
  { value: 'none', label: 'Not authorized yet' },
];

export function pickProfile(p: Profile): ProfileDraft {
  const { full_name, headline, phone, location, linkedin_url, portfolio_url, years_experience, work_authorization, requires_sponsorship, willing_to_relocate } = p;
  return { full_name, headline, phone, location, linkedin_url, portfolio_url, years_experience, work_authorization, requires_sponsorship, willing_to_relocate };
}

export function pickPreferences(p: Preferences): PreferencesDraft {
  const { target_titles, locations, work_arrangements, seniority_levels, industries, employment_types, keywords, excluded_companies, min_salary, salary_currency } = p;
  return { target_titles, locations, work_arrangements, seniority_levels, industries, employment_types, keywords, excluded_companies, min_salary, salary_currency };
}

export function ProfileForm({ value, onChange }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void }) {
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name"><input className="input" value={value.full_name} maxLength={120} onChange={(e) => set('full_name', e.target.value)} /></Field>
      <Field label="Headline"><input className="input" value={value.headline} maxLength={160} placeholder="e.g. Frontend engineer, React + TypeScript" onChange={(e) => set('headline', e.target.value)} /></Field>
      <Field label="Phone"><input className="input" value={value.phone} maxLength={40} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="Current location"><input className="input" value={value.location} maxLength={120} placeholder="City, State" onChange={(e) => set('location', e.target.value)} /></Field>
      <Field label="LinkedIn URL"><input className="input" type="url" value={value.linkedin_url} maxLength={300} onChange={(e) => set('linkedin_url', e.target.value)} /></Field>
      <Field label="Portfolio / website"><input className="input" type="url" value={value.portfolio_url} maxLength={300} onChange={(e) => set('portfolio_url', e.target.value)} /></Field>
      <Field label="Years of professional experience">
        <input className="input" type="number" min={0} max={60} step={0.5} value={value.years_experience}
          onChange={(e) => set('years_experience', Math.max(0, Math.min(60, Number(e.target.value) || 0)))} />
      </Field>
      <Field label="Work authorization" hint="Used only for eligibility checks and questions you approve.">
        <select className="input" value={value.work_authorization} onChange={(e) => set('work_authorization', e.target.value)}>
          {WORK_AUTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">I will need visa sponsorship</div>
          <div className="text-xs text-ink-500">Roles that say they cannot sponsor will be filtered out.</div>
        </div>
        <Toggle checked={value.requires_sponsorship} onChange={(v) => set('requires_sponsorship', v)} />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">Willing to relocate</div>
          <div className="text-xs text-ink-500">Otherwise onsite roles elsewhere are excluded.</div>
        </div>
        <Toggle checked={value.willing_to_relocate} onChange={(v) => set('willing_to_relocate', v)} />
      </div>
    </div>
  );
}

const ARRANGEMENTS = ['remote', 'hybrid', 'onsite'];
const SENIORITY = ['intern', 'entry', 'mid', 'senior', 'lead', 'executive'];
const EMPLOYMENT = ['Full-time', 'Part-time', 'Contract', 'Internship'];

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

export function PreferencesForm({ value, onChange, compact }: { value: PreferencesDraft; onChange: (v: PreferencesDraft) => void; compact?: boolean }) {
  const set = <K extends keyof PreferencesDraft>(k: K, v: PreferencesDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Target job titles" hint="Press Enter after each title."><TagInput value={value.target_titles} onChange={(v) => set('target_titles', v)} placeholder="Frontend Engineer, Data Analyst" /></Field></div>
      <Field label="Preferred locations"><TagInput value={value.locations} onChange={(v) => set('locations', v)} placeholder="New York, Remote" /></Field>
      <Field label="Minimum salary (annual)">
        <div className="flex gap-2">
          <select className="input w-24" value={value.salary_currency} onChange={(e) => set('salary_currency', e.target.value)}>
            {['USD', 'CAD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="input" type="number" min={0} step={1000} value={value.min_salary}
            onChange={(e) => set('min_salary', Math.max(0, Number(e.target.value) || 0))} />
        </div>
      </Field>
      <div><span className="label">Work arrangement</span><Chips options={ARRANGEMENTS} value={value.work_arrangements} onChange={(v) => set('work_arrangements', v)} /></div>
      <div><span className="label">Seniority</span><Chips options={SENIORITY} value={value.seniority_levels} onChange={(v) => set('seniority_levels', v)} /></div>
      <div><span className="label">Employment type</span><Chips options={EMPLOYMENT} value={value.employment_types} onChange={(v) => set('employment_types', v)} /></div>
      {!compact && (
        <>
          <Field label="Industries"><TagInput value={value.industries} onChange={(v) => set('industries', v)} placeholder="Fintech, Healthcare" /></Field>
          <Field label="Keywords to favor"><TagInput value={value.keywords} onChange={(v) => set('keywords', v)} placeholder="React, accessibility" /></Field>
          <Field label="Never apply to these companies"><TagInput value={value.excluded_companies} onChange={(v) => set('excluded_companies', v)} placeholder="Company name" /></Field>
        </>
      )}
    </div>
  );
}
