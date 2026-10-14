import { useMemo, useState } from 'react';
import { Download, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import type { Cohort, OrgRole } from '@/lib/types';
import { Badge, Button, Card, ErrorBanner, Field, Modal, Spinner, useToast } from '@/components/ui';

type RosterRow = { user_id: string; full_name: string; email: string; role: OrgRole; cohort_id: string | null; joined_at: string; advisor_access: boolean };
const ROLES: [OrgRole, string][] = [['student', 'Student'], ['advisor', 'Advisor'], ['org_admin', 'Administrator']];

export function useCohorts(orgId: string) {
  return useAsync(async () => (await must(supabase.from('cohorts').select('*').eq('org_id', orgId).order('name'))) as Cohort[], [orgId]);
}

export default function OrgRoster({ orgId, orgName, isAdmin }: { orgId: string; orgName: string; isAdmin: boolean }) {
  const toast = useToast();
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const [cohortFilter, setCohortFilter] = useState('');
  const [cohortOpen, setCohortOpen] = useState(false);
  const [cohortName, setCohortName] = useState('');
  const [cohortTerm, setCohortTerm] = useState('');
  const roster = useAsync(async () => (await must(supabase.rpc('org_roster', { p_org: orgId }))) as RosterRow[], [orgId]);
  const cohorts = useCohorts(orgId);
  const cohortName_ = useMemo(() => new Map((cohorts.data ?? []).map((c) => [c.id, c.name])), [cohorts.data]);

  const list = (roster.data ?? []).filter((r) => {
    const n = q.trim().toLowerCase();
    if (cohortFilter && (cohortFilter === 'none' ? r.cohort_id : r.cohort_id !== cohortFilter)) return false;
    return !n || `${r.full_name} ${r.email}`.toLowerCase().includes(n);
  });

  const updateMember = async (userId: string, patch: { role?: OrgRole; cohort_id?: string | null }) => {
    const { error } = await supabase.from('org_members').update(patch).eq('org_id', orgId).eq('user_id', userId);
    if (error) { toast('error', friendlyError(error, 'Could not update this member.')); return; }
    audit('org.member_updated', 'organizations', { org_id: orgId, member: userId, ...patch });
    roster.reload();
  };

  const addCohort = async () => {
    if (!cohortName.trim()) return;
    const { error } = await supabase.from('cohorts').insert({ org_id: orgId, name: cohortName.trim().slice(0, 200), term: cohortTerm.trim().slice(0, 100) });
    if (error) { toast('error', friendlyError(error, 'Could not create the cohort.')); return; }
    setCohortOpen(false); setCohortName(''); setCohortTerm('');
    cohorts.reload();
  };

  const removeCohort = async (c: Cohort) => {
    const { error } = await supabase.from('cohorts').delete().eq('id', c.id);
    if (error) { toast('error', friendlyError(error, 'Could not delete the cohort.')); return; }
    cohorts.reload(); roster.reload();
  };

  const exportRoster = () => downloadCsv(`${orgName}-roster.csv`, ['Name', 'Email', 'Role', 'Cohort', 'Joined', 'Shares progress'],
    list.map((r) => [r.full_name, r.email, r.role, r.cohort_id ? cohortName_.get(r.cohort_id) ?? '' : '', r.joined_at.slice(0, 10), r.advisor_access ? 'yes' : 'no']));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input sm:w-44" value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}>
            <option value="">All cohorts</option><option value="none">Unassigned</option>
            {cohorts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={exportRoster}>CSV</Button>
        </div>
        {roster.error && <div className="px-5 pb-4"><ErrorBanner message={roster.error} onRetry={roster.reload} /></div>}
        {roster.loading ? <Spinner /> : (
          <div className="divide-y divide-ink-100 border-t border-ink-100">
            {list.map((r) => {
              const self = r.user_id === session?.user.id;
              return (
                <div key={r.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-800">{(r.full_name || r.email).slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{r.full_name || r.email}{self && <span className="ml-1 text-xs font-normal text-ink-400">(you)</span>}</p>
                    <p className="truncate text-xs text-ink-500">{r.email} · joined {formatDate(r.joined_at)}</p>
                  </div>
                  {r.role === 'student' && r.advisor_access && <Badge tone="brand"><Eye className="h-3 w-3" />Shares progress</Badge>}
                  {isAdmin && !self ? (
                    <>
                      <select className="input h-8 w-36 py-0 text-xs" value={r.cohort_id ?? ''} onChange={(e) => updateMember(r.user_id, { cohort_id: e.target.value || null })}>
                        <option value="">No cohort</option>{cohorts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select className="input h-8 w-32 py-0 text-xs" value={r.role} onChange={(e) => updateMember(r.user_id, { role: e.target.value as OrgRole })}>
                        {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </>
                  ) : (
                    <Badge tone="neutral">{ROLES.find(([v]) => v === r.role)?.[1]}{r.cohort_id ? ` · ${cohortName_.get(r.cohort_id) ?? ''}` : ''}</Badge>
                  )}
                </div>
              );
            })}
            {list.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-500">No members match.</p>}
          </div>
        )}
      </Card>

      <Card className="h-fit p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-950">Cohorts</h2>
          {isAdmin && <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCohortOpen(true)}>New</Button>}
        </div>
        <div className="space-y-1">
          {cohorts.data?.map((c) => (
            <div key={c.id} className="group flex items-center justify-between rounded-lg px-2 py-2 hover:bg-ink-50">
              <div><p className="text-sm font-semibold text-ink-800">{c.name}</p>{c.term && <p className="text-xs text-ink-500">{c.term}</p>}</div>
              <span className="text-xs text-ink-400">{(roster.data ?? []).filter((r) => r.cohort_id === c.id).length}</span>
              {isAdmin && <button aria-label="Delete cohort" onClick={() => removeCohort(c)} className="rounded p-1 text-rose-500 opacity-0 transition hover:bg-rose-50 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
          {!cohorts.data?.length && <p className="text-sm text-ink-500">Group students by class, program, or term.</p>}
        </div>
      </Card>

      <Modal open={cohortOpen} onClose={() => setCohortOpen(false)} title="New cohort"
        footer={<><Button variant="secondary" onClick={() => setCohortOpen(false)}>Cancel</Button><Button onClick={addCohort} disabled={!cohortName.trim()}>Create</Button></>}>
        <div className="space-y-4">
          <Field label="Name"><input className="input" value={cohortName} onChange={(e) => setCohortName(e.target.value)} placeholder="e.g. MS Business Analytics" /></Field>
          <Field label="Term (optional)"><input className="input" value={cohortTerm} onChange={(e) => setCohortTerm(e.target.value)} placeholder="e.g. Spring 2027" /></Field>
        </div>
      </Modal>
    </div>
  );
}
