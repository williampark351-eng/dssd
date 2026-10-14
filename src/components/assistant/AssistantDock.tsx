import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, ChevronDown, PictureInPicture2 } from 'lucide-react';
import AssistantPanel from '@/components/assistant/AssistantPanel';

type PipApi = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };

function pipApi(): PipApi | null {
  const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
  return api && window.top === window ? api : null;
}

function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.document.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      target.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet'; link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }
  target.document.body.className = 'h-screen overflow-hidden antialiased';
  target.document.title = 'Applyline HR assistant';
}

export default function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [hint, setHint] = useState('');

  useEffect(() => () => { pip?.close(); }, [pip]);

  const popOut = async () => {
    const api = pipApi();
    if (api) {
      try {
        const w = await api.requestWindow({ width: 420, height: 680 });
        copyStyles(w);
        w.addEventListener('pagehide', () => setPip(null));
        setPip(w);
        setOpen(false);
        return;
      } catch { /* fall through to a regular window */ }
    }
    const w = window.open(`${window.location.origin}${window.location.pathname}?assistant=1`, 'applyline-hr-assistant', 'popup,width=420,height=700');
    if (!w) { setHint('Your browser blocked the new window. Allow pop-ups for this site and try again.'); return; }
    if (window.top !== window) {
      setHint('In the Bolt preview, the new window first asks you to "Connect to Project". Click it once and the assistant appears. On your published site it opens straight away as a floating window.');
      return;
    }
    setOpen(false);
  };

  const popOutButton = (
    <button onClick={popOut} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" title="Pop out into its own window" aria-label="Pop out">
      <PictureInPicture2 className="h-4 w-4" />
    </button>
  );

  return (
    <>
      {pip && createPortal(<AssistantPanel win={pip} />, pip.document.body)}

      {open && !pip && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[min(640px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2rem))] animate-fade-up flex-col overflow-hidden rounded-2xl border border-ink-200 shadow-2xl shadow-ink-950/20">
          <AssistantPanel headerActions={<>
            {popOutButton}
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" aria-label="Minimize"><ChevronDown className="h-4 w-4" /></button>
          </>} />
          {hint && (
            <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] leading-relaxed text-amber-900">
              <span className="flex-1">{hint}</span>
              <button onClick={() => setHint('')} className="font-semibold text-amber-800 hover:text-amber-950">Got it</button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => (pip ? pip.focus() : setOpen((o) => !o))}
        className={`fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-lg transition hover:-translate-y-0.5 ${
          open ? 'bg-ink-950 text-white shadow-ink-950/20' : 'bg-brand-600 text-white shadow-brand-600/30 hover:bg-brand-700'}`}
      >
        <Briefcase className="h-4 w-4" />{pip ? 'HR assistant is popped out' : 'HR assistant'}
      </button>
    </>
  );
}
