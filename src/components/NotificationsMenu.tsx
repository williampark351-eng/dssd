import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';
import type { Notification } from '@/lib/types';
import { useNav, type RouteKey } from '@/context/NavContext';

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const { navigate } = useNav();

  const load = async () => {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
    if (!error && data) setItems(data as Notification[]);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAll = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: now }).in('id', ids);
    if (!error) setItems((xs) => xs.map((n) => (n.read_at ? n : { ...n, read_at: now })));
  };

  const openItem = async (n: Notification) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      await supabase.from('notifications').update({ read_at: now }).eq('id', n.id);
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
    }
    if (n.link) {
      const [r, p] = n.link.replace(/^#?\/?/, '').split('/');
      navigate(r as RouteKey, p);
      setOpen(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (!error) setItems((xs) => xs.filter((x) => x.id !== id));
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 hover:text-ink-900" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] animate-fade-up overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <span className="text-sm font-bold text-ink-900">Notifications</span>
            <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">You are all caught up.</p>}
            {items.map((n) => (
              <div key={n.id} className={`group flex gap-3 border-b border-ink-100 px-4 py-3 last:border-0 ${n.read_at ? '' : 'bg-brand-50/50'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand-500'}`} />
                <button onClick={() => openItem(n)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-600">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-ink-400">{relativeTime(n.created_at)}</p>
                </button>
                <button onClick={() => remove(n.id)} className="self-start rounded p-1 text-ink-300 opacity-0 transition hover:text-rose-600 group-hover:opacity-100" aria-label="Delete notification">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
