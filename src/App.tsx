import type { ComponentType } from 'react';
import { Loader2, Workflow } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NavProvider, useNav, type RouteKey } from '@/context/NavContext';
import { Button, ToastProvider } from '@/components/ui';
import AppShell from '@/components/AppShell';
import AssistantDock from '@/components/assistant/AssistantDock';
import AssistantPanel from '@/components/assistant/AssistantPanel';
import AuthPage from '@/pages/AuthPage';
import Onboarding from '@/pages/Onboarding';
import Overview from '@/pages/Overview';
import Discover from '@/pages/Discover';
import Recommended from '@/pages/Recommended';
import AutoApply from '@/pages/AutoApply';
import Queue from '@/pages/Queue';
import Applications from '@/pages/Applications';
import ResumeStudio from '@/pages/ResumeStudio';
import Outreach from '@/pages/Outreach';
import Interviews from '@/pages/Interviews';
import MockInterview from '@/pages/MockInterview';
import Analytics from '@/pages/Analytics';
import Settings from '@/pages/Settings';
import Organization from '@/pages/Organization';
import Platform from '@/pages/Platform';

const PAGES: Record<RouteKey, ComponentType> = {
  overview: Overview, discover: Discover, recommended: Recommended, 'auto-apply': AutoApply, queue: Queue,
  applications: Applications, resumes: ResumeStudio, outreach: Outreach, interviews: Interviews, practice: MockInterview, analytics: Analytics,
  settings: Settings, organization: Organization, platform: Platform,
};

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-950 text-brand-300"><Workflow className="h-6 w-6" /></div>
      <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
    </div>
  );
}

function Root() {
  const { session, loading, profile, loadError } = useAuth();
  const { route } = useNav();
  if (loading) return <Splash />;
  if (!session) return <AuthPage />;
  if (loadError || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <div className="card max-w-sm p-8 text-center">
          <p className="font-bold text-ink-950">Something went wrong</p>
          <p className="mt-2 text-sm text-ink-600">{loadError ?? 'We could not load your account.'}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => supabase.auth.signOut()}>Sign out</Button>
            <Button onClick={() => window.location.reload()}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }
  if (!profile.onboarding_complete) return <Onboarding />;
  if (new URLSearchParams(window.location.search).has('assistant')) {
    document.title = 'Applyline HR assistant';
    return <div className="h-screen"><AssistantPanel /></div>;
  }
  const Page = PAGES[route];
  return <><AppShell><Page /></AppShell><AssistantDock /></>;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NavProvider>
          <Root />
        </NavProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
