import { useState } from 'react';
import { Ban, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import type { Contact } from '@/lib/types';
import { Badge, Button, Card, Field, Modal, Toggle, useToast } from '@/components/ui';

type Draft = Omit<Contact, 'id' | 'created_at'> & { id?: string };
const BLANK: Draft = { company: '', name: '', title: '', email: '', linkedin_url: '', source: 'user_entered', opted_out: false, notes: '' };

export default function ContactsPanel({ contacts, onChanged }: { contacts: Contact[]; onChanged: () => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!edit) return;
    if (!edit.name.trim()) { toast('error', 'Add a name.'); return; }
    if (edit.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(edit.email.trim())) { toast('error', 'That email address does not look right.'); return; }
    setSaving(true);
    const { id, ...rest } = edit;
    const row = { ...rest, name: rest.name.trim().slice(0, 200), email: rest.email.trim().toLowerCase(), company: rest.company.trim(), notes: rest.notes.slice(0, 5000) };
    const { error } = id ? await supabase.from('contacts').update(row).eq('id', id) : await supabase.from('contacts').insert(row);
    setSaving(false);
    if (error) { toast('error', friendlyError(error, 'Could not save this contact.')); return; }
    if (id) {
      const prev = contacts.find((c) => c.id === id);
      if (prev && prev.opted_out !== row.opted_out) audit(row.opted_out ? 'contact.opted_out' : 'contact.opt_in_restored', 'contact', { contact_id: id });
    }
    setEdit(null);
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) toast('error', friendlyError(error, 'Could not delete this contact.'));
    onChanged();
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink-950">Contacts <span className="text-ink-400">{contacts.length}</span></h2>
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEdit({ ...BLANK })}>Add</Button>
      </div>
      <div className="space-y-2">
        {contacts.map((c) => (
          <div key={c.id} className="group flex items-start gap-3 rounded-xl p-2 transition hover:bg-ink-50">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.opted_out ? 'bg-ink-100 text-ink-400' : 'bg-sky-50 text-sky-700'}`}>
              {c.opted_out ? <Ban className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{c.name}</p>
              <p className="truncate text-xs text-ink-500">{[c.title, c.company].filter(Boolean).join(' · ') || c.email || 'No details'}</p>
              {c.opted_out && <Badge tone="neutral" className="mt-1">Opted out</Badge>}
            </div>
            <div className="flex opacity-0 transition group-hover:opacity-100">
              <button aria-label="Edit" onClick={() => setEdit({ ...c })} className="rounded-lg p-1.5 text-ink-500 hover:bg-white"><Pencil className="h-3.5 w-3.5" /></button>
              <button aria-label="Delete" onClick={() => remove(c.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-white"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {contacts.length === 0 && <p className="py-6 text-center text-sm text-ink-500">Add recruiters or hiring managers you have a legitimate reason to contact.</p>}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit contact' : 'Add contact'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Company"><input className="input" value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} /></Field>
            <Field label="Title"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="LinkedIn URL"><input className="input" value={edit.linkedin_url} onChange={(e) => setEdit({ ...edit, linkedin_url: e.target.value })} /></Field>
            <Field label="How you know them">
              <select className="input" value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })}>
                <option value="user_entered">I added them</option><option value="job_posting">Listed on the job posting</option>
                <option value="referral">Referral</option><option value="career_center">Career center</option>
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label="Notes"><textarea className="input min-h-[70px]" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field></div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 p-3 text-sm sm:col-span-2">
              <span><span className="font-semibold text-ink-900">Opted out</span><span className="block text-xs text-ink-500">They asked not to be contacted. No new messages can be drafted to them.</span></span>
              <Toggle checked={edit.opted_out} onChange={(v) => setEdit({ ...edit, opted_out: v })} />
            </label>
          </div>
        )}
      </Modal>
    </Card>
  );
}
