import { useState } from 'react';
import { BarChart3, Building2, GraduationCap, Lock, MailPlus, ShieldCheck, Users } from 'lucide-react';
import { supabase, friendlyError } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { Button, Card, Field, PageHeader, useToast } from '@/components/ui';
import OrgAnalytics from '@/components/org/OrgAnalytics';
import OrgRoster from '@/components/org/OrgRoster';
import OrgInvites from '@/components/org/OrgInvites';

const KINDS = [['university', 'University'], ['career_center', 'Career center'], ['bootcamp', 'Bootcamp'], ['other', 'Other']];

function CreateOrg() {
  const toast = useToast();
  const { refresh } = useAuth();
  const { navigate } = useNav();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('university');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (name.trim().length < 2) { toast('error', 'Add the organization name.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('create_organization', { p_name: name.trim().slice(0, 200), p_kind: kind });
    setBusy(false);
    if (error) { toast('error', friendlyError(error, 'Could not create the organization.')); return; }
    toast('success', 'Workspace created. Invite your students next.');
    await refresh();
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <Card className="relative overflow-hidden bg-ink-950 p-8 text-white">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
        <GraduationCap className="mb-6 h-8 w-8 text-brand-300" />
        <h2 className="font-display text-4xl leading-tight">Run your career center on Applyline</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-300">Invite a whole class at once, group students into cohorts, and see placement outcomes in real time, without ever seeing a student's private data unless they choose to share it.</p>
        <ul className="mt-6 space-y-3 text-sm text-ink-200">
          {[[Users, 'Bulk invites and cohort management'], [BarChart3, 'Aggregate outcomes with CSV export'], [Lock, 'Student-controlled advisor access'], [ShieldCheck, 'Every workspace is fully isolated']].map(([Icon, t]) => {
            const I = Icon as typeof Users;
            return <li key={t as string} className="flex items-center gap-3"><I className="h-4 w-4 text-brand-300" />{t as string}</li>;
          })}
        </ul>
      </Card>
      <Card className="p-8">
        <h3 className="text-lg font-bold text-ink-950">Create a workspace</h3>
        <p className="mb-6 mt-1 text-sm text-ink-500">You become its administrator. Includes 120 seats.</p>
        <div className="space-y-4">
          <Field label="Organization name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Westfield University Career Center" /></Field>
          <Field label="Type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Button className="w-full" onClick={create} loading={busy} icon={<Building2 className="h-4 w-4" />}>Create workspace</Button>
        </div>
        <p className="mt-6 text-xs text-ink-500">Student with an invite code? <button className="font-semibold text-brand-700 hover:text-brand-800" onClick={() => navigate('settings', 'organizations')}>Enter it here</button>.</p>
      </Card>
    </div>
  );
}

export default function Organization() {
  const { memberships } = useAuth();
  const { param, navigate } = useNav();
  const staff = memberships.filter((m) => m.role !== 'student');
  const [orgId, setOrgId] = useState<string | null>(null);
  const current = staff.find((m) => m.org_id === orgId) ?? staff[0];
  const isAdmin = current?.role === 'org_admin';
  const tab = param === 'members' || (param === 'invites' && isAdmin) ? param : 'outcomes';
  const memberCount = useAsync(async () => current ? ((await must(supabase.rpc('org_roster', { p_org: current.org_id }))) as unknown[]).length : 0, [current?.org_id, tab]);

  if (!current) {
    return (
      <>
        <PageHeader title="For universities" subtitle="Career centers and programs can manage cohorts of students on Applyline." />
        <CreateOrg />
      </>
    );
  }

  const org = current.organization;
  const tabs: [string, string, typeof Users][] = [['outcomes', 'Outcomes', BarChart3], ['members', 'Members and cohorts', Users], ...(isAdmin ? [['invites', 'Invitations', MailPlus] as [string, string, typeof Users]] : [])];

  return (
    <>
      <PageHeader title={org?.name ?? 'Organization'} subtitle={isAdmin ? 'You are an administrator of this workspace.' : 'You are an advisor in this workspace.'}
        actions={staff.length > 1 && (
          <select className="input w-60" value={current.org_id} onChange={(e) => setOrgId(e.target.value)}>
            {staff.map((m) => <option key={m.org_id} value={m.org_id}>{m.organization?.name}</option>)}
          </select>
        )} />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-100">
        {tabs.map(([k, l, I]) => (
          <button key={k} onClick={() => navigate('organization', k)} className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === k ? 'border-brand-600 text-ink-950' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>
            <I className="h-4 w-4" />{l}
          </button>
        ))}
      </div>
      {tab === 'outcomes' && <OrgAnalytics orgId={current.org_id} orgName={org?.name ?? 'org'} />}
      {tab === 'members' && <OrgRoster orgId={current.org_id} orgName={org?.name ?? 'org'} isAdmin={isAdmin} />}
      {tab === 'invites' && isAdmin && <OrgInvites orgId={current.org_id} orgName={org?.name ?? 'org'} seatLimit={org?.seat_limit ?? 120} memberCount={memberCount.data ?? 0} />}
    </>
  );
}
