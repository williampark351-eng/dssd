import { CheckCircle2, CircleHelp, ExternalLink, MapPin, XCircle } from 'lucide-react';
import type { Job, Match, Weights } from '@/lib/types';
import { PROVIDER_LABEL, formatDate, formatSalary, safeUrl } from '@/lib/format';
import { Badge, Drawer, ScoreRing } from '@/components/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { fetchJobDescription } from '@/lib/jobs';

function Description({ job }: { job: Job }) {
  const [loaded, setLoaded] = useState<{ id: string; text: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (job.description) return;
    let live = true;
    setFailed(false);
    fetchJobDescription(job.id).then((text) => { if (live) setLoaded({ id: job.id, text }); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [job.id, job.description]);
  if (job.description) return <>{job.description}</>;
  if (failed) return <span className="text-rose-600">Could not load the description. Use the original posting link above.</span>;
  if (loaded?.id !== job.id) return <span className="text-ink-400">Loading description...</span>;
  return <>{loaded.text || 'No description provided.'}</>;
}

export const WEIGHT_LABELS: Record<keyof Weights, string> = {
  experience: 'Experience', skills: 'Skills', title: 'Title fit', location: 'Location', seniority: 'Seniority', compensation: 'Compensation', other: 'Other preferences',
};

export function MatchBreakdown({ match }: { match: Match }) {
  if (!match.eligible) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-bold text-rose-800">Filtered out before scoring</p>
        <ul className="mt-2 space-y-1 text-sm text-rose-700">
          {match.ineligible_reasons.map((r) => <li key={r} className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{r}</li>)}
        </ul>
      </div>
    );
  }
  const ex = match.explanation ?? { reasons: [], satisfied: [], missing: [], unknown: [] };
  return (
    <div className="space-y-5">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {(Object.keys(WEIGHT_LABELS) as (keyof Weights)[]).map((k) => {
          const v = Math.round(match.breakdown?.[k] ?? 0);
          return (
            <div key={k}>
              <div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-ink-600">{WEIGHT_LABELS[k]}</span><span className="font-bold text-ink-900">{v}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div className={`h-full rounded-full ${v >= 75 ? 'bg-brand-500' : v >= 45 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${v}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {ex.reasons.length > 0 && (
        <div>
          <p className="label">Why it fits</p>
          <ul className="space-y-1.5 text-sm text-ink-700">{ex.reasons.map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{r}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <ReqList title="You have" items={ex.satisfied} icon={<CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />} />
        <ReqList title="Missing" items={ex.missing} icon={<XCircle className="h-3.5 w-3.5 text-rose-500" />} />
        <ReqList title="Not stated" items={ex.unknown} icon={<CircleHelp className="h-3.5 w-3.5 text-ink-400" />} />
      </div>
    </div>
  );
}

function ReqList({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{title}</p>
      {items.length === 0 ? <p className="text-xs text-ink-400">None</p> : (
        <ul className="space-y-1">{items.slice(0, 12).map((s) => <li key={s} className="flex items-center gap-1.5 text-xs text-ink-700">{icon}{s}</li>)}</ul>
      )}
    </div>
  );
}

export function JobMeta({ job }: { job: Job }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location || 'Location not listed'}</span>
      {job.work_arrangement && job.work_arrangement !== 'unknown' && <span className="capitalize">{job.work_arrangement}</span>}
      {job.department && <span>{job.department}</span>}
      <span>{formatSalary(job.salary_min, job.salary_max, job.salary_currency)}</span>
    </div>
  );
}

export function JobDetailDrawer({ job, match, onClose, footer }: { job: Job | null; match?: Match | null; onClose: () => void; footer?: ReactNode }) {
  return (
    <Drawer open={!!job} onClose={onClose} title={job?.title ?? ''} subtitle={job ? `${job.company} · ${PROVIDER_LABEL[job.provider] ?? job.provider}` : ''} footer={footer}>
      {job && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <JobMeta job={job} />
            {job.status === 'expired' && <Badge tone="rose">No longer listed</Badge>}
          </div>
          {match && (
            <section className="rounded-2xl border border-ink-200 p-5">
              <div className="mb-5 flex items-center gap-4">
                <ScoreRing score={match.score} size={56} />
                <div>
                  <p className="text-sm font-bold text-ink-900">Match score</p>
                  <p className="text-xs text-ink-500">Computed {formatDate(match.computed_at, true)} from your primary resume and preferences</p>
                </div>
              </div>
              <MatchBreakdown match={match} />
            </section>
          )}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="label mb-0">Job description</p>
              {safeUrl(job.url) && (
                <a href={safeUrl(job.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
                  Original posting <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <div className="whitespace-pre-line text-sm leading-relaxed text-ink-700"><Description job={job} /></div>
          </section>
          <p className="text-xs text-ink-400">First seen {formatDate(job.first_seen_at)} · last confirmed listed {formatDate(job.last_seen_at)}</p>
        </div>
      )}
    </Drawer>
  );
}
