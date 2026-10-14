import { AlertTriangle, Briefcase, Building2, Send, ShieldAlert, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useAuth } from '@/context/AuthContext';
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard } from '@/components/ui';

type Overview = { users: number; organizations: number; jobs_active: number; applications: number; submitted: number; failures: number };

export default function Platform() {
  const { profile } = useAuth();
  const { data, loading, error, reload } = useAsync(async () =>
    profile?.is_platform_admin ? ((await must(supabase.rpc('platform_overview'))) as Overview) : null, [profile?.is_platform_admin]);

  if (!profile?.is_platform_admin) {
    return <Card><EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="Platform administrators only" body="This area is restricted." /></Card>;
  }

  return (
    <>
      <PageHeader title="Platform admin" subtitle="System-wide health across every user and organization." />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading ? <Spinner /> : data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Users" value={data.users} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Organizations" value={data.organizations} icon={<Building2 className="h-4 w-4" />} tone="sky" />
          <StatCard label="Active jobs indexed" value={data.jobs_active} icon={<Briefcase className="h-4 w-4" />} tone="neutral" />
          <StatCard label="Applications" value={data.applications} icon={<Send className="h-4 w-4" />} tone="brand" />
          <StatCard label="Submitted" value={data.submitted} hint={`${data.applications ? Math.round((data.submitted / data.applications) * 100) : 0}% of all applications`} icon={<Send className="h-4 w-4" />} tone="success" />
          <StatCard label="Failed or unverified" value={data.failures} hint="Needs operator attention if rising" icon={<AlertTriangle className="h-4 w-4" />} tone="rose" />
        </div>
      )}
    </>
  );
}
