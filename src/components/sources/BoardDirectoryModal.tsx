import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Plus, Search } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import { PROVIDER_LABEL, relativeTime } from '@/lib/format';
import type { DiscoveredBoard, JobSource } from '@/lib/types';
import { Badge, Button, Modal, Spinner, useToast } from '@/components/ui';

export default function BoardDirectoryModal({ open, onClose, sources, onFollowed }: { open: boolean; onClose: () => void; sources: JobSource[]; onFollowed: (id: string) => void }) {
  const toast = useToast();
  const [boards, setBoards] = useState<DiscoveredBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    supabase.from('discovered_boards').select('*').in('status', ['active', 'error']).order('job_count', { ascending: false }).limit(500)
      .then(({ data, error: err }) => {
        if (err) setError(friendlyError(err, 'Could not load the board directory.'));
        else setBoards((data ?? []) as DiscoveredBoard[]);
      });
  }, [open]);

  const following = useMemo(() => new Set(sources.map((s) => `${s.provider}:${s.board_token}`)), [sources]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (boards ?? []).filter((b) => !term || b.company_name.toLowerCase().includes(term) || b.board_token.toLowerCase().includes(term));
  }, [boards, q]);

  const follow = async (b: DiscoveredBoard) => {
    setBusy(b.id);
    const { data, error: err } = await supabase.from('job_sources').insert({ provider: b.provider, board_token: b.board_token, company_name: b.company_name.slice(0, 120) }).select('id').maybeSingle();
    setBusy(null);
    if (err || !data) { toast('error', friendlyError(err, 'Could not follow that board.')); return; }
    audit('job_source.added', 'job_sources', { provider: b.provider, board_token: b.board_token, from: 'directory' });
    toast('success', `Following ${b.company_name || b.board_token}. Pulling in their roles now.`);
    onFollowed(data.id);
  };

  return (
    <Modal open={open} onClose={onClose} title="Employer board directory">
      <p className="mb-4 text-xs leading-relaxed text-ink-500">Public job boards found by people using this app. Every board here is refreshed automatically about every 12 hours.</p>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies" />
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : !boards ? <Spinner label="Loading directory" /> : shown.length === 0 ? (
        <div className="py-10 text-center text-sm text-ink-500"><Building2 className="mx-auto mb-2 h-6 w-6 text-ink-300" />{q ? 'No companies match that search.' : 'No boards discovered yet.'}</div>
      ) : (
        <ul className="divide-y divide-ink-100">
          {shown.map((b) => {
            const isFollowing = following.has(`${b.provider}:${b.board_token}`);
            return (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink-900">{b.company_name || b.board_token}</span>
                    <Badge>{PROVIDER_LABEL[b.provider]}</Badge>
                  </div>
                  <p className="text-[11px] text-ink-500">{b.last_checked_at ? `${b.job_count} roles · checked ${relativeTime(b.last_checked_at)}` : 'Waiting for first check'}{b.status === 'error' ? ' · last check had a problem' : ''}</p>
                </div>
                {isFollowing
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" />Following</span>
                  : <Button size="sm" variant="secondary" loading={busy === b.id} disabled={!!busy} icon={<Plus className="h-3.5 w-3.5" />} onClick={() => follow(b)}>Follow</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
