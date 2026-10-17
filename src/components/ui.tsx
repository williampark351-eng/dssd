import {
  createContext, useCallback, useContext, useEffect, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import type { Tone } from '@/lib/format';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneClasses[tone]} ${className}`}>
      {children}
    </span>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-500 hover:shadow-md hover:shadow-brand-900/20',
  secondary: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-200 shadow-sm hover:bg-ink-50 hover:ring-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-rose-600 text-white shadow-sm shadow-rose-900/20 hover:bg-rose-500',
  dark: 'bg-ink-900 text-white shadow-sm hover:bg-ink-800',
};

export function Button({
  variant = 'primary', size = 'md', loading, icon, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
      } ${variantClasses[variant]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-4xl text-ink-950">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-ink-500">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> {label ?? 'Loading'}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="p-6">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-20" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-3 w-full" />)}
      </div>
    </Card>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">{icon}</div>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && <button onClick={onRetry} className="font-bold underline-offset-2 hover:underline">Retry</button>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'brand' }: { label: string; value: ReactNode; hint?: string; icon: ReactNode; tone?: Tone }) {
  return (
    <Card hover className="group p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset transition-transform duration-200 group-hover:scale-110 ${toneClasses[tone]}`}>{icon}</span>
      </div>
      <div className="mt-3 font-display text-4xl tracking-tight text-ink-950">{value}</div>
      {hint && <div className="mt-1 text-xs leading-relaxed text-ink-500">{hint}</div>}
    </Card>
  );
}

export function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? '#187f68' : score >= 55 ? '#d97706' : '#be123c';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e9edeb" strokeWidth={5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * score) / 100} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold text-ink-900">{score}</span>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/40 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl animate-slide-in flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-ink-950">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-ink-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && <div className="border-t border-ink-100 bg-ink-50/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/45 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-scale-in rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="text-base font-bold tracking-tight text-ink-950">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-800" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="scrollbar-thin max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${checked ? 'bg-brand-600' : 'bg-ink-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])].slice(0, 50));
    setDraft('');
  };
  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2 py-1.5 shadow-sm transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
      {value.map((t) => (
        <span key={t} className="inline-flex animate-scale-in items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="text-brand-400 transition hover:text-brand-800" aria-label={`Remove ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)); }}
        placeholder={value.length ? '' : placeholder} className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-ink-400" />
    </div>
  );
}

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
const ToastContext = createContext<(kind: Toast['kind'], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl bg-ink-950/95 px-4 py-3 text-sm text-white shadow-xl ring-1 ring-white/10 backdrop-blur">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" /> : t.kind === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />}
            <span className="flex-1 leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
