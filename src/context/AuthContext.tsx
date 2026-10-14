import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Membership, Preferences, Profile } from '@/lib/types';

type AuthValue = {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  prefs: Preferences | null;
  memberships: Membership[];
  loadError: string | null;
  refresh: () => Promise<void>;
  setPrefs: (p: Preferences) => void;
  setProfile: (p: Profile) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setPrefs(null);
      setMemberships([]);
      setLoading(false);
      return;
    }
    const [p, pr, m] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('candidate_preferences').select('*').eq('user_id', s.user.id).maybeSingle(),
      supabase.from('org_members').select('*, organization:organizations(*)').eq('user_id', s.user.id),
    ]);
    if (p.error || pr.error || !p.data || !pr.data) {
      console.error(p.error, pr.error);
      setLoadError('We could not load your account. Please refresh the page.');
    } else {
      setLoadError(null);
      setProfile(p.data as Profile);
      setPrefs(pr.data as Preferences);
    }
    setMemberships((m.data as Membership[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      load(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      (async () => {
        await load(s);
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(async () => {
    await load(session);
  }, [load, session]);

  return (
    <AuthContext.Provider value={{ session, loading, profile, prefs, memberships, loadError, refresh, setPrefs, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
