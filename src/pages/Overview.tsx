import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, CheckCircle2, ChevronRight, Compass, ListChecks, Sparkles, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { STATE_META, SUBMITTED_STATES, relativeTime } from '@/lib/format';
import type { AppEvent, Application, ApplicationState } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, StatCard } from '@/components/ui';
import { useOnMatchesUpdated } from '@/lib/rescore';

type Row = Pick<Application, 'id' | 'state' | 'submitted_at' | 'submission_method' | 'evidence_level' | 'employer_response' | 'required_action' | 'created_at'> & { job: { title: string; company: string } | null };

export default function Overview() {
  const { profile, prefs } = useAuth();
  const { navigate } = useNav();
  const { data, loading, error, reload } = useAsync(async () => {
    const [apps, matches, interviews, events, resumes, sources] = await Promise.all([
      must(supabase.from('applications').select('id, state, submitted_at, submission_method, evidence_level, employer_response, required_action, created_at, job:jobs(title, company)').order('updated_at', { ascending: false })),
      supabase.from('job_matches').select('id', { count: 'exact', head: true }).eq('eligible', true).eq('dismissed', false).gte('score', 60),
      supabase.from('interviews').select('id', { count: 'exact', head: true }).in('outcome', ['requested', 'scheduled']),
      must(supabase.from('application_events').select('*, application:applications(job:jobs(title, company))').order('created_at', { ascending: false }).limit(8)),
      supabase.from('resumes').select('id', { count: 'exact', head: true }),
      supabase.from('job_sources').select('id', { count: 'exact', head: true }),
    ]);
    return {
      apps: apps as unknown as Row[],
      strongMatches: matches.count ?? 0,
      upcomingInterviews: interviews.count ?? 0,
      events: events as unknown as (AppEvent & { application: { job: { title: string; company: string } | null } | null })[],
      resumeCount: resumes.count ?? 0,
      sourceCount: sources.count ?? 0,
    };
  });
  useOnMatchesUpdated(reload);

  if (loading) {
    return (
      <div className="animate-fade-up">
        <div className="skeleton mb-8 h-36 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="p-5"><div className="skeleton h-3 w-20" /><div className="skeleton mt-4 h-9 w-16" /></Card>
          ))}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-6"><div className="skeleton h-3 w-32" /><div className="mt-6 space-y-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div></Card>
          <Card className="p-6"><div className="skeleton h-3 w-24" /><div className="mt-6 space-y-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-3 w-full" />)}</div></Card>
        </div>
      </div>
    );
  }
  if (error || !data) return <ErrorBanner message={error ?? 'Could not load your overview.'} onRetry={reload} />;

  const count = (states: ApplicationState[]) => data.apps.filter((a) => states.includes(a.state)).length;
  const submitted = count(SUBMITTED_STATES);
  const needsYou = data.apps.filter((a) => a.state === 'NEEDS_USER_ACTION' || a.state === 'READY_FOR_REVIEW' || a.state === 'UNKNOWN_SUBMISSION_RESULT');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const submittedToday = data.apps.filter((a) => a.submitted_at && new Date(a.submitted_at) >= today && a.submission_method === 'provider_api').length;
  const employerAccepted = data.apps.filter((a) => ['provider_accepted', 'receipt_verified', 'employer_response_verified'].includes(a.evidence_level)).length;
  const selfReported = data.apps.filter((a) => a.evidence_level === 'user_reported').length;
  const responses = data.apps.filter((a) => a.employer_response !== 'none').length;
  const funnel: { label: string; value: number }[] = [
    { label: 'In pipeline', value: data.apps.length },
    { label: 'Submitted', value: submitted },
    { label: 'Accepted by employer', value: employerAccepted },
    { label: 'Responses', value: responses },
    { label: 'Interviews', value: data.apps.filter((a) => a.employer_response === 'interview' || a.employer_response === 'offer').length },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.value));
  const firstName = (profile?.full_name || '').split(' ')[0];

  const setup = [
    { done: data.resumeCount > 0, label: 'Upload a resume', go: () => navigate('resumes') },
    { done: data.sourceCount > 0, label: 'Add a job source', go: () => navigate('discover') },
    { done: data.strongMatches > 0, label: 'Find strong matches', go: () => navigate('recommended') },
    { done: data.apps.length > 0, label: 'Queue your first application', go: () => navigate('recommended') },
  ];
  const setupLeft = setup.filter((s) => !s.done);
  const setupDone = setup.length - setupLeft.length;

  return (
    <>
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-brand-950 px-6 py-8 text-white shadow-lg shadow-brand-950/20 sm:px-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-300">Dashboard</p>
            <h1 className="mt-1 font-display text-4xl">{firstName ? `Good to see you, ${firstName}` : 'Your pipeline at a glance'}</h1>
            <p className="mt-2 text-sm text-brand-100/80">
              {submittedToday} of {prefs?.daily_quota ?? 0} automated sends used today. Everything below is real, receipt-backed progress.
            </p>
          </div>
          <Button variant="dark" className="shrink-0 bg-ink-950/60 text-white ring-1 ring-inset ring-white/25 hover:bg-ink-950/80" onClick={() => navigate('recommended')} icon={<Sparkles className="h-4 w-4" />}>
            See recommendations
          </Button>
        </div>
      </div>

      {setupLeft.length > 0 && (
        <Card className="mb-8 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">Finish setting up your pipeline</h2>
            <span className="text-xs font-bold text-brand-700">{setupDone} of {setup.length} done</span>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {setup.map((s, i) => (
              <li key={s.label}>
                <button onClick={s.go}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ring-1 ring-inset transition-all duration-150 active:scale-[.98] ${
                    s.done ? 'bg-emerald-50/60 text-ink-400 line-through decoration-ink-300 ring-emerald-200/60' : 'bg-white text-ink-900 ring-ink-200 hover:border-brand-300 hover:ring-brand-300'}`}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    s.done ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'}`}>
                    {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {!s.done && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />}
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Strong matches" value={data.strongMatches} hint="Eligible, score 60+" icon={<Target className="h-4 w-4" />} />
        <StatCard label="Needs your input" value={needsYou.length} hint="Reviews and questions" icon={<AlertTriangle className="h-4 w-4" />} tone="amber" />
        <StatCard label="Submitted" value={submitted} hint={`${employerAccepted} accepted by employer system, ${selfReported} reported by you`} icon={<Briefcase className="h-4 w-4" />} tone="success" />
        <StatCard label="Upcoming interviews" value={data.upcomingInterviews} hint="Requested or scheduled" icon={<CalendarClock className="h-4 w-4" />} tone="sky" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-ink-950">Needs your attention</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('queue')}>Open queue <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
          {needsYou.length === 0 ? (
            <EmptyState icon={<ListChecks className="h-5 w-5" />} title="Nothing waiting on you" body="When an application needs a review, an answer, or a manual step, it shows up here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {needsYou.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <button onClick={() => navigate('queue', a.id)} className="group flex w-full items-center gap-4 rounded-lg py-3 pl-2 pr-3 text-left transition hover:bg-ink-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink-900">{a.job?.title ?? 'Role'}</p>
                      <p className="truncate text-xs text-ink-500">{a.job?.company} · {a.required_action || STATE_META[a.state].description}</p>
                    </div>
                    <Badge tone={STATE_META[a.state].tone}>{STATE_META[a.state].label}</Badge>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-5 text-base font-bold tracking-tight text-ink-950">Pipeline</h2>
          <div className="space-y-4">
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div className="mb-1.5 flex justify-between text-xs font-semibold"><span className="text-ink-600">{f.label}</span><span className="font-bold text-ink-900">{f.value}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(f.value > 0 ? 4 : 0, (f.value / max) * 100)}%`, opacity: 1 - i * 0.12 }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-5 text-base font-bold tracking-tight text-ink-950">Recent activity</h2>
        {data.events.length === 0 ? (
          <EmptyState icon={<Compass className="h-5 w-5" />} title="No activity yet" body="Queue an application and every step will be logged here." />
        ) : (
          <ol className="relative space-y-5 border-l border-ink-200 pl-6">
            {data.events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                <p className="text-sm text-ink-900"><span className="font-bold">{e.application?.job?.title ?? 'Application'}</span> <span className="text-ink-500">at {e.application?.job?.company}</span></p>
                <p className="mt-0.5 text-xs text-ink-500">{e.message} · {relativeTime(e.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
