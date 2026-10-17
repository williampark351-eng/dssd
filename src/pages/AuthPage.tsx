import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Route, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Field } from '@/components/ui';

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(error.status === 0 ? 'Network error. Please try again.' : 'Email or password is incorrect.');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { full_name: name.trim() } },
        });
        if (error || !data.session) setError('We could not create an account with those details. If you already have one, sign in instead.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] animate-float rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-[26rem] w-[26rem] animate-float rounded-full bg-sky-400/10 blur-3xl" style={{ animationDelay: '-2.5s' }} />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/30 to-transparent" />
        <div className="relative flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-400 text-brand-950 shadow-lg shadow-brand-500/30"><Route className="h-5 w-5" /></div>
          <span className="text-lg font-extrabold tracking-tight">Applyline</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="font-display text-6xl leading-[1.05]">Your job search, run like a well-kept pipeline.</h1>
          <p className="mt-5 text-base leading-relaxed text-brand-100/80">
            Discover roles from real employer boards, see exactly why each one fits, and send truthful, tailored applications with you in control of every submission.
          </p>
          <ul className="mt-10 space-y-4 text-sm">
            {[
              { icon: Target, text: 'Explainable 0–100 match scores with weights you control' },
              { icon: Sparkles, text: 'Tailored packets that never invent experience' },
              { icon: ShieldCheck, text: 'Nothing is marked submitted without real proof' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-brand-50/90">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/10"><Icon className="h-4 w-4 text-brand-300" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="surface-muted flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-900/20"><Route className="h-5 w-5" /></div>
            <span className="text-lg font-extrabold tracking-tight text-ink-950">Applyline</span>
          </div>
          <h2 className="font-display text-4xl text-ink-950">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-2 text-sm text-ink-500">
            {mode === 'signin' ? 'Sign in to pick up where your pipeline left off.' : 'Set up takes about three minutes. No card required.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === 'signup' && (
              <Field label="Full name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
              <div className="relative">
                <input className="input pr-10" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <p className="animate-fade-up rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>}
            <Button type="submit" loading={loading} className="w-full py-2.5">
              {mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            {mode === 'signin' ? 'New to Applyline?' : 'Already have an account?'}{' '}
            <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }} className="font-bold text-brand-700 underline-offset-2 transition hover:text-brand-600 hover:underline">
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <div className="mt-10 flex items-start gap-2 rounded-xl bg-white/80 p-3 text-xs leading-relaxed text-ink-600 ring-1 ring-ink-200/70">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            University invite? Sign up with the same email your career center used, then accept the invite under Settings.
          </div>
        </div>
      </main>
    </div>
  );
}
