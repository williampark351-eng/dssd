import { useState } from 'react';
import { BellRing, Eye } from 'lucide-react';
import { supabase, friendlyError } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Preferences } from '@/lib/types';
import { Card, TagInput, Toggle, useToast } from '@/components/ui';

export default function WatchPanel({ onlyMatches, setOnlyMatches, matchCount }: { onlyMatches: boolean; setOnlyMatches: (v: boolean) => void; matchCount: number }) {
  const { prefs, setPrefs } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  if (!prefs) return null;

  const save = async (patch: Partial<Pick<Preferences, 'watch_words' | 'watch_notify'>>) => {
    const prev = prefs;
    setPrefs({ ...prefs, ...patch });
    setSaving(true);
    const { error } = await supabase.from('candidate_preferences').update(patch).eq('user_id', prefs.user_id);
    setSaving(false);
    if (error) { setPrefs(prev); toast('error', friendlyError(error, 'Could not save your watch words.')); }
  };

  const toggleNotify = async (on: boolean) => {
    if (on) {
      if (!('Notification' in window)) { toast('error', "This browser doesn't support notifications."); return; }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast('error', 'Notifications are blocked for this site. Allow them in your browser settings first.'); return; }
      toast('info', "You'll get an alert while Applyline is open, even in a background tab.");
    }
    save({ watch_notify: on });
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Eye className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-bold text-ink-950">Watch words</h2>
        {saving && <span className="text-[11px] text-ink-400">Saving...</span>}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-500">Roles whose titles contain these words are underlined in the feed.</p>
      <TagInput value={prefs.watch_words ?? []} onChange={(v) => save({ watch_words: v.slice(0, 25) })} placeholder="policy, business development" />
      <div className="mt-4 space-y-3 text-sm">
        <label className="flex items-center justify-between gap-3">
          <span className="text-ink-700">Only show matches{prefs.watch_words?.length ? <span className="ml-1 text-xs text-ink-400">({matchCount})</span> : null}</span>
          <Toggle checked={onlyMatches} onChange={setOnlyMatches} disabled={!prefs.watch_words?.length} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-ink-700"><BellRing className="h-3.5 w-3.5 text-ink-400" />Notify me about new matches</span>
          <Toggle checked={prefs.watch_notify} onChange={toggleNotify} disabled={!prefs.watch_words?.length} />
        </label>
      </div>
    </Card>
  );
}
