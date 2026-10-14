import { useState } from 'react';
import { Check, Copy, MailPlus, Trash2 } from 'lucide-react';
import { supabase, friendlyError } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import type { Invitation, OrgRole } from '@/lib/types';
import { Badge, Button, Card, ErrorBanner, Field, Spinner, useToast } from '@/components/ui';
import { useCohorts } from '@/components/org/OrgRoster';

const inviteLink = (token: string) => `${window.location.origin}${window.location.pathname}#/settings/invite-${token}`;

export function parseEmails(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
}

export default function OrgInvites({ orgId, orgName, seatLimit, memberCount }: { orgId: string; orgName: string; seatLimit: number; memberCount: number }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [role, setRole] = useState<OrgRole>('student');
  const [cohort, setCohort] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const cohorts = useCohorts(orgId);
  const invites = useAsync(async () => (await must(supabase.from('invitations').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(1000))) as Invitation[], [orgId]);

  const emails = parseEmails(text);
  const pending = (invites.data ?? []).filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());
  const seatsLeft = Math.max(0, seatLimit - memberCount - pending.length);

  const send = async () => {
    if (!emails.length) return;
    setSending(true);
    const { data, error } = await supabase.rpc('create_invitations', { p_org: orgId, p_cohort: cohort || null, p_emails: emails, p_role: role });
    setSending(false);
    if (error) { toast('error', friendlyError(error, 'Could not create invitations.')); return; }
    const n = Number(data) || 0;
    toast(n ? 'success' : 'info', n ? `${n} invitation${n === 1 ? '' : 's'} created. Share the links below.` : 'Everyone on that list is already invited or a member.');
    setText('');
    invites.reload();
  };

  const copy = async (inv: Invitation) => {
    try { await navigator.clipboard.writeText(inviteLink(inv.token)); setCopied(inv.id); setTimeout(() => setCopied(null), 1500); }
    catch { toast('error', 'Could not copy. Select the link manually.'); }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from('invitations').delete().eq('id', id);
    if (error) toast('error', friendlyError(error, 'Could not revoke this invitation.'));
    invites.reload();
  };

  const exportLinks = () => downloadCsv(`${orgName}-invite-links.csv`, ['Email', 'Role', 'Invite link', 'Expires'],
    pending.map((i) => [i.email, i.role, inviteLink(i.token), i.expires_at.slice(0, 10)]));

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-950">Invite people</h2>
          <span className="text-xs text-ink-500">{memberCount} members · {pending.length} pending · <span className="font-semibold text-ink-800">{seatsLeft} seats left</span> of {seatLimit}</span>
        </div>
        <Field label="Email addresses" hint="Paste one or many, separated by commas, spaces, or new lines. Each person must sign up with the same email.">
          <textarea className="input min-h-[110px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'ana@school.edu\nben@school.edu'} />
        </Field>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Role">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              <option value="student">Student</option><option value="advisor">Advisor</option><option value="org_admin">Administrator</option>
            </select>
          </Field>
          <Field label="Cohort">
            <select className="input" value={cohort} onChange={(e) => setCohort(e.target.value)}>
              <option value="">None</option>{cohorts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Button className="sm:ml-auto" onClick={send} loading={sending} disabled={!emails.length || emails.length > 500} icon={<MailPlus className="h-4 w-4" />}>
            Create {emails.length || ''} invite{emails.length === 1 ? '' : 's'}
          </Button>
        </div>
        {emails.length > seatsLeft && <p className="mt-3 text-xs font-semibold text-amber-700">That is more than your remaining seats. Some invitations will not be created.</p>}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div><h2 className="text-sm font-bold text-ink-950">Invitations</h2><p className="text-xs text-ink-500">Applyline does not email invites. Copy each link or export them all to send from your own system.</p></div>
          {pending.length > 0 && <Button size="sm" variant="secondary" onClick={exportLinks}>Export links</Button>}
        </div>
        {invites.error && <div className="px-6 pb-4"><ErrorBanner message={invites.error} onRetry={invites.reload} /></div>}
        {invites.loading ? <Spinner /> : (
          <div className="scrollbar-thin max-h-[480px] divide-y divide-ink-100 overflow-auto border-t border-ink-100">
            {(invites.data ?? []).map((i) => {
              const expired = !i.accepted_at && new Date(i.expires_at) <= new Date();
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink-900">{i.email}</p><p className="text-xs text-ink-500">{i.role.replace('org_', '')} · sent {formatDate(i.created_at)}</p></div>
                  {i.accepted_at ? <Badge tone="success">Joined {formatDate(i.accepted_at)}</Badge> : expired ? <Badge tone="neutral">Expired</Badge> : (
                    <>
                      <Badge tone="amber">Pending</Badge>
                      <Button size="sm" variant="ghost" icon={copied === i.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={() => copy(i)}>{copied === i.id ? 'Copied' : 'Copy link'}</Button>
                    </>
                  )}
                  {!i.accepted_at && <button aria-label="Revoke" onClick={() => revoke(i.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              );
            })}
            {!invites.data?.length && <p className="px-6 py-10 text-center text-sm text-ink-500">No invitations yet.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
