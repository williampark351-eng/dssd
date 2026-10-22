import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Compass, ExternalLink, ListPlus, Radio, Search, SlidersHorizontal } from 'lucide-react';
import { supabase, friendlyError } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { fetchJobsForSources, queueJobs } from '@/lib/jobs';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { relativeTime, safeUrl } from '@/lib/format';
import type { Job, JobSource, Match } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, ScoreRing, Spinner, useToast } from '@/components/ui';
import SourcesPanel from '@/components/SourcesPanel';
import WatchPanel from '@/components/discover/WatchPanel';
import FillButtonCard from '@/components/FillButtonCard';
import { JobDetailDrawer, JobMeta } from '@/components/JobDetail';
import { arrivals, isNewJob, notifyAboutJobs, watchRegex } from '@/lib/watch';

const CHECK_EVERY_MS = 120_000;

export default function Discover() {
  const { prefs, setPrefs } = useAuth();
  const { navigate } = useNav();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [arrangement, setArrangement] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState<'active' | 'expired' | ''>('active');
  const [sourceKey, setSourceKey] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Job | null>(null);
  const [queuing, setQueuing] = useState(false);
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [sort, setSort] = useState<'newest' | 'seen'>('newest');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [visible, setVisible] = useState(200);
  const knownIds = useRef<Set<string> | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const sources = await must(supabase.from('job_sources').select('*').order('created_at'));
    const jobs = await fetchJobsForSources(sources as JobSource[]);
    const [matches, apps] = await Promise.all([
      must(supabase.from('job_matches').select('*')),
      must(supabase.from('applications').select('job_id, state')),
    ]);
    return {
      sources: sources as JobSource[],
      jobs,
      matches: new Map((matches as Match[]).map((m) => [m.job_id, m])),
      applied: new Map((apps as { job_id: string; state: string }[]).map((a) => [a.job_id, a.state])),
    };
  });

  const departments = useMemo(() => [...new Set((data?.jobs ?? []).map((j) => j.department).filter(Boolean))].sort(), [data]);
  const watchRe = useMemo(() => watchRegex(prefs?.watch_words ?? []), [prefs?.watch_words]);
  const readAt = prefs?.feed_read_at ?? null;

  const setReadAt = async (when: string) => {
    if (!prefs) return;
    setPrefs({ ...prefs, feed_read_at: when });
    const { error: e } = await supabase.from('candidate_preferences').update({ feed_read_at: when }).eq('user_id', prefs.user_id);
    if (e) toast('error', friendlyError(e, 'Could not mark roles as read.'));
  };

  useEffect(() => {
    if (!data) return;
    setCheckedAt(Date.now());
    const fresh = arrivals(knownIds.current, data.jobs.filter((j) => j.status === 'active'));
    knownIds.current = new Set(data.jobs.map((j) => j.id));
    if (prefs?.watch_notify && watchRe) notifyAboutJobs(fresh.filter((j) => watchRe.test(j.title)));
    if (prefs && !prefs.feed_read_at) setReadAt(new Date().toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden || prefs?.watch_notify) reload();
    }, CHECK_EVERY_MS);
    return () => window.clearInterval(id);
  }, [reload, prefs?.watch_notify]);

  const watchCount = useMemo(() => (watchRe ? (data?.jobs ?? []).filter((j) => j.status === 'active' && watchRe.test(j.title)).length : 0), [data, watchRe]);
  const newCount = useMemo(() => (data?.jobs ?? []).filter((j) => j.status === 'active' && isNewJob(j, readAt)).length, [data, readAt]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const rows = data.jobs.filter((j) =>
      (!needle || `${j.title} ${j.company} ${j.location} ${j.department}`.toLowerCase().includes(needle)) &&
      (!arrangement || j.work_arrangement === arrangement) &&
      (!department || j.department === department) &&
      (!status || j.status === status) &&
      (!onlyMatches || !watchRe || watchRe.test(j.title)) &&
      (!sourceKey || `${j.provider}:${j.board_token}` === sourceKey));
    const key = (j: Job) => (sort === 'newest' ? Date.parse(j.posted_at ?? '') || Date.parse(j.first_seen_at) : Date.parse(j.last_seen_at)) || 0;
    return rows.sort((a, b) => key(b) - key(a));
  }, [data, q, arrangement, department, status, sourceKey, onlyMatches, watchRe, sort]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const queue = async (ids: string[]) => {
    if (!prefs) return;
    setQueuing(true);
    try {
      const n = await queueJobs(ids, prefs.apply_mode);
      const skipped = ids.length - n;
      toast('success', `${n} added to your queue${skipped ? `; ${skipped} skipped (already applied, duplicate, excluded or expired)` : ''}.`);
      setSelected(new Set());
      setOpen(null);
      reload();
    } catch (err) {
      toast('error', friendlyError(err, 'Could not queue those jobs.'));
    }
    setQueuing(false);
  };

  return (
    <>
      <PageHeader title="Discover jobs" subtitle="Live roles pulled from employer job boards. Listings that disappear from a board are marked as no longer listed on the next refresh." />
      {error && <div className="mb-6"><ErrorBanner message={error} onRetry={reload} /></div>}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-6">
          {data && <SourcesPanel sources={data.sources} onChanged={reload} />}
          {data && <WatchPanel onlyMatches={onlyMatches} setOnlyMatches={setOnlyMatches} matchCount={watchCount} />}
          <FillButtonCard compact />
        </div>

        <div>
          <Card className="mb-4 p-3">
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search title, company, location" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <select className="input w-auto" value={arrangement} onChange={(e) => setArrangement(e.target.value)} aria-label="Work arrangement">
                  <option value="">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">Onsite</option>
                </select>
                <select className="input w-auto max-w-[160px]" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
                  <option value="">All departments</option>
                  {departments.map((d) => <option key={d}>{d}</option>)}
                </select>
                <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
                  <option value="newest">Newest first</option><option value="seen">Recently refreshed</option>
                </select>
                <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
                  <option value="active">Active</option><option value="expired">No longer listed</option><option value="">All</option>
                </select>
                {data && data.sources.length > 1 && (
                  <select className="input w-auto max-w-[160px]" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} aria-label="Source">
                    <option value="">All sources</option>
                    {data.sources.map((s) => <option key={s.id} value={`${s.provider}:${s.board_token}`}>{s.company_name || s.board_token}</option>)}
                  </select>
                )}
              </div>
            </div>
          </Card>

          {selected.size > 0 && (
            <div className="sticky top-20 z-10 mb-4 flex animate-fade-up items-center justify-between rounded-xl bg-ink-950 px-4 py-3 text-sm text-white shadow-lg">
              <span><strong>{selected.size}</strong> selected · {prefs?.apply_mode} mode</span>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-300 hover:text-white">Clear</button>
                <Button size="sm" onClick={() => queue([...selected])} loading={queuing} icon={<ListPlus className="h-3.5 w-3.5" />}>Add to queue</Button>
              </div>
            </div>
          )}

          {loading ? <Spinner label="Loading jobs" /> : !data ? null : data.jobs.length === 0 ? (
            <Card><EmptyState icon={<Compass className="h-5 w-5" />} title="No jobs yet" body="Add a job source and refresh it to pull in live roles." /></Card>
          ) : filtered.length === 0 ? (
            <Card><EmptyState icon={<SlidersHorizontal className="h-5 w-5" />} title="No roles match these filters" body="Try clearing a filter or searching for something broader." /></Card>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold text-ink-500">
                  {filtered.length} role{filtered.length === 1 ? '' : 's'}
                  <span className="inline-flex items-center gap-1 font-normal text-ink-400"><Radio className="h-3 w-3 text-emerald-500" />Live · checks every 2 min{checkedAt ? ` · updated ${relativeTime(new Date(checkedAt).toISOString())}` : ''}</span>
                </p>
                {newCount > 0 && (
                  <button onClick={() => setReadAt(new Date().toISOString())} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-200">
                    <CheckCheck className="h-3.5 w-3.5" />Mark {newCount} new as read
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                {filtered.slice(0, visible).map((j) => {
                  const m = data.matches.get(j.id);
                  const appState = data.applied.get(j.id);
                  const canQueue = j.status === 'active' && !appState;
                  const fresh = j.status === 'active' && isNewJob(j, readAt);
                  const watched = !!watchRe && watchRe.test(j.title);
                  return (
                    <li key={j.id}>
                      <Card className={`flex items-center gap-4 p-4 transition hover:border-ink-300 hover:shadow-sm ${selected.has(j.id) ? 'border-brand-400 ring-4 ring-brand-500/10' : fresh ? 'border-amber-300 bg-amber-50/60' : ''}`}>
                        <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 disabled:opacity-30" checked={selected.has(j.id)}
                          disabled={!canQueue} onChange={() => toggle(j.id)} aria-label={`Select ${j.title}`} />
                        <button onClick={() => setOpen(j)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`truncate text-sm font-bold text-ink-950 ${watched ? 'underline decoration-brand-500 decoration-wavy decoration-[1.5px] underline-offset-4' : ''}`}>{j.title}</span>
                            {fresh && <Badge tone="amber">New</Badge>}
                            {j.status === 'expired' && <Badge tone="rose">No longer listed</Badge>}
                            {appState && <Badge tone="brand">In your applications</Badge>}
                            {m && !m.eligible && <Badge tone="neutral">Filtered out</Badge>}
                          </div>
                          <p className="mb-1 text-xs font-semibold text-ink-600">{j.company}</p>
                          <JobMeta job={j} />
                        </button>
                        <div className="hidden text-right text-[11px] text-ink-400 sm:block">seen {relativeTime(j.last_seen_at)}</div>
                        {m?.eligible ? <ScoreRing score={m.score} size={42} /> : <div className="w-[42px]" />}
                      </Card>
                    </li>
                  );
                })}
              </ul>
              {filtered.length > visible && (
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" onClick={() => setVisible((v) => v + 200)}>Show more ({filtered.length - visible} left)</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <JobDetailDrawer job={open} match={open ? data?.matches.get(open.id) : null} onClose={() => setOpen(null)}
        footer={open && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {open.status === 'active' && safeUrl(open.apply_url || open.url) && (
              <a href={safeUrl(open.apply_url || open.url)} target="_blank" rel="noopener noreferrer" title="Opens the employer's form. Click your Fill application bookmark there to fill it in."
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:border-ink-300 hover:bg-ink-50">
                <ExternalLink className="h-4 w-4" />Apply on employer site
              </a>
            )}
            {data?.applied.get(open.id) ? (
              <Button variant="secondary" onClick={() => navigate('auto-apply', open.id)}>View application</Button>
            ) : (
              <Button onClick={() => queue([open.id])} loading={queuing} disabled={open.status !== 'active'} icon={<ListPlus className="h-4 w-4" />}>Add to queue</Button>
            )}
          </div>
        )} />
    </>
  );
}
