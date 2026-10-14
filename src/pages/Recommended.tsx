import { useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, EyeOff, ListPlus, RefreshCw, Sparkles, Undo2 } from 'lucide-react';
import { supabase, callFunction, friendlyError } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { queueJobs } from '@/lib/jobs';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { relativeTime } from '@/lib/format';
import type { Match } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, ScoreRing, Spinner, useToast } from '@/components/ui';
import { JobDetailDrawer, JobMeta } from '@/components/JobDetail';
import { useOnMatchesUpdated } from '@/lib/rescore';

type Tab = 'top' | 'saved' | 'filtered' | 'dismissed';

export default function Recommended() {
  const { prefs } = useAuth();
  const { navigate } = useNav();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('top');
  const [minScore, setMinScore] = useState(0);
  const [open, setOpen] = useState<Match | null>(null);
  const [running, setRunning] = useState(false);
  const [queuing, setQueuing] = useState(false);

  const { data, loading, error, reload, setData } = useAsync(async () => {
    const [matches, apps] = await Promise.all([
      must(supabase.from('job_matches').select('*, job:jobs(*)').order('score', { ascending: false }).limit(500)),
      must(supabase.from('applications').select('job_id')),
    ]);
    return {
      matches: (matches as Match[]).filter((m) => m.job && m.job.status === 'active'),
      applied: new Set((apps as { job_id: string }[]).map((a) => a.job_id)),
    };
  });

  const list = useMemo(() => {
    if (!data) return [];
    return data.matches.filter((m) => {
      if (tab === 'dismissed') return m.dismissed;
      if (m.dismissed) return false;
      if (tab === 'filtered') return !m.eligible;
      if (!m.eligible) return false;
      if (tab === 'saved') return m.saved;
      return m.score >= minScore;
    });
  }, [data, tab, minScore]);

  const lastRun = data?.matches.reduce<string | null>((acc, m) => (!acc || m.computed_at > acc ? m.computed_at : acc), null);
  useOnMatchesUpdated(reload);

  const rerun = async () => {
    setRunning(true);
    try {
      const res = await callFunction<{ matched: number; message?: string }>('match-jobs', {});
      toast('success', res.message ?? `Scored ${res.matched} roles against your profile.`);
      await reload();
    } catch (err) {
      toast('error', friendlyError(err, 'Matching failed. Please try again.'));
    }
    setRunning(false);
  };

  const patch = async (m: Match, fields: Partial<Pick<Match, 'saved' | 'dismissed'>>) => {
    const { error } = await supabase.from('job_matches').update(fields).eq('id', m.id);
    if (error) { toast('error', friendlyError(error)); return; }
    setData((d) => d && { ...d, matches: d.matches.map((x) => (x.id === m.id ? { ...x, ...fields } : x)) });
    if (open?.id === m.id) setOpen({ ...m, ...fields });
  };

  const queue = async (ids: string[]) => {
    if (!prefs || !ids.length) return;
    setQueuing(true);
    try {
      const n = await queueJobs(ids, prefs.apply_mode);
      toast('success', `${n} added to your queue${ids.length - n ? `; ${ids.length - n} skipped as duplicates or exclusions` : ''}.`);
      setOpen(null);
      await reload();
    } catch (err) {
      toast('error', friendlyError(err, 'Could not queue those jobs.'));
    }
    setQueuing(false);
  };

  const queueable = list.filter((m) => m.eligible && !data?.applied.has(m.job_id)).slice(0, 100);
  const counts = data && {
    top: data.matches.filter((m) => m.eligible && !m.dismissed).length,
    saved: data.matches.filter((m) => m.saved && !m.dismissed && m.eligible).length,
    filtered: data.matches.filter((m) => !m.eligible && !m.dismissed).length,
    dismissed: data.matches.filter((m) => m.dismissed).length,
  };

  return (
    <>
      <PageHeader title="Recommended jobs" subtitle={`Ranked by fit using your weights. Hard requirements like sponsorship and excluded companies are applied first. Last scored ${relativeTime(lastRun)}.`}
        actions={<Button variant="secondary" onClick={rerun} loading={running} icon={<RefreshCw className="h-4 w-4" />}>Re-score now</Button>} />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-ink-100 p-1">
          {(['top', 'saved', 'filtered', 'dismissed'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${tab === t ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
              {t === 'top' ? 'Best matches' : t === 'filtered' ? 'Filtered out' : t} {counts && <span className="ml-1 text-ink-400">{counts[t]}</span>}
            </button>
          ))}
        </div>
        {tab === 'top' && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-600">
              Min score
              <input type="range" min={0} max={95} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="accent-brand-600" />
              <span className="w-6 text-ink-900">{minScore}</span>
            </label>
            <Button size="sm" onClick={() => queue(queueable.map((m) => m.job_id))} loading={queuing} disabled={!queueable.length} icon={<ListPlus className="h-3.5 w-3.5" />}>
              Queue {queueable.length}
            </Button>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading ? <Spinner label="Loading matches" /> : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Sparkles className="h-5 w-5" />} title={tab === 'top' ? 'No matches yet' : 'Nothing here'}
            body={tab === 'top' ? 'Add job sources and a resume, then re-score to see ranked recommendations.' : 'Matches you save, dismiss, or that fail a hard requirement appear in these tabs.'}
            action={tab === 'top' ? <Button onClick={() => navigate('discover')}>Add job sources</Button> : undefined} />
        </Card>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {list.map((m) => (
            <li key={m.id}>
              <Card className="group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex gap-4">
                  {m.eligible ? <ScoreRing score={m.score} size={52} /> : <div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-rose-50 text-[10px] font-bold text-rose-700">N/A</div>}
                  <button onClick={() => setOpen(m)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-bold text-ink-950 group-hover:text-brand-800">{m.job!.title}</p>
                    <p className="mb-1 text-xs font-semibold text-ink-600">{m.job!.company}</p>
                    <JobMeta job={m.job!} />
                  </button>
                </div>
                <div className="mt-4 flex-1 text-xs leading-relaxed text-ink-600">
                  {m.eligible ? (m.explanation?.reasons?.slice(0, 2).join(' · ') || 'Partial fit across several factors.') : m.ineligible_reasons.join(' · ')}
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-3">
                  {data?.applied.has(m.job_id) ? <Badge tone="brand">In your applications</Badge> : m.eligible && !m.dismissed && (
                    <Button size="sm" onClick={() => queue([m.job_id])} disabled={queuing} icon={<ListPlus className="h-3.5 w-3.5" />}>Queue</Button>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => patch(m, { saved: !m.saved })} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-700" title={m.saved ? 'Unsave' : 'Save'} aria-label={m.saved ? 'Unsave' : 'Save'}>
                    {m.saved ? <BookmarkCheck className="h-4 w-4 text-brand-600" /> : <Bookmark className="h-4 w-4" />}
                  </button>
                  <button onClick={() => patch(m, { dismissed: !m.dismissed })} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800" title={m.dismissed ? 'Restore' : 'Not interested'} aria-label={m.dismissed ? 'Restore' : 'Not interested'}>
                    {m.dismissed ? <Undo2 className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <JobDetailDrawer job={open?.job ?? null} match={open} onClose={() => setOpen(null)}
        footer={open && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => patch(open, { saved: !open.saved })}>{open.saved ? 'Unsave' : 'Save'}</Button>
            {!data?.applied.has(open.job_id) && open.eligible && <Button onClick={() => queue([open.job_id])} loading={queuing} icon={<ListPlus className="h-4 w-4" />}>Add to queue</Button>}
          </div>
        )} />
    </>
  );
}
