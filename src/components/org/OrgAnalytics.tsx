import { Download, GraduationCap, MessageSquareReply, Send, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { Button, Card, ErrorBanner, Spinner, StatCard } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';

type CohortStat = { id: string | null; name: string; term: string; students: number; applications: number; submitted: number; responses: number; interviews: number; offers: number };
type GrantedStudent = { user_id: string; name: string; email: string; applications: number; submitted: number; needs_action: number; interviews: number };
export type OrgStats = {
  students: number; active_students: number; applications: number; submitted: number; confirmed: number; responses: number;
  interviews: number; offers: number; cohorts: CohortStat[]; granted_students: GrantedStudent[];
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

export default function OrgAnalytics({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { data, loading, error, reload } = useAsync(async () => (await must(supabase.rpc('org_analytics', { p_org: orgId }))) as OrgStats, [orgId]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBanner message={error ?? 'Could not load analytics.'} onRetry={reload} />;

  const cohorts = data.cohorts.filter((c) => c.id || c.students > 0);
  const exportCohorts = () => downloadCsv(`${orgName}-cohort-outcomes.csv`,
    ['Cohort', 'Term', 'Students', 'Applications', 'Submitted', 'Responses', 'Interviews', 'Offers'],
    cohorts.map((c) => [c.name, c.term, c.students, c.applications, c.submitted, c.responses, c.interviews, c.offers]));
  const exportStudents = () => downloadCsv(`${orgName}-shared-students.csv`,
    ['Name', 'Email', 'Applications', 'Submitted', 'Needs action', 'Interviews'],
    data.granted_students.map((s) => [s.name, s.email, s.applications, s.submitted, s.needs_action, s.interviews]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={data.students} hint={`${data.active_students} actively applying`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Applications sent" value={data.submitted} hint={`${data.confirmed} with verified receipt`} icon={<Send className="h-4 w-4" />} tone="sky" />
        <StatCard label="Employer responses" value={data.responses} hint={`${pct(data.responses, data.submitted)} response rate`} icon={<MessageSquareReply className="h-4 w-4" />} tone="amber" />
        <StatCard label="Interviews / offers" value={`${data.interviews} / ${data.offers}`} hint="Reported by students" icon={<GraduationCap className="h-4 w-4" />} tone="success" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div><h2 className="text-sm font-bold text-ink-950">Outcomes by cohort</h2><p className="text-xs text-ink-500">Aggregate totals only. Individual activity is never shown here.</p></div>
          <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCohorts}>CSV</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
              <tr>{['Cohort', 'Students', 'Applications', 'Submitted', 'Response rate', 'Interviews', 'Offers'].map((h) => <th key={h} className="px-6 py-2.5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {cohorts.map((c) => (
                <tr key={c.id ?? 'none'} className="hover:bg-ink-50/50">
                  <td className="px-6 py-3 font-semibold text-ink-900">{c.name}{c.term && <span className="ml-2 text-xs font-normal text-ink-500">{c.term}</span>}</td>
                  <td className="px-6 py-3 tabular-nums">{c.students}</td><td className="px-6 py-3 tabular-nums">{c.applications}</td>
                  <td className="px-6 py-3 tabular-nums">{c.submitted}</td><td className="px-6 py-3 tabular-nums">{pct(c.responses, c.submitted)}</td>
                  <td className="px-6 py-3 tabular-nums">{c.interviews}</td><td className="px-6 py-3 tabular-nums">{c.offers}</td>
                </tr>
              ))}
              {cohorts.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-ink-500">No students yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div><h2 className="text-sm font-bold text-ink-950">Students who shared their progress</h2><p className="text-xs text-ink-500">Only students who switched on advisor access appear here. They can turn it off at any time.</p></div>
          {data.granted_students.length > 0 && <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={exportStudents}>CSV</Button>}
        </div>
        <div className="divide-y divide-ink-100">
          {data.granted_students.map((s) => (
            <div key={s.user_id} className="flex flex-wrap items-center gap-4 px-6 py-3 text-sm">
              <div className="min-w-0 flex-1"><p className="font-semibold text-ink-900">{s.name || s.email}</p><p className="text-xs text-ink-500">{s.email}</p></div>
              <span className="text-xs text-ink-600">{s.submitted}/{s.applications} sent</span>
              <span className={`text-xs ${s.needs_action ? 'font-semibold text-amber-700' : 'text-ink-500'}`}>{s.needs_action} waiting on them</span>
              <span className="text-xs text-ink-600">{s.interviews} interviews</span>
            </div>
          ))}
          {data.granted_students.length === 0 && <p className="px-6 pb-6 text-sm text-ink-500">No students have shared access yet.</p>}
        </div>
      </Card>
    </div>
  );
}
