import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import type { Education, Experience, ParsedResume, Resume } from '@/lib/types';
import { Button, Drawer, Field, TagInput, useToast } from '@/components/ui';

const EMPTY: ParsedResume = {
  contact: { name: '', email: '', phone: '', linkedin: '', website: '', location: '' },
  summary: '', experience: [], education: [], skills: [], certifications: [], accomplishments: [], estimated_years: 0,
};

function normalize(p: Partial<ParsedResume>): ParsedResume {
  return {
    ...EMPTY, ...p,
    contact: { ...EMPTY.contact, ...(p.contact ?? {}) },
    experience: (p.experience ?? []).map((e) => ({ title: '', company: '', location: '', start: '', end: '', bullets: [], ...(e as Partial<Experience>) })),
    education: (p.education ?? []).map((e) => ({ degree: '', school: '', start: '', end: '', details: '', ...(e as Partial<Education>) })),
  };
}

export default function ResumeEditor({ resume, onClose, onSaved }: { resume: Resume | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [p, setP] = useState<ParsedResume>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!resume) return;
    setName(resume.name);
    setCategory(resume.target_category ?? '');
    setP(normalize(resume.parsed ?? {}));
  }, [resume]);

  if (!resume) return null;

  const setExp = (i: number, patch: Partial<Experience>) => setP({ ...p, experience: p.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const setEdu = (i: number, patch: Partial<Education>) => setP({ ...p, education: p.education.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const save = async (markReviewed: boolean) => {
    setSaving(true);
    const cleaned: ParsedResume = {
      ...p,
      experience: p.experience.filter((e) => e.title.trim() || e.company.trim()).map((e) => ({ ...e, bullets: e.bullets.map((b) => b.trim()).filter(Boolean) })),
      education: p.education.filter((e) => e.degree.trim() || e.school.trim()),
      estimated_years: Math.max(0, Math.min(70, Number(p.estimated_years) || 0)),
    };
    const { error } = await supabase.from('resumes').update({
      name: name.trim().slice(0, 120) || resume.name, target_category: category.trim().slice(0, 120), parsed: cleaned,
      reviewed: markReviewed || resume.reviewed, parse_status: resume.parse_status === 'failed' ? 'manual' : resume.parse_status,
      updated_at: new Date().toISOString(),
    }).eq('id', resume.id);
    setSaving(false);
    if (error) { toast('error', friendlyError(error, 'Could not save this resume.')); return; }
    if (markReviewed) audit('resume.reviewed', 'resume', { resume_id: resume.id });
    toast('success', markReviewed ? 'Resume reviewed and saved.' : 'Resume saved.');
    onSaved();
  };

  const contactField = (key: keyof ParsedResume['contact'], label: string) => (
    <Field label={label}><input className="input" value={p.contact[key]} maxLength={300} onChange={(e) => setP({ ...p, contact: { ...p.contact, [key]: e.target.value } })} /></Field>
  );

  return (
    <Drawer open onClose={onClose} title="Review resume" subtitle="Check what we extracted. Applications only ever use what is written here."
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => save(false)} loading={saving}>Save</Button>
        <Button onClick={() => save(true)} loading={saving} icon={<CheckCircle2 className="h-4 w-4" />}>{resume.reviewed ? 'Save reviewed copy' : 'Mark as reviewed'}</Button>
      </div>}>
      <div className="space-y-8">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Version name"><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Best for (role family)" hint="e.g. Data analyst, Frontend engineer"><input className="input" value={category} maxLength={120} onChange={(e) => setCategory(e.target.value)} /></Field>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold text-ink-900">Contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {contactField('name', 'Name')}{contactField('email', 'Email')}{contactField('phone', 'Phone')}
            {contactField('location', 'Location')}{contactField('linkedin', 'LinkedIn')}{contactField('website', 'Website')}
          </div>
        </section>

        <section>
          <Field label="Summary"><textarea className="input min-h-[96px]" value={p.summary} maxLength={3000} onChange={(e) => setP({ ...p, summary: e.target.value })} /></Field>
          <div className="mt-4 w-40"><Field label="Years of experience"><input type="number" min={0} max={70} className="input" value={p.estimated_years} onChange={(e) => setP({ ...p, estimated_years: Number(e.target.value) })} /></Field></div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Experience</h3>
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setP({ ...p, experience: [...p.experience, { title: '', company: '', location: '', start: '', end: '', bullets: [] }] })}>Add role</Button>
          </div>
          <div className="space-y-4">
            {p.experience.map((e, i) => (
              <div key={i} className="rounded-xl border border-ink-200 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="input" placeholder="Title" value={e.title} onChange={(ev) => setExp(i, { title: ev.target.value })} />
                  <input className="input" placeholder="Company" value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} />
                  <input className="input" placeholder="Start (e.g. Jan 2022)" value={e.start} onChange={(ev) => setExp(i, { start: ev.target.value })} />
                  <input className="input" placeholder="End (or Present)" value={e.end} onChange={(ev) => setExp(i, { end: ev.target.value })} />
                </div>
                <textarea className="input mt-3 min-h-[90px]" placeholder="One achievement per line" value={e.bullets.join('\n')}
                  onChange={(ev) => setExp(i, { bullets: ev.target.value.split('\n') })} />
                <button onClick={() => setP({ ...p, experience: p.experience.filter((_, j) => j !== i) })} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            ))}
            {p.experience.length === 0 && <p className="text-sm text-ink-500">No roles extracted. Add them so matching can use your experience.</p>}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Education</h3>
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setP({ ...p, education: [...p.education, { degree: '', school: '', start: '', end: '', details: '' }] })}>Add</Button>
          </div>
          <div className="space-y-3">
            {p.education.map((e, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-ink-200 p-4 sm:grid-cols-2">
                <input className="input" placeholder="Degree" value={e.degree} onChange={(ev) => setEdu(i, { degree: ev.target.value })} />
                <input className="input" placeholder="School" value={e.school} onChange={(ev) => setEdu(i, { school: ev.target.value })} />
                <input className="input" placeholder="Years" value={e.end} onChange={(ev) => setEdu(i, { end: ev.target.value })} />
                <button onClick={() => setP({ ...p, education: p.education.filter((_, j) => j !== i) })} className="inline-flex items-center gap-1 justify-self-start text-xs font-semibold text-rose-600 hover:text-rose-700">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <Field label="Skills"><TagInput value={p.skills} onChange={(skills) => setP({ ...p, skills })} placeholder="Add a skill and press Enter" /></Field>
          <Field label="Certifications"><TagInput value={p.certifications} onChange={(certifications) => setP({ ...p, certifications })} placeholder="Add a certification" /></Field>
        </section>
      </div>
    </Drawer>
  );
}
