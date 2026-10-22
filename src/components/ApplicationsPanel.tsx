import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useNav } from '@/context/NavContext';
import { STATE_META, relativeTime } from '@/lib/format';
import type { Application, ApplicationState } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, ScoreRing, Spinner } from '@/components/ui';
import ApplicationDrawer from '@/components/ApplicationDrawer';

const GROUPS: { key: string; label: string; states: ApplicationState[] }[] = [
  { key: 'you', label: 'Needs you', states: ['READY_FOR_REVIEW', 'NEEDS_USER_ACTION', 'UNKNOWN_SUBMISSION_RESULT'] },
  { key: 'progress', label: 'In progress', states: ['QUEUED', 'PREPARING', 'SUBMITTING'] },
  { key: 'sent', label: 'Sent', states: ['SUBMITTED', 'CONFIRMED'] },
  { key: 'problems', label: 'Problems', states: ['FAILED', 'BLOCKED'] },
  { key: 'cancelled', label: 'Cancelled', states: ['CANCELLED'] },
];
const ALL_STATES = GROUPS.flatMap((g) => g.states);

export default function ApplicationsPanel({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { param, navigate } = useNav();
  const [group, setGroup] = useState('you');
  const [q, setQ] = useState('');

  const { data, loading, error, reload } = useAsync(async () =>
    (await must(supabase.from('applications').select('*, job:jobs(*)').in('state', ALL_STATES).order('updated_at', { ascending: false }))) as Application[]);

  useEffect(() => { if (refreshKey) reload(); }, [refreshKey, reload]);

  const active = data?.some((a) => ['QUEUED', 'PREPARING', 'SUBMITTING'].includes(a.state));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
  }, [active, reload]);

  const openApp = data?.find((a) => a.id === param || a.job_id === param) ?? null;
  const current = GROUPS.find((g) => g.key === group)!;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((a) => current.states.includes(a.state) && (!needle || `${a.job?.title} ${a.job?.company}`.toLowerCase().includes(needle)));
  }, [data, current, q]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap rounded-xl bg-ink-100 p-1">
          {GROUPS.map((g) => {
            const n = data?.filter((a) => g.states.includes(a.state)).length ?? 0;
            return (
              <button key={g.key} onClick={() => setGroup(g.key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${group === g.key ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
                {g.label} <span className={`ml-1 ${g.key === 'you' && n ? 'text-amber-600' : 'text-ink-400'}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search applications" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      {loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<ListChecks className="h-5 w-5" />} title={group === 'you' ? 'Nothing needs you right now' : 'Nothing here'}
          body="Add roles from Discover Jobs. Applications are prepared when the queue is processed."
          action={<Button variant="secondary" onClick={() => navigate('discover')}>Find roles</Button>} /></Card>
      ) : (
        <Card className="divide-y divide-ink-100 overflow-hidden">
          {list.map((a) => {
            const meta = STATE_META[a.state];
            const missing = (a.answers ?? []).filter((x) => x.required && !x.answer?.trim()).length;
            return (
              <button key={a.id} onClick={() => navigate('auto-apply', a.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-ink-50">
                <ScoreRing score={a.match_score} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-950">{a.job?.title}</p>
                  <p className="truncate text-xs text-ink-500">{a.job?.company} · {a.required_action || meta.description}</p>
                </div>
                <div className="hidden flex-col items-end gap-1 sm:flex">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-[11px] text-ink-400">{missing ? `${missing} answer${missing > 1 ? 's' : ''} needed · ` : ''}{relativeTime(a.updated_at)}</span>
                </div>
              </button>
            );
          })}
        </Card>
      )}

      <ApplicationDrawer app={openApp} onClose={() => navigate('auto-apply')} onChanged={() => { reload(); onChanged(); }} />
    </section>
  );
}
