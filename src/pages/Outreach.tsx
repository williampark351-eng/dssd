import { useMemo, useState } from 'react';
import { CheckCircle2, Mail, MessageSquareReply, Plus, Send, ShieldCheck, XCircle } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import type { Application, Contact, OutreachMessage } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Modal, PageHeader, Spinner, useToast } from '@/components/ui';
import type { Tone } from '@/lib/format';
import ContactsPanel from '@/components/ContactsPanel';

const STATUS_TONE: Record<OutreachMessage['status'], Tone> = { draft: 'neutral', approved: 'sky', sent: 'brand', replied: 'success', cancelled: 'neutral' };
type Draft = { application_id: string; contact_id: string; channel: OutreachMessage['channel']; subject: string; body: string };

export default function Outreach() {
  const toast = useToast();
  const { profile } = useAuth();
  const [compose, setCompose] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [replyFor, setReplyFor] = useState<OutreachMessage | null>(null);
  const [replyNote, setReplyNote] = useState('');

  const { data, loading, error, reload } = useAsync(async () => {
    const [contacts, messages, apps] = await Promise.all([
      must(supabase.from('contacts').select('*').order('created_at', { ascending: false })),
      must(supabase.from('outreach_messages').select('*').order('created_at', { ascending: false })),
      must(supabase.from('applications').select('*, job:jobs(*)').in('state', ['SUBMITTED', 'CONFIRMED']).order('submitted_at', { ascending: false })),
    ]);
    return { contacts: contacts as Contact[], messages: messages as OutreachMessage[], apps: apps as Application[] };
  });

  const contactById = useMemo(() => new Map((data?.contacts ?? []).map((c) => [c.id, c])), [data]);
  const appById = useMemo(() => new Map((data?.apps ?? []).map((a) => [a.id, a])), [data]);

  const template = (appId: string, contactId: string): Pick<Draft, 'subject' | 'body'> => {
    const a = appById.get(appId); const c = contactById.get(contactId);
    if (!a?.job) return { subject: '', body: '' };
    const first = c?.name.split(' ')[0] || 'there';
    return {
      subject: `${a.job.title} application – ${profile?.full_name ?? ''}`.trim(),
      body: `Hi ${first},\n\nI recently applied for the ${a.job.title} role at ${a.job.company} and wanted to briefly introduce myself.${profile?.headline ? ` I'm a ${profile.headline}.` : ''}\n\nI'd welcome the chance to learn more about the team and share how my background could help. Thank you for your time.\n\nBest,\n${profile?.full_name ?? ''}`,
    };
  };

  const openCompose = () => {
    const app = data?.apps[0]; const contact = data?.contacts.find((c) => !c.opted_out);
    if (!app || !contact) return;
    setCompose({ application_id: app.id, contact_id: contact.id, channel: 'email', ...template(app.id, contact.id) });
  };

  const saveDraft = async () => {
    if (!compose) return;
    if (!compose.body.trim()) { toast('error', 'Write a message first.'); return; }
    setSaving(true);
    const { error: err } = await supabase.from('outreach_messages').insert({ ...compose, subject: compose.subject.slice(0, 300), body: compose.body.slice(0, 10000), status: 'draft' });
    setSaving(false);
    if (err) { toast('error', err && typeof err === 'object' && 'code' in err && err.code === '23505' ? 'You already have a message to this contact for this application.' : friendlyError(err, 'Could not save the draft.')); return; }
    toast('success', 'Draft saved. Approve it when you are ready.');
    setCompose(null);
    reload();
  };

  const setStatus = async (m: OutreachMessage, status: OutreachMessage['status'], extra: Record<string, unknown> = {}) => {
    const { error: err } = await supabase.from('outreach_messages').update({ status, ...extra }).eq('id', m.id);
    if (err) { toast('error', friendlyError(err, 'Could not update this message.')); return false; }
    audit(`outreach.${status}`, 'outreach_message', { message_id: m.id });
    reload();
    return true;
  };

  const sendViaEmail = (m: OutreachMessage) => {
    const c = contactById.get(m.contact_id);
    if (!c?.email) return;
    window.open(`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`, '_blank', 'noopener');
  };

  const eligibleContacts = (data?.contacts ?? []).filter((c) => !c.opted_out);

  return (
    <>
      <PageHeader title="Outreach" subtitle="Optional, personal follow-ups tied to applications you have already sent. Every message needs your approval, and you send it from your own inbox."
        actions={<Button icon={<Plus className="h-4 w-4" />} disabled={!data?.apps.length || !eligibleContacts.length} onClick={openCompose}>New message</Button>} />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading ? <Spinner /> : data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm text-brand-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Applyline never sends messages for you. One message per contact per application, opted-out contacts are blocked, and sent messages cannot be re-drafted.</p>
            </div>
            {!data.apps.length && <p className="text-sm text-ink-500">Outreach unlocks once at least one application is submitted.</p>}
            {data.messages.length === 0 ? (
              <Card><EmptyState icon={<Mail className="h-5 w-5" />} title="No messages yet" body="Add a contact, then draft a short note about an application you have submitted." /></Card>
            ) : data.messages.map((m) => {
              const c = contactById.get(m.contact_id); const a = appById.get(m.application_id);
              return (
                <Card key={m.id} className="p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                    <span className="text-sm font-bold text-ink-950">{c?.name ?? 'Contact'}</span>
                    <span className="text-xs text-ink-500">{a?.job ? `re: ${a.job.title} at ${a.job.company}` : ''}</span>
                    <span className="ml-auto text-xs text-ink-400">{m.sent_at ? `Sent ${formatDate(m.sent_at)}` : `Created ${formatDate(m.created_at)}`}</span>
                  </div>
                  {m.subject && <p className="mb-1 text-sm font-semibold text-ink-800">{m.subject}</p>}
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-ink-600">{m.body}</p>
                  {m.reply_note && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">Reply: {m.reply_note}</p>}
                  {c?.opted_out && ['draft', 'approved'].includes(m.status) && <p className="mt-3 text-xs font-semibold text-rose-600">This contact opted out. Cancel this message.</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {m.status === 'draft' && <Button size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setStatus(m, 'approved')}>Approve</Button>}
                    {m.status === 'approved' && c?.email && <Button size="sm" variant="secondary" icon={<Mail className="h-3.5 w-3.5" />} onClick={() => sendViaEmail(m)}>Open in my email</Button>}
                    {m.status === 'approved' && <Button size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setStatus(m, 'sent')}>I sent it</Button>}
                    {m.status === 'sent' && <Button size="sm" variant="secondary" icon={<MessageSquareReply className="h-3.5 w-3.5" />} onClick={() => { setReplyFor(m); setReplyNote(''); }}>They replied</Button>}
                    {['draft', 'approved'].includes(m.status) && <Button size="sm" variant="ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setStatus(m, 'cancelled')}>Cancel</Button>}
                  </div>
                </Card>
              );
            })}
          </div>
          <ContactsPanel contacts={data.contacts} onChanged={reload} />
        </div>
      )}

      <Modal open={!!compose} onClose={() => setCompose(null)} title="Draft a message"
        footer={<><Button variant="secondary" onClick={() => setCompose(null)}>Cancel</Button><Button onClick={saveDraft} loading={saving}>Save draft</Button></>}>
        {compose && data && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Application">
                <select className="input" value={compose.application_id} onChange={(e) => setCompose({ ...compose, application_id: e.target.value, ...template(e.target.value, compose.contact_id) })}>
                  {data.apps.map((a) => <option key={a.id} value={a.id}>{a.job?.title} · {a.job?.company}</option>)}
                </select>
              </Field>
              <Field label="Contact">
                <select className="input" value={compose.contact_id} onChange={(e) => setCompose({ ...compose, contact_id: e.target.value, ...template(compose.application_id, e.target.value) })}>
                  {eligibleContacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Channel">
              <select className="input" value={compose.channel} onChange={(e) => setCompose({ ...compose, channel: e.target.value as Draft['channel'] })}>
                <option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="Subject"><input className="input" value={compose.subject} maxLength={300} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} /></Field>
            <Field label="Message"><textarea className="input min-h-[200px]" value={compose.body} maxLength={10000} onChange={(e) => setCompose({ ...compose, body: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!replyFor} onClose={() => setReplyFor(null)} title="Record a reply"
        footer={<><Button variant="secondary" onClick={() => setReplyFor(null)}>Cancel</Button><Button onClick={async () => { if (replyFor && await setStatus(replyFor, 'replied', { reply_note: replyNote.slice(0, 2000) })) setReplyFor(null); }}>Save</Button></>}>
        <Field label="What did they say? (optional)"><textarea className="input min-h-[100px]" value={replyNote} onChange={(e) => setReplyNote(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
