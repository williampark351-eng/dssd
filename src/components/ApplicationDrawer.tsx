import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, FileCheck2, Hand, RotateCcw, Send, ShieldCheck, XCircle } from 'lucide-react';
import { supabase, callFunction, friendlyError } from '@/lib/supabase';
import { METHOD_LABEL, RESPONSE_LABEL, STATE_META, formatDate, safeUrl } from '@/lib/format';
import type { AppEvent, Application } from '@/lib/types';
import { Badge, Button, Drawer, Field, Modal, ScoreRing, useToast } from '@/components/ui';
import PacketEditor, { draftFrom, saveToLibrary, type PacketDraft } from '@/components/PacketEditor';

type Tab = 'packet' | 'timeline' | 'evidence';

export default function ApplicationDrawer({ app, onClose, onChanged }: { app: Application | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('packet');
  const [draft, setDraft] = useState<PacketDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [attestOpen, setAttestOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);

  const version = app ? `${app.id}:${app.updated_at}` : '';
  useEffect(() => {
    if (!app) return;
    setDraft(draftFrom(app));
    setDirty(false);
    supabase.from('application_events').select('*').eq('application_id', app.id).order('created_at', { ascending: false })
      .then(({ data }) => setEvents((data as AppEvent[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useEffect(() => {
    if (app) setTab(app.state === 'SUBMITTED' || app.state === 'CONFIRMED' ? 'timeline' : 'packet');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);

  if (!app || !draft) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;

  const editable = app.state === 'READY_FOR_REVIEW' || app.state === 'NEEDS_USER_ACTION';
  const meta = STATE_META[app.state];
  const applyUrl = safeUrl(app.job?.apply_url) ?? safeUrl(app.job?.url);
  const canAttest = ['READY_FOR_REVIEW', 'NEEDS_USER_ACTION', 'UNKNOWN_SUBMISSION_RESULT', 'BLOCKED', 'FAILED'].includes(app.state);
  const canCancel = !['SUBMITTING', 'SUBMITTED', 'CONFIRMED', 'CANCELLED'].includes(app.state);
  const canRequeue = ['FAILED', 'BLOCKED', 'CANCELLED', 'NEEDS_USER_ACTION'].includes(app.state) && !app.submitted_at;

  const savePacket = async (quiet = false) => {
    const { data, error } = await supabase.rpc('update_application_packet', {
      p_id: app.id, p_cover_letter: draft.cover_letter, p_answers: draft.answers, p_resume_id: draft.resume_id,
    });
    if (error) { toast('error', friendlyError(error, 'Could not save your changes.')); return null; }
    if (draft.remember.size) await saveToLibrary(draft.answers.filter((_, i) => draft.remember.has(i)));
    setDirty(false);
    if (!quiet) toast('success', data === 'READY_FOR_REVIEW' && app.state === 'NEEDS_USER_ACTION' ? 'All required answers are in. Ready for your approval.' : 'Changes saved.');
    return data as string;
  };

  const act = async (action: string, payload: Record<string, unknown> = {}, success?: string) => {
    setBusy(action);
    try {
      if (dirty && editable) { const s = await savePacket(true); if (!s) { setBusy(null); return; } }
      const { error } = await supabase.rpc('application_action', { p_id: app.id, p_action: action, p_payload: payload });
      if (error) throw error;
      if (success) toast('success', success);
      if (action === 'approve' || action === 'requeue') {
        callFunction('application-worker', {}).then(onChanged).catch((e) => console.error(e));
      }
      setAttestOpen(false); setReceiptOpen(false); setResponseOpen(false);
      onChanged();
    } catch (err) {
      toast('error', friendlyError(err, 'That action could not be completed.'));
    }
    setBusy(null);
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canCancel && <Button variant="ghost" onClick={() => act('cancel', {}, 'Application cancelled.')} loading={busy === 'cancel'} icon={<XCircle className="h-4 w-4" />}>Cancel</Button>}
      {canRequeue && <Button variant="secondary" onClick={() => act('requeue', {}, 'Back in the queue.')} loading={busy === 'requeue'} icon={<RotateCcw className="h-4 w-4" />}>Re-queue</Button>}
      {editable && dirty && <Button variant="secondary" onClick={async () => { setBusy('save'); const s = await savePacket(); setBusy(null); if (s) onChanged(); }} loading={busy === 'save'}>Save changes</Button>}
      {canAttest && <Button variant="secondary" onClick={() => setAttestOpen(true)} icon={<Hand className="h-4 w-4" />}>{app.state === 'UNKNOWN_SUBMISSION_RESULT' ? 'It went through' : 'I submitted it myself'}</Button>}
      {app.state === 'READY_FOR_REVIEW' && app.mode !== 'manual' && (
        <Button onClick={() => act('approve', {}, 'Approved. Submitting now.')} loading={busy === 'approve'} icon={<Send className="h-4 w-4" />}>Approve and submit</Button>
      )}
      {app.state === 'SUBMITTED' && <Button variant="secondary" onClick={() => setReceiptOpen(true)} icon={<FileCheck2 className="h-4 w-4" />}>Add employer receipt</Button>}
      {(app.state === 'SUBMITTED' || app.state === 'CONFIRMED') && <Button onClick={() => setResponseOpen(true)}>Record response</Button>}
    </div>
  );

  return (
    <>
      <Drawer open onClose={onClose} title={app.job?.title ?? 'Application'} subtitle={app.job?.company} footer={footer}>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <ScoreRing score={app.match_score} size={44} />
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Badge tone="neutral">{app.mode} mode</Badge>
          {app.submission_method && <Badge tone={app.submission_method === 'manual_user_reported' ? 'amber' : 'brand'}>{METHOD_LABEL[app.submission_method]}</Badge>}
          {app.employer_response !== 'none' && <Badge tone="sky">{RESPONSE_LABEL[app.employer_response]}</Badge>}
          {applyUrl && (
            <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
              Employer application page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {(app.required_action || app.last_error) && (
          <div className={`mb-6 rounded-xl border p-4 text-sm ${app.state === 'FAILED' || app.state === 'UNKNOWN_SUBMISSION_RESULT' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <p className="font-semibold">{app.required_action || app.last_error}</p>
            {app.required_action && app.last_error && app.last_error !== app.required_action && <p className="mt-1 text-xs opacity-80">{app.last_error}</p>}
          </div>
        )}

        <div className="mb-6 flex gap-1 border-b border-ink-100">
          {(['packet', 'timeline', 'evidence'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold capitalize transition ${tab === t ? 'border-brand-600 text-ink-950' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>
              {t === 'packet' ? 'Packet' : t === 'timeline' ? `Timeline (${events.length})` : 'Proof'}
            </button>
          ))}
        </div>

        {tab === 'packet' && <PacketEditor app={app} draft={draft} editable={editable} onChange={(d) => { setDraft(d); setDirty(true); }} />}

        {tab === 'timeline' && (
          <ol className="relative space-y-5 border-l border-ink-200 pl-6">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-white ring-1 ${e.actor === 'user' ? 'bg-sky-500 ring-sky-200' : 'bg-brand-500 ring-brand-200'}`} />
                <p className="text-sm font-semibold text-ink-900">{e.message}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {e.from_state && e.to_state && e.from_state !== e.to_state ? `${STATE_META[e.from_state as keyof typeof STATE_META]?.label ?? e.from_state} → ${STATE_META[e.to_state as keyof typeof STATE_META]?.label ?? e.to_state} · ` : ''}
                  {e.actor === 'user' ? 'You' : e.actor === 'worker' ? 'Automation' : e.actor} · {formatDate(e.created_at, true)}
                </p>
              </li>
            ))}
            {events.length === 0 && <p className="text-sm text-ink-500">No events yet.</p>}
          </ol>
        )}

        {tab === 'evidence' && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-ink-50 p-4">
              <div><dt className="label">Submitted</dt><dd className="text-ink-900">{formatDate(app.submitted_at, true)}</dd></div>
              <div><dt className="label">Confirmed</dt><dd className="text-ink-900">{formatDate(app.confirmed_at, true)}</dd></div>
              <div><dt className="label">Method</dt><dd className="text-ink-900">{app.submission_method ? METHOD_LABEL[app.submission_method] : '—'}</dd></div>
              <div><dt className="label">Receipt / reference</dt><dd className="break-all font-mono text-xs text-ink-900">{app.receipt_id || '—'}</dd></div>
              <div><dt className="label">Attempts</dt><dd className="text-ink-900">{app.attempts}</dd></div>
              <div><dt className="label">Approved by you</dt><dd className="text-ink-900">{formatDate(app.user_approved_at, true)}</dd></div>
            </dl>
            {app.state === 'CONFIRMED' ? (
              <p className="flex items-center gap-2 font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" />Backed by a verified receipt.</p>
            ) : app.state === 'SUBMITTED' && app.submission_method === 'manual_user_reported' ? (
              <p className="flex items-center gap-2 text-amber-800"><Hand className="h-4 w-4" />You recorded this submission. Add the employer's confirmation to mark it confirmed.</p>
            ) : null}
            {app.confirmation_evidence && Object.keys(app.confirmation_evidence).length > 0 && (
              <div>
                <p className="label">Evidence record</p>
                <pre className="scrollbar-thin max-h-72 overflow-auto rounded-xl bg-ink-950 p-4 text-xs leading-relaxed text-brand-100">{JSON.stringify(app.confirmation_evidence, null, 2)}</pre>
              </div>
            )}
            {app.employer_response_note && <div><p className="label">Response note</p><p className="text-ink-700">{app.employer_response_note}</p></div>}
          </div>
        )}
      </Drawer>

      <AttestModal open={attestOpen} onClose={() => setAttestOpen(false)} busy={busy === 'mark_manual_submitted'} unknown={app.state === 'UNKNOWN_SUBMISSION_RESULT'}
        onSubmit={(note, reference) => act('mark_manual_submitted', { attested: true, note, reference }, 'Recorded as submitted by you.')} />
      <ReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)} busy={busy === 'add_receipt'}
        onSubmit={(note, reference) => act('add_receipt', { note, reference }, 'Receipt saved. Application confirmed.')} />
      <ResponseModal open={responseOpen} onClose={() => setResponseOpen(false)} busy={busy === 'record_response'} current={app.employer_response}
        onSubmit={(response, note) => act('record_response', { response, note }, 'Response recorded.')} />
    </>
  );
}

function AttestModal({ open, onClose, onSubmit, busy, unknown }: { open: boolean; onClose: () => void; onSubmit: (note: string, ref: string) => void; busy: boolean; unknown: boolean }) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  useEffect(() => { if (open) { setChecked(false); setNote(''); setRef(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={unknown ? 'Confirm it went through' : 'Record your submission'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSubmit(note, ref)} disabled={!checked} loading={busy}>Record as submitted</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-600">This will be labeled “Submitted by you” everywhere, so it is never confused with a verified automated submission.</p>
        <Field label="Confirmation number or reference (optional)"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={500} /></Field>
        <Field label="Note (optional)"><textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Applied on the company site, received an email confirmation" /></Field>
        <label className="flex cursor-pointer gap-3 rounded-xl border border-ink-200 p-3 text-sm text-ink-800">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I confirm I completed this application on the employer's site myself.
        </label>
      </div>
    </Modal>
  );
}

function ReceiptModal({ open, onClose, onSubmit, busy }: { open: boolean; onClose: () => void; onSubmit: (note: string, ref: string) => void; busy: boolean }) {
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  useEffect(() => { if (open) { setNote(''); setRef(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add the employer's confirmation"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSubmit(note, ref)} disabled={note.trim().length < 10} loading={busy} icon={<CheckCircle2 className="h-4 w-4" />}>Mark confirmed</Button></>}>
      <div className="space-y-4">
        <Field label="Confirmation text" hint="Paste the confirmation email or on-screen message (at least 10 characters).">
          <textarea className="input min-h-[120px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Reference number (optional)"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={500} /></Field>
      </div>
    </Modal>
  );
}

function ResponseModal({ open, onClose, onSubmit, busy, current }: { open: boolean; onClose: () => void; onSubmit: (r: string, note: string) => void; busy: boolean; current: string }) {
  const [response, setResponse] = useState(current);
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setResponse(current); setNote(''); } }, [open, current]);
  return (
    <Modal open={open} onClose={onClose} title="Record the employer's response"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSubmit(response, note)} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(RESPONSE_LABEL).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setResponse(k)}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${response === k ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-ink-200 text-ink-700 hover:border-ink-300'}`}>{v}</button>
          ))}
        </div>
        <Field label="Note (optional)"><textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></Field>
        {response === 'interview' && <p className="text-xs text-ink-500">Tip: add the interview under Interviews to track scheduling and outcomes.</p>}
      </div>
    </Modal>
  );
}
