import { useMemo, useState } from 'react';
import { CalendarClock, Mic, Pencil, Plus, Trash2 } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { supabase, friendlyError } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { formatDate, type Tone } from '@/lib/format';
import type { Application, Interview } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Modal, PageHeader, Spinner, useToast } from '@/components/ui';

const OUTCOMES: { value: Interview['outcome']; label: string; tone: Tone }[] = [
  { value: 'requested', label: 'Requested', tone: 'amber' },
  { value: 'scheduled', label: 'Scheduled', tone: 'sky' },
  { value: 'completed', label: 'Completed', tone: 'neutral' },
  { value: 'advanced', label: 'Advanced', tone: 'success' },
  { value: 'declined', label: 'Not moving forward', tone: 'rose' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
];
const FORMATS = [['video', 'Video'], ['phone', 'Phone'], ['onsite', 'On-site'], ['take_home', 'Take-home'], ['other', 'Other']];

type Draft = { id?: string; application_id: string; stage: string; scheduled_at: string; format: string; interviewer: string; notes: string; outcome: Interview['outcome'] };

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function Interviews() {
  const toast = useToast();
  const { navigate } = useNav();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, loading, error, reload } = useAsync(async () => {
    const [interviews, apps] = await Promise.all([
      must(supabase.from('interviews').select('*').order('scheduled_at', { ascending: true, nullsFirst: false })),
      must(supabase.from('applications').select('id, state, job:jobs(title, company)').in('state', ['SUBMITTED', 'CONFIRMED'])),
    ]);
    return { interviews: interviews as Interview[], apps: apps as unknown as Pick<Application, 'id' | 'state' | 'job'>[] };
  });

  const appById = useMemo(() => new Map((data?.apps ?? []).map((a) => [a.id, a])), [data]);
  const now = Date.now();
  const upcoming = (data?.interviews ?? []).filter((i) => ['requested', 'scheduled'].includes(i.outcome) && (!i.scheduled_at || new Date(i.scheduled_at).getTime() >= now - 3600_000));
  const past = (data?.interviews ?? []).filter((i) => !upcoming.includes(i));

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    const { id, ...rest } = edit;
    const row = { ...rest, stage: rest.stage.trim().slice(0, 120) || 'Interview', interviewer: rest.interviewer.slice(0, 200), notes: rest.notes.slice(0, 5000), scheduled_at: rest.scheduled_at ? new Date(rest.scheduled_at).toISOString() : null };
    const { error: err } = id ? await supabase.from('interviews').update(row).eq('id', id) : await supabase.from('interviews').insert(row);
    setSaving(false);
    if (err) { toast('error', friendlyError(err, 'Could not save this interview.')); return; }
    toast('success', 'Interview saved.');
    setEdit(null);
    reload();
  };

  const remove = async (id: string) => {
    const { error: err } = await supabase.from('interviews').delete().eq('id', id);
    if (err) toast('error', friendlyError(err, 'Could not delete this interview.'));
    reload();
  };

  const row = (i: Interview) => {
    const a = appById.get(i.application_id); const o = OUTCOMES.find((x) => x.value === i.outcome)!;
    const d = i.scheduled_at ? new Date(i.scheduled_at) : null;
    return (
      <Card key={i.id} className="group flex items-center gap-4 p-4">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-ink-950 text-white">
          {d ? <><span className="text-[10px] font-bold uppercase tracking-wider text-brand-300">{d.toLocaleDateString(undefined, { month: 'short' })}</span><span className="text-lg font-bold leading-none">{d.getDate()}</span></> : <CalendarClock className="h-5 w-5 text-brand-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-950">{i.stage} · {a?.job?.company ?? 'Application'}</p>
          <p className="truncate text-xs text-ink-500">{a?.job?.title} · {FORMATS.find((f) => f[0] === i.format)?.[1]}{d ? ` · ${formatDate(i.scheduled_at, true)}` : ' · Time not set'}{i.interviewer ? ` · with ${i.interviewer}` : ''}</p>
        </div>
        <Badge tone={o.tone}>{o.label}</Badge>
        <div className="flex opacity-60 transition group-hover:opacity-100">
          <button aria-label="Practice for this interview" title="Practice for this interview" onClick={() => navigate('practice', `app-${i.application_id}`)} className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"><Mic className="h-4 w-4" /></button>
          <button aria-label="Edit" onClick={() => setEdit({ id: i.id, application_id: i.application_id, stage: i.stage, scheduled_at: toLocalInput(i.scheduled_at), format: i.format, interviewer: i.interviewer, notes: i.notes, outcome: i.outcome })} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"><Pencil className="h-4 w-4" /></button>
          <button aria-label="Delete" onClick={() => remove(i.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Interviews" subtitle="Track every conversation that comes out of your applications."
        actions={<Button icon={<Plus className="h-4 w-4" />} disabled={!data?.apps.length}
          onClick={() => data?.apps[0] && setEdit({ application_id: data.apps[0].id, stage: 'Phone screen', scheduled_at: '', format: 'video', interviewer: '', notes: '', outcome: 'scheduled' })}>Add interview</Button>} />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading ? <Spinner /> : !data?.interviews.length ? (
        <Card><EmptyState icon={<CalendarClock className="h-5 w-5" />} title="No interviews yet"
          body={data?.apps.length ? 'When an employer reaches out, add the interview here to keep track of it.' : 'Interviews can be added once you have a submitted application.'} /></Card>
      ) : (
        <div className="space-y-8">
          <section><h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">Upcoming ({upcoming.length})</h2><div className="space-y-3">{upcoming.map(row)}{!upcoming.length && <p className="text-sm text-ink-500">Nothing scheduled.</p>}</div></section>
          {past.length > 0 && <section><h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">Past ({past.length})</h2><div className="space-y-3">{past.map(row)}</div></section>}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit interview' : 'Add interview'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
        {edit && data && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Application">
              <select className="input" value={edit.application_id} onChange={(e) => setEdit({ ...edit, application_id: e.target.value })}>
                {data.apps.map((a) => <option key={a.id} value={a.id}>{a.job?.title} · {a.job?.company}</option>)}
              </select>
            </Field></div>
            <Field label="Stage"><input className="input" value={edit.stage} onChange={(e) => setEdit({ ...edit, stage: e.target.value })} /></Field>
            <Field label="When"><input type="datetime-local" className="input" value={edit.scheduled_at} onChange={(e) => setEdit({ ...edit, scheduled_at: e.target.value })} /></Field>
            <Field label="Format"><select className="input" value={edit.format} onChange={(e) => setEdit({ ...edit, format: e.target.value })}>{FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Status"><select className="input" value={edit.outcome} onChange={(e) => setEdit({ ...edit, outcome: e.target.value as Interview['outcome'] })}>{OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Interviewer"><input className="input" value={edit.interviewer} onChange={(e) => setEdit({ ...edit, interviewer: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field label="Notes and prep"><textarea className="input min-h-[100px]" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field></div>
          </div>
        )}
      </Modal>
    </>
  );
}
