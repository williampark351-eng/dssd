import { useState, type ReactNode } from 'react';
import {
  BarChart3, Bot, Briefcase, Building2, CalendarClock, Compass, FileText, LayoutDashboard, ListChecks, LogOut, Menu, Mic,
  Pause, Play, Route, Send, Settings, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { supabase, audit, friendlyError } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav, type RouteKey } from '@/context/NavContext';
import NotificationsMenu from '@/components/NotificationsMenu';
import { useToast } from '@/components/ui';
import { useAutoRescore } from '@/lib/rescore';

type NavItem = { key: RouteKey; label: string; icon: typeof Compass };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: 'Pipeline', items: [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'discover', label: 'Discover Jobs', icon: Compass },
    { key: 'recommended', label: 'Recommended Jobs', icon: Sparkles },
    { key: 'auto-apply', label: 'Auto-Apply', icon: Bot },
    { key: 'queue', label: 'Application Queue', icon: ListChecks },
    { key: 'applications', label: 'My Applications', icon: Briefcase },
  ] },
  { title: 'Toolkit', items: [
    { key: 'resumes', label: 'Resume Studio', icon: FileText },
    { key: 'outreach', label: 'Outreach', icon: Send },
    { key: 'interviews', label: 'Interviews', icon: CalendarClock },
    { key: 'practice', label: 'Mock Interviews', icon: Mic },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'settings', label: 'Settings', icon: Settings },
  ] },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, prefs, memberships, setPrefs } = useAuth();
  const { route, navigate } = useNav();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  useAutoRescore(profile?.id);

  const isStaff = memberships.some((m) => m.role === 'org_admin' || m.role === 'advisor');
  const sections = [...SECTIONS];
  const adminItems: NavItem[] = [];
  if (isStaff || memberships.length === 0) adminItems.push({ key: 'organization', label: isStaff ? 'Organization' : 'For universities', icon: Building2 });
  if (profile?.is_platform_admin) adminItems.push({ key: 'platform', label: 'Platform admin', icon: ShieldCheck });
  if (adminItems.length) sections.push({ title: 'Admin', items: adminItems });

  const togglePause = async () => {
    if (!prefs) return;
    setToggling(true);
    const next = !prefs.automation_paused;
    const { data, error } = await supabase.from('candidate_preferences').update({ automation_paused: next }).eq('user_id', prefs.user_id).select().maybeSingle();
    setToggling(false);
    if (error || !data) {
      toast('error', friendlyError(error, 'Could not change automation status.'));
      return;
    }
    setPrefs({ ...prefs, ...data });
    audit(next ? 'automation_paused' : 'automation_resumed', 'candidate_preferences');
    toast('success', next ? 'All automation is paused. Nothing will be prepared or submitted.' : 'Automation resumed.');
  };

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-900/20"><Route className="h-5 w-5" /></div>
        <div>
          <div className="text-[15px] font-bold leading-none tracking-tight text-ink-950">Applyline</div>
          <div className="mt-1 text-[11px] font-medium text-ink-500">Career automation</div>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{s.title}</div>
            <ul className="space-y-0.5">
              {s.items.map(({ key, label, icon: Icon }) => {
                const active = route === key;
                return (
                  <li key={key}>
                    <button onClick={() => { navigate(key); setMobileOpen(false); }}
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        active ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/10' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-950'}`}>
                      <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-ink-400 group-hover:text-ink-700'}`} />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
            {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-900">{profile?.full_name || 'Your profile'}</div>
            <div className="truncate text-xs text-ink-500">{profile?.email}</div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-800" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-200 bg-white lg:block">{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 animate-fade-up bg-white shadow-2xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Close menu"><X className="h-5 w-5" /></button>
            {nav}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200/70 bg-ink-50/85 px-4 backdrop-blur-md sm:px-8">
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div className="flex-1" />
        {prefs && (
          <button onClick={togglePause} disabled={toggling}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ring-inset transition disabled:opacity-60 ${
              prefs.automation_paused ? 'bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-100'}`}>
            {prefs.automation_paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {prefs.automation_paused ? 'Automation paused — resume' : 'Pause all automation'}
          </button>
        )}
        <NotificationsMenu />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
        <div key={route} className="animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
