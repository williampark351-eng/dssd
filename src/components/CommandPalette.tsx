import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3, Bot, Briefcase, Building2, CalendarClock, Compass, CornerDownLeft, FileText, LayoutDashboard, ListChecks, Mic, Search,
  Send, Settings, ShieldCheck, Sparkles,
} from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { useCommandPaletteSearch, usePaletteCommands, type CommandItem } from '@/lib/commandSearch';

const ICONS: Record<string, typeof Compass> = {
  LayoutDashboard, Compass, Sparkles, Bot, ListChecks, Briefcase, FileText, Send, CalendarClock, Mic, BarChart3, Settings, Building2, ShieldCheck,
};

function score(item: CommandItem, q: string): number {
  const label = item.label.toLowerCase();
  const hint = (item.hint ?? '').toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (hint.includes(q)) return 40;
  // loose subsequence match
  let li = 0;
  for (const ch of q) {
    const next = label.indexOf(ch, li);
    if (next === -1) return 0;
    li = next + 1;
  }
  return 20;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate } = useNav();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const staticCommands = usePaletteCommands();
  const { results: jobResults, loading: jobsLoading } = useCommandPaletteSearch(query, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuery('');
        setActive(0);
        onClose();
        return;
      }
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [open, onClose]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else { setQuery(''); setActive(0); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staticCommands.slice(0, 8);
    const nav = staticCommands.map((c) => ({ item: c, s: score(c, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    return [...nav.map((x) => x.item), ...jobResults].slice(0, 12);
  }, [query, staticCommands, jobResults]);

  useEffect(() => {
    setActive(0);
  }, [query, jobResults.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item: CommandItem) => {
    setQuery('');
    setActive(0);
    onClose();
    navigate(item.route, item.param ?? null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-ink-950/10">
        <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); run(filtered[active]); }
            }}
            placeholder="Search pages and jobs, or jump to…"
            className="flex-1 border-0 bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
          />
          <kbd className="hidden rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-500 sm:block">ESC</kbd>
        </div>

        <div ref={listRef} className="scrollbar-thin max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && !jobsLoading && (
            <p className="px-3 py-8 text-center text-sm text-ink-500">No matches for “{query}”.</p>
          )}
          {jobsLoading && (
            <div className="px-3 py-2 text-xs font-semibold text-ink-400">Searching jobs…</div>
          )}
          {filtered.map((item, i) => {
            const Icon = ICONS[item.icon] ?? Briefcase;
            return (
              <button
                key={`${item.kind}-${item.id}`}
                data-idx={i}
                onClick={() => run(item)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === active ? 'bg-brand-50' : ''}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${i === active ? 'bg-brand-100 text-brand-700 ring-brand-200' : 'bg-ink-50 text-ink-500 ring-ink-200'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink-900">{item.label}</span>
                  {item.hint && <span className="block truncate text-xs text-ink-500">{item.hint}</span>}
                </span>
                {item.kind === 'job' && <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">Job</span>}
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/70 px-4 py-2 text-[11px] font-medium text-ink-400">
          <span>↑↓ to move · Enter to open</span>
          <span className="hidden sm:block">Search jobs by title or company</span>
        </div>
      </div>
    </div>
  );
}
