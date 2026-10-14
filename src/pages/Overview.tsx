import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, CheckCircle2, Compass, ListChecks, Sparkles, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { STATE_META, SUBMITTED_STATES, relativeTime } from '@/lib/format';
import type { AppEvent, Application, ApplicationState } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard } from '@/components/ui';
import { useOnMatchesUpdated } from '@/lib/rescore';

type Row = Pick<Application, 'id' | 'state' | 'submitted_at' | 'employer_response' | 'required_action' | 'created_at'> & { job: { title: string; company: string } | null };

export default function Overview() {
  const { profile, prefs } = useAuth();
  const { navigate } = useNav();
  const { data, loading, error, reload } = useAsync(async () => {
    const [apps, matches, interviews, events, resumes, sources] = await Promise.all([
      must(supabase.from('applications').select('id, state, submitted_at, employer_response, required_action, created_at, job:jobs(title, company)').order('updated_at', { ascending: false })),
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

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBanner message={error ?? 'Could not load your overview.'} onRetry={reload} />;

  const count = (states: ApplicationState[]) => data.apps.filter((a) => states.includes(a.state)).length;
  const submitted = count(SUBMITTED_STATES);
  const needsYou = data.apps.filter((a) => a.state === 'NEEDS_USER_ACTION' || a.state === 'READY_FOR_REVIEW' || a.state === 'UNKNOWN_SUBMISSION_RESULT');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const submittedToday = data.apps.filter((a) => a.submitted_at && new Date(a.submitted_at) >= today).length;
  const responses = data.apps.filter((a) => a.employer_response !== 'none').length;
  const funnel: { label: string; value: number }[] = [
    { label: 'In pipeline', value: data.apps.length },
    { label: 'Submitted', value: submitted },
    { label: 'Confirmed', value: count(['CONFIRMED']) },
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

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : 'Overview'}
        subtitle={`Mode: ${prefs?.apply_mode === 'auto' ? 'Auto-apply' : prefs?.apply_mode === 'manual' ? 'Manual' : 'Assisted'}. ${submittedToday} of ${prefs?.daily_quota ?? 0} daily submissions used today.`}
        actions={<Button onClick={() => navigate('recommended')} icon={<Sparkles className="h-4 w-4" />}>See recommendations</Button>}
      />

      {setupLeft.length > 0 && (
        <Card className="mb-8 overflow-hidden">
          <div className="flex flex-col gap-4 bg-gradient-to-r from-brand-950 to-brand-800 p-6 text-white sm:flex-row sm:items-center">
            <div className="flex-1">
              <h2 className="text-lg font-bold">Finish setting up your pipeline</h2>
              <p className="mt-1 text-sm text-brand-100/80">{setup.length - setupLeft.length} of {setup.length} steps complete.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {setup.map((s) => (
                <button key={s.label} onClick={s.go} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${s.done ? 'bg-white/10 text-brand-100 line-through decoration-brand-300/60' : 'bg-white text-brand-900 hover:bg-brand-50'}`}>
                  {s.done && <CheckCircle2 className="h-3.5 w-3.5" />}{s.label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Strong matches" value={data.strongMatches} hint="Eligible, score 60+" icon={<Target className="h-4 w-4" />} />
        <StatCard label="Needs your input" value={needsYou.length} hint="Reviews and questions" icon={<AlertTriangle className="h-4 w-4" />} tone="amber" />
        <StatCard label="Submitted" value={submitted} hint={`${count(['CONFIRMED'])} confirmed by receipt`} icon={<Briefcase className="h-4 w-4" />} tone="success" />
        <StatCard label="Upcoming interviews" value={data.upcomingInterviews} hint="Requested or scheduled" icon={<CalendarClock className="h-4 w-4" />} tone="sky" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-950">Needs your attention</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('queue')}>Open queue <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
          {needsYou.length === 0 ? (
            <EmptyState icon={<ListChecks className="h-5 w-5" />} title="Nothing waiting on you" body="When an application needs a review, an answer, or a manual step, it shows up here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {needsYou.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <button onClick={() => navigate('queue', a.id)} className="flex w-full items-center gap-4 py-3 text-left transition hover:bg-ink-50/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{a.job?.title ?? 'Role'}</p>
                      <p className="truncate text-xs text-ink-500">{a.job?.company} · {a.required_action || STATE_META[a.state].description}</p>
                    </div>
                    <Badge tone={STATE_META[a.state].tone}>{STATE_META[a.state].label}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-5 text-base font-bold text-ink-950">Pipeline</h2>
          <div className="space-y-4">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="mb-1.5 flex justify-between text-xs font-semibold"><span className="text-ink-600">{f.label}</span><span className="text-ink-900">{f.value}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${(f.value / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-5 text-base font-bold text-ink-950">Recent activity</h2>
        {data.events.length === 0 ? (
          <EmptyState icon={<Compass className="h-5 w-5" />} title="No activity yet" body="Queue an application and every step will be logged here." />
        ) : (
          <ol className="relative space-y-5 border-l border-ink-200 pl-6">
            {data.events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                <p className="text-sm text-ink-900"><span className="font-semibold">{e.application?.job?.title ?? 'Application'}</span> <span className="text-ink-500">at {e.application?.job?.company}</span></p>
                <p className="mt-0.5 text-xs text-ink-500">{e.message} · {relativeTime(e.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
