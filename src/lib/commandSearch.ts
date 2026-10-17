import { useEffect, useMemo, useState } from 'react';
import { useNav, type RouteKey } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  kind: 'nav' | 'job';
  route: RouteKey;
  param?: string;
};

const STATIC_ITEMS: { route: RouteKey; label: string; hint: string; icon: string }[] = [
  { route: 'overview', label: 'Overview', hint: 'Your pipeline at a glance', icon: 'LayoutDashboard' },
  { route: 'discover', label: 'Discover Jobs', hint: 'Live roles from your job sources', icon: 'Compass' },
  { route: 'recommended', label: 'Recommended Jobs', hint: 'Your best matches right now', icon: 'Sparkles' },
  { route: 'auto-apply', label: 'Auto-Apply', hint: 'Agreement, limits and daily quota', icon: 'Bot' },
  { route: 'queue', label: 'Application Queue', hint: 'Applications waiting on you', icon: 'ListChecks' },
  { route: 'applications', label: 'My Applications', hint: 'Everything you have applied to', icon: 'Briefcase' },
  { route: 'resumes', label: 'Resume Studio', hint: 'Upload and tailor your resume', icon: 'FileText' },
  { route: 'outreach', label: 'Outreach', hint: 'Messages and follow-ups', icon: 'Send' },
  { route: 'interviews', label: 'Interviews', hint: 'Scheduled and requested', icon: 'CalendarClock' },
  { route: 'practice', label: 'Mock Interviews', hint: 'Practice with live feedback', icon: 'Mic' },
  { route: 'analytics', label: 'Analytics', hint: 'Response rates and outcomes', icon: 'BarChart3' },
  { route: 'settings', label: 'Settings', hint: 'Profile, preferences, sources', icon: 'Settings' },
];

function useDebouncedQuery(query: string, delay = 180) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), delay);
    return () => clearTimeout(t);
  }, [query, delay]);
  return debounced;
}

export function useCommandPaletteSearch(query: string, open: boolean) {
  const debounced = useDebouncedQuery(query);
  const [results, setResults] = useState<CommandItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!debounced.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const q = debounced.trim();
    supabase.from('jobs').select('id, title, company').or(`title.ilike.%${q}%,company.ilike.%${q}%`).limit(8)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error || !data) return setResults([]);
        setResults(data.map((j: { id: string; title: string; company: string }) => ({
          id: j.id, label: j.title, hint: j.company, icon: 'Briefcase', kind: 'job' as const, route: 'discover' as RouteKey, param: j.id,
        })));
      });
    return () => { cancelled = true; };
  }, [debounced, open]);

  return { results, loading };
}

export function usePaletteCommands() {
  const { navigate } = useNav();
  return useMemo(() => STATIC_ITEMS.map(({ route, label, hint, icon }): CommandItem => ({
    id: `nav-${route}`, label, hint, icon, kind: 'nav', route,
  })), [navigate]);
}
