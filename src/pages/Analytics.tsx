import { useMemo } from 'react';
import { BarChart3, CalendarCheck2, MessageSquareReply, Send, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { METHOD_LABEL, STATE_META } from '@/lib/format';
import type { Application, ApplicationState } from '@/lib/types';
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard } from '@/components/ui';

type Row = Pick<Application, 'id' | 'state' | 'match_score' | 'submission_method' | 'submitted_at' | 'employer_response' | 'created_at'> & { job: { department: string; provider: string; work_arrangement: string } | null };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const responded = (r: Row) => !['none', 'withdrawn'].includes(r.employer_response);

function Bars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-ink-700">{r.label}</span><span className="text-ink-500">{r.value}{r.sub ? ` · ${r.sub}` : ''}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-ink-500">No data yet.</p>}
    </div>
  );
}

export default function Analytics() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [apps, interviews] = await Promise.all([
      must(supabase.from('applications').select('id, state, match_score, submission_method, submitted_at, employer_response, created_at, job:jobs(department, provider, work_arrangement)').limit(5000)),
      must(supabase.from('interviews').select('id, outcome')),
    ]);
    return { apps: apps as unknown as Row[], interviews: interviews as { id: string; outcome: string }[] };
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const apps = data.apps;
    const sent = apps.filter((a) => a.state === 'SUBMITTED' || a.state === 'CONFIRMED');
    const resp = sent.filter(responded);
    const byState = Object.entries(apps.reduce<Record<string, number>>((m, a) => ({ ...m, [a.state]: (m[a.state] ?? 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1]).map(([s, v]) => ({ label: STATE_META[s as ApplicationState]?.label ?? s, value: v }));
    const group = (key: (r: Row) => string) => {
      const m = new Map<string, { sent: number; resp: number }>();
      sent.forEach((r) => { const k = key(r) || 'Unspecified'; const g = m.get(k) ?? { sent: 0, resp: 0 }; g.sent++; if (responded(r)) g.resp++; m.set(k, g); });
      return [...m.entries()].sort((a, b) => b[1].sent - a[1].sent).slice(0, 8).map(([label, g]) => ({ label, value: g.sent, sub: `${pct(g.resp, g.sent)}% response` }));
    };
    const weeks: { label: string; value: number }[] = [];
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
    for (let w = 7; w >= 0; w--) {
      const from = new Date(start); from.setDate(from.getDate() - w * 7);
      const to = new Date(from); to.setDate(to.getDate() + 7);
      weeks.push({ label: from.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: sent.filter((a) => a.submitted_at && new Date(a.submitted_at) >= from && new Date(a.submitted_at) < to).length });
    }
    const avg = (rs: Row[]) => (rs.length ? Math.round(rs.reduce((s, r) => s + r.match_score, 0) / rs.length) : 0);
    return {
      total: apps.length, sent: sent.length, confirmed: apps.filter((a) => a.state === 'CONFIRMED').length, resp: resp.length,
      interviews: data.interviews.length, offers: sent.filter((a) => a.employer_response === 'offer').length,
      byState, byDept: group((r) => r.job?.department ?? ''), byMethod: group((r) => METHOD_LABEL[r.submission_method ?? ''] ?? 'Unknown'),
      byArrangement: group((r) => r.job?.work_arrangement ?? ''), weeks, avgSent: avg(sent), avgResp: avg(resp),
    };
  }, [data]);

  const weekMax = Math.max(1, ...(stats?.weeks.map((w) => w.value) ?? [0]));

  return (
    <>
      <PageHeader title="Analytics" subtitle="Every number here is calculated from your own application records." />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading ? <Spinner /> : !stats || stats.total === 0 ? (
        <Card><EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No data yet" body="Analytics fill in as you queue and send applications." /></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Applications sent" value={stats.sent} hint={`${stats.confirmed} with verified receipt`} icon={<Send className="h-4 w-4" />} />
            <StatCard label="Response rate" value={`${pct(stats.resp, stats.sent)}%`} hint={`${stats.resp} employer responses`} icon={<MessageSquareReply className="h-4 w-4" />} tone="sky" />
            <StatCard label="Interviews" value={stats.interviews} hint={`${stats.offers} offer${stats.offers === 1 ? '' : 's'}`} icon={<CalendarCheck2 className="h-4 w-4" />} tone="success" />
            <StatCard label="Avg match score" value={stats.avgSent} hint={stats.resp ? `${stats.avgResp} for roles that responded` : 'of applications sent'} icon={<Target className="h-4 w-4" />} tone="amber" />
          </div>

          <Card className="p-6">
            <h2 className="mb-5 text-sm font-bold text-ink-950">Funnel</h2>
            <div className="grid gap-3 sm:grid-cols-5">
              {[['Created', stats.total], ['Sent', stats.sent], ['Responses', stats.resp], ['Interviews', stats.interviews], ['Offers', stats.offers]].map(([l, v], i, arr) => (
                <div key={l as string} className="rounded-xl bg-ink-50 p-4">
                  <p className="text-xs font-semibold text-ink-500">{l}</p>
                  <p className="font-display text-3xl text-ink-950">{v}</p>
                  {i > 0 && <p className="text-[11px] text-ink-400">{pct(v as number, arr[i - 1][1] as number)}% of previous</p>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-5 text-sm font-bold text-ink-950">Applications sent per week</h2>
            <div className="flex h-40 items-end gap-2">
              {stats.weeks.map((w) => (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold text-ink-600">{w.value || ''}</span>
                  <div className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 transition-all duration-700" style={{ height: `${Math.max(3, (w.value / weekMax) * 110)}px`, opacity: w.value ? 1 : 0.25 }} />
                  <span className="text-[10px] text-ink-400">{w.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6"><h2 className="mb-5 text-sm font-bold text-ink-950">By status</h2><Bars rows={stats.byState} /></Card>
            <Card className="p-6"><h2 className="mb-5 text-sm font-bold text-ink-950">By department (sent)</h2><Bars rows={stats.byDept} /></Card>
            <Card className="p-6"><h2 className="mb-5 text-sm font-bold text-ink-950">By how it was sent</h2><Bars rows={stats.byMethod} /></Card>
            <Card className="p-6"><h2 className="mb-5 text-sm font-bold text-ink-950">By work arrangement (sent)</h2><Bars rows={stats.byArrangement} /></Card>
          </div>
        </div>
      )}
    </>
  );
}
