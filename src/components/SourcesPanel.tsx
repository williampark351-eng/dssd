import { useEffect, useState } from 'react';
import { AlertCircle, Clock, Library, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase, callFunction, friendlyError, audit } from '@/lib/supabase';
import { PROVIDER_LABEL, relativeTime } from '@/lib/format';
import type { JobSource } from '@/lib/types';
import { Badge, Button, Card, useToast } from '@/components/ui';
import AddSourceModal from '@/components/sources/AddSourceModal';
import BoardDirectoryModal from '@/components/sources/BoardDirectoryModal';

type SyncResult = { results: { source_id: string; jobs: number; expired: number; error?: string }[] };

export default function SourcesPanel({ sources, onChanged }: { sources: JobSource[]; onChanged: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('discovery_runs').select('finished_at').not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLastRun((data?.finished_at as string | undefined) ?? null));
  }, []);

  const sync = async (sourceId?: string) => {
    setBusy(sourceId ?? 'all');
    try {
      const res = await callFunction<SyncResult>('job-sync', sourceId ? { source_id: sourceId } : {});
      const total = res.results?.reduce((n, r) => n + (r.jobs || 0), 0) ?? 0;
      const failed = res.results?.filter((r) => r.error).length ?? 0;
      toast(failed ? 'info' : 'success', `Synced ${total} active roles${failed ? `; ${failed} source${failed > 1 ? 's' : ''} had a problem` : ''}.`);
      callFunction('match-jobs', {}).catch((e) => console.error(e));
    } catch (err) {
      toast('error', friendlyError(err, 'Sync failed. Please try again.'));
    }
    setBusy(null);
    onChanged();
  };

  const toggle = async (s: JobSource) => {
    const { error } = await supabase.from('job_sources').update({ active: !s.active }).eq('id', s.id);
    if (error) toast('error', friendlyError(error)); else onChanged();
  };

  const remove = async (s: JobSource) => {
    if (!confirm(`Remove ${s.company_name || s.board_token}? Jobs you already applied to stay in your history.`)) return;
    const { error } = await supabase.from('job_sources').delete().eq('id', s.id);
    if (error) toast('error', friendlyError(error));
    else { audit('job_source.removed', 'job_sources', { provider: s.provider, board_token: s.board_token }); onChanged(); }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink-950">Job sources</h2>
          <p className="text-xs text-ink-500">{sources.length} board{sources.length === 1 ? '' : 's'} connected</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => sync()} loading={busy === 'all'} disabled={!sources.length} icon={<RefreshCw className="h-3.5 w-3.5" />} aria-label="Refresh all">
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setAdding(true)} icon={<Plus className="h-3.5 w-3.5" />}>Add</Button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-[11px] text-brand-900">
        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Auto-refresh about every hour{lastRun ? ` · last run ${relativeTime(lastRun)}` : ''}</span>
        <button onClick={() => setBrowsing(true)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-900"><Library className="h-3.5 w-3.5" />Directory</button>
      </div>

      <ul className="space-y-2">
        {sources.length === 0 && (
          <li className="rounded-xl bg-ink-50 px-4 py-6 text-center text-xs leading-relaxed text-ink-500">
            Paste a job link or careers page and we'll find the employer's board, or <button onClick={() => setBrowsing(true)} className="font-semibold text-brand-700 hover:underline">browse the directory</button>.
          </li>
        )}
        {sources.map((s) => (
          <li key={s.id} className="group rounded-xl border border-ink-200 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-sm font-semibold ${s.active ? 'text-ink-900' : 'text-ink-400'}`}>{s.company_name || s.board_token}</span>
                  <Badge tone="neutral">{PROVIDER_LABEL[s.provider]}</Badge>
                </div>
                <p className="text-[11px] text-ink-500">{s.last_job_count} roles · synced {relativeTime(s.last_synced_at)}{!s.active && ' · paused'}</p>
              </div>
              <div className="flex opacity-60 transition group-hover:opacity-100">
                <button onClick={() => sync(s.id)} disabled={!!busy} className="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" title="Sync now" aria-label="Sync now">
                  <RefreshCw className={`h-3.5 w-3.5 ${busy === s.id ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => toggle(s)} className="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" title={s.active ? 'Pause' : 'Resume'} aria-label={s.active ? 'Pause source' : 'Resume source'}>
                  {s.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => remove(s)} className="rounded p-1.5 text-ink-500 hover:bg-rose-50 hover:text-rose-600" title="Remove" aria-label="Remove source">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {s.last_error && <p className="mt-2 flex gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] leading-snug text-rose-700"><AlertCircle className="mt-px h-3 w-3 shrink-0" />{s.last_error}</p>}
          </li>
        ))}
      </ul>

      <AddSourceModal open={adding} onClose={() => setAdding(false)} onAdded={onChanged} sync={sync} />
      <BoardDirectoryModal open={browsing} onClose={() => setBrowsing(false)} sources={sources}
        onFollowed={(id) => { onChanged(); sync(id); }} />
    </Card>
  );
}
