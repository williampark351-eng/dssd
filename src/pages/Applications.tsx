import { useMemo, useState } from 'react';
import { Briefcase, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useNav } from '@/context/NavContext';
import { EVIDENCE_META, METHOD_LABEL, RESPONSE_LABEL, STATE_META, formatDate } from '@/lib/format';
import type { Application } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, ScoreRing, Spinner } from '@/components/ui';
import ApplicationDrawer from '@/components/ApplicationDrawer';

const FILTERS = [
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted by employer' },
  { key: 'self', label: 'Reported by you' },
  { key: 'responses', label: 'Has response' },
  { key: 'all', label: 'Everything' },
] as const;

export default function Applications() {
  const { param, navigate } = useNav();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('sent');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useAsync(async () =>
    (await must(supabase.from('applications').select('*, job:jobs(*)').order('created_at', { ascending: false }).limit(1000))) as Application[]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((a) => {
      if (filter === 'sent' && !['SUBMITTED', 'CONFIRMED'].includes(a.state)) return false;
      if (filter === 'accepted' && !['provider_accepted', 'receipt_verified', 'employer_response_verified'].includes(a.evidence_level)) return false;
      if (filter === 'self' && a.evidence_level !== 'user_reported') return false;
      if (filter === 'responses' && a.employer_response === 'none') return false;
      return !needle || `${a.job?.title} ${a.job?.company} ${a.job?.location}`.toLowerCase().includes(needle);
    });
  }, [data, filter, q]);

  const openApp = data?.find((a) => a.id === param) ?? null;

  return (
    <>
      <PageHeader title="My applications" subtitle="Your full history with proof of how each one was sent, plus employer responses." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap rounded-xl bg-ink-100 p-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${filter === f.key ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>{f.label}</button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search by role or company" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<Briefcase className="h-5 w-5" />} title="No applications here yet"
          body="Once an application is submitted, by an integration or by you, it shows up here with its proof of submission."
          action={<Button variant="secondary" onClick={() => navigate('queue')}>Go to the queue</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1fr_140px_150px_130px_110px] gap-4 border-b border-ink-100 bg-ink-50/60 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-500 lg:grid">
            <span>Role</span><span>Status</span><span>Sent by</span><span>Response</span><span>Submitted</span>
          </div>
          <div className="divide-y divide-ink-100">
            {list.map((a) => {
              const meta = STATE_META[a.state];
              return (
                <button key={a.id} onClick={() => navigate('applications', a.id)}
                  className="grid w-full grid-cols-1 items-center gap-2 px-5 py-4 text-left transition hover:bg-ink-50 lg:grid-cols-[1fr_140px_150px_130px_110px] lg:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <ScoreRing score={a.match_score} size={36} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-950">{a.job?.title}</p>
                      <p className="truncate text-xs text-ink-500">{a.job?.company} · {a.job?.location || 'Location not listed'}</p>
                    </div>
                  </div>
                  <div><Badge tone={meta.tone}>{meta.label}</Badge></div>
                  <div className="text-xs text-ink-600">
                    {a.submission_method ? METHOD_LABEL[a.submission_method] : '—'}
                    {a.submitted_at && EVIDENCE_META[a.evidence_level] && <span className="block text-[11px] text-ink-400">{EVIDENCE_META[a.evidence_level].label}</span>}
                  </div>
                  <div className="text-xs text-ink-600">{RESPONSE_LABEL[a.employer_response] ?? a.employer_response}</div>
                  <div className="text-xs text-ink-500">{formatDate(a.submitted_at)}</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      <ApplicationDrawer app={openApp} onClose={() => navigate('applications')} onChanged={reload} />
    </>
  );
}
