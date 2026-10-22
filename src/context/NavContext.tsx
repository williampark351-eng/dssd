import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type RouteKey = 'discover' | 'auto-apply';

const ROUTES: RouteKey[] = ['discover', 'auto-apply'];
const LEGACY: Record<string, RouteKey> = { queue: 'auto-apply', applications: 'auto-apply' };

function readHash(): { route: RouteKey; param: string | null } {
  const [r, param] = window.location.hash.replace(/^#\/?/, '').split('/');
  const route = ROUTES.includes(r as RouteKey) ? (r as RouteKey) : LEGACY[r];
  return route ? { route, param: param || null } : { route: 'discover', param: null };
}

type NavValue = { route: RouteKey; param: string | null; navigate: (r: RouteKey, param?: string | null) => void };
const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readHash);
  useEffect(() => {
    const onHash = () => setState(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((r: RouteKey, param?: string | null) => {
    window.location.hash = `/${r}${param ? `/${param}` : ''}`;
    window.scrollTo({ top: 0 });
  }, []);
  return <NavContext.Provider value={{ ...state, navigate }}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavProvider');
  return ctx;
}
