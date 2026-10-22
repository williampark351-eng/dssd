import { useState, type ReactNode } from 'react';
import { Bot, Compass, LogOut, Menu, Pause, Play, Route, X } from 'lucide-react';
import { supabase, audit, friendlyError } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNav, type RouteKey } from '@/context/NavContext';
import NotificationsMenu from '@/components/NotificationsMenu';
import { useToast } from '@/components/ui';
import { useAutoRescore } from '@/lib/rescore';

type NavItem = { key: RouteKey; label: string; icon: typeof Compass };

const ITEMS: NavItem[] = [
  { key: 'discover', label: 'Discover Jobs', icon: Compass },
  { key: 'auto-apply', label: 'Auto-Apply', icon: Bot },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, prefs, setPrefs } = useAuth();
  const { route, navigate } = useNav();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  useAutoRescore(profile?.id);

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
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-900/25">
          <Route className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[15px] font-extrabold leading-none tracking-tight text-ink-950">Applyline</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Find jobs, apply faster</div>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        <div>
            <ul className="space-y-0.5">
              {ITEMS.map(({ key, label, icon: Icon }) => {
                const active = route === key;
                return (
                  <li key={key}>
                    <button onClick={() => { navigate(key); setMobileOpen(false); }}
                      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-150 ${
                        active
                          ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/20'
                          : 'text-ink-600 hover:bg-ink-100/80 hover:text-ink-950'}`}>
                      {active && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
                      <Icon className={`h-4 w-4 transition-transform duration-150 group-hover:scale-110 ${active ? 'text-white' : 'text-ink-400 group-hover:text-ink-700'}`} />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
        </div>
      </div>
      <div className="border-t border-ink-200/70 bg-ink-50/60 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-xs font-bold text-brand-800 ring-1 ring-brand-300/50">
            {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-ink-900">{profile?.full_name || 'Your profile'}</div>
            <div className="truncate text-xs text-ink-500">{profile?.email}</div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-200/60 hover:text-ink-800" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  const paused = !!prefs?.automation_paused;

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-200/70 bg-white lg:block">{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink-950/45 backdrop-blur-[3px]" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 animate-slide-in bg-white shadow-2xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100" aria-label="Close menu"><X className="h-5 w-5" /></button>
            {nav}
          </aside>
        </div>
      )}

      <header className={`sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md transition-colors duration-300 sm:px-8 ${paused ? 'border-amber-200/80 bg-amber-50/90' : 'border-ink-200/60 bg-ink-50/85'}`}>
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        {paused && (
          <span className="hidden items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 sm:inline-flex">
            <Pause className="h-3.5 w-3.5" /> Automation paused
          </span>
        )}
        <div className="flex-1" />
        {prefs && (
          <button onClick={togglePause} disabled={toggling}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ring-inset transition-all duration-150 active:scale-[.97] disabled:opacity-60 ${
              paused ? 'bg-amber-100 text-amber-900 ring-amber-300 hover:bg-amber-200' : 'bg-white text-ink-700 ring-ink-200 shadow-sm hover:bg-ink-100'}`}>
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? 'Automation paused — resume' : 'Pause all automation'}
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
