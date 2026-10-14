import { useEffect } from 'react';
import { supabase, callFunction } from '@/lib/supabase';

export const MATCHES_UPDATED = 'applyline:matches-updated';
const STALE_MS = 3 * 3600_000;

export function useAutoRescore(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let live = true;
    (async () => {
      const { data, error } = await supabase.from('job_matches').select('computed_at').order('computed_at', { ascending: false }).limit(1).maybeSingle();
      if (error || !live) return;
      const last = data?.computed_at ? Date.parse(String(data.computed_at)) : 0;
      if (Date.now() - last < STALE_MS) return;
      await callFunction('match-jobs', {});
      if (live) window.dispatchEvent(new Event(MATCHES_UPDATED));
    })().catch((e) => console.error('Background re-scoring failed', e));
    return () => { live = false; };
  }, [userId]);
}

export function useOnMatchesUpdated(fn: () => void) {
  useEffect(() => {
    window.addEventListener(MATCHES_UPDATED, fn);
    return () => window.removeEventListener(MATCHES_UPDATED, fn);
  }, [fn]);
}
