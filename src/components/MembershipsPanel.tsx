import { useState } from 'react';
import { Building2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { Badge, Button, Card, Field, Toggle, useToast } from '@/components/ui';

type Grant = { id: string; org_id: string; granted_at: string; revoked_at: string | null };
const ROLE_LABEL = { org_admin: 'Administrator', advisor: 'Advisor', student: 'Student' } as const;

export default function MembershipsPanel({ initialToken }: { initialToken: string }) {
  const toast = useToast();
  const { memberships, refresh } = useAuth();
  const [token, setToken] = useState(initialToken);
  const [joining, setJoining] = useState(false);
  const { data: grants, reload } = useAsync(async () => (await must(supabase.from('advisor_grants').select('*'))) as Grant[]);

  const join = async () => {
    const t = token.trim();
    if (!/^[a-f0-9]{16,128}$/i.test(t)) { toast('error', 'That invite code does not look right.'); return; }
    setJoining(true);
    const { error } = await supabase.rpc('accept_invitation', { p_token: t });
    setJoining(false);
    if (error) { toast('error', friendlyError(error, 'This invite could not be accepted.')); return; }
    toast('success', 'You joined the organization.');
    setToken('');
    await refresh();
  };

  const setAccess = async (orgId: string, on: boolean) => {
    const g = grants?.find((x) => x.org_id === orgId);
    const now = new Date().toISOString();
    const { error } = g
      ? await supabase.from('advisor_grants').update(on ? { revoked_at: null, granted_at: now } : { revoked_at: now }).eq('id', g.id)
      : await supabase.from('advisor_grants').insert({ org_id: orgId });
    if (error) { toast('error', friendlyError(error, 'Could not update advisor access.')); return; }
    audit(on ? 'advisor_access.granted' : 'advisor_access.revoked', 'organization', { org_id: orgId });
    toast('success', on ? 'Your advisors can now see your applications.' : 'Advisor access removed.');
    reload();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2"><KeyRound className="h-4 w-4 text-ink-500" /><h2 className="text-sm font-bold text-ink-950">Join with an invite code</h2></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><Field label="Invite code" hint="Your career center sends this by link or email. It only works with the email address it was sent to.">
            <input className="input font-mono text-xs" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your code" />
          </Field></div>
          <Button onClick={join} loading={joining} disabled={!token.trim()}>Join</Button>
        </div>
      </Card>

      {memberships.length === 0 ? (
        <Card className="p-6 text-sm text-ink-500">You are not part of any university or career center yet.</Card>
      ) : memberships.map((m) => {
        const g = grants?.find((x) => x.org_id === m.org_id);
        const granted = !!g && !g.revoked_at;
        return (
          <Card key={m.org_id} className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 text-brand-300"><Building2 className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="font-bold text-ink-950">{m.organization?.name ?? 'Organization'}</p>
                <p className="text-xs text-ink-500">Joined {formatDate(m.joined_at)}</p>
              </div>
              <Badge tone="brand">{ROLE_LABEL[m.role]}</Badge>
            </div>
            {m.role === 'student' && (
              <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-ink-200 p-4">
                <div className="flex gap-3">
                  {granted ? <Eye className="mt-0.5 h-4 w-4 text-brand-600" /> : <EyeOff className="mt-0.5 h-4 w-4 text-ink-400" />}
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Let advisors see my applications</p>
                    <p className="text-xs text-ink-500">{granted ? `Shared since ${formatDate(g!.granted_at)}. Advisors can view, not change, your applications.` : 'Off. Your school only sees anonymous totals that include you.'}</p>
                  </div>
                </div>
                <Toggle checked={granted} onChange={(v) => setAccess(m.org_id, v)} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
