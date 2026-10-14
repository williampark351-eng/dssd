import { useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, ListPlus, Search } from 'lucide-react';
import { supabase, callFunction, friendlyError, audit } from '@/lib/supabase';
import { PROVIDER_LABEL } from '@/lib/format';
import type { JobSource } from '@/lib/types';
import { Badge, Button, Field, Modal, useToast } from '@/components/ui';

type Outcome = { provider: string; board_token: string; company: string; status: 'added' | 'already_following' | 'unsupported' | 'error'; jobs: number; message?: string };
type DiscoverResult = { results?: { input: string; boards: Outcome[]; error?: string }[] };

const PROVIDER_HINTS: Record<string, string> = {
  greenhouse: 'From boards.greenhouse.io/<name>',
  lever: 'From jobs.lever.co/<name>',
  ashby: 'From jobs.ashbyhq.com/<name>',
  workday: 'Written as tenant.wd5/SiteName, from tenant.wd5.myworkdayjobs.com/SiteName. Newest 60 roles.',
};

const STATUS_TEXT: Record<Outcome['status'], string> = {
  added: 'Added', already_following: 'Already following, refreshed', unsupported: 'Found, but no public feed', error: 'Problem',
};

export default function AddSourceModal({ open, onClose, onAdded, sync }: { open: boolean; onClose: () => void; onAdded: () => void; sync: (id: string) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'links' | 'manual'>('links');
  const [links, setLinks] = useState('');
  const [results, setResults] = useState<NonNullable<DiscoverResult['results']> | null>(null);
  const [provider, setProvider] = useState<JobSource['provider']>('greenhouse');
  const [token, setToken] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setResults(null); setLinks(''); setToken(''); setCompany(''); onClose(); };

  const find = async () => {
    const urls = links.split(/[\n,]+/).map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 10);
    if (!urls.length) return;
    setBusy(true);
    try {
      const res = await callFunction<DiscoverResult>('job-sync', { mode: 'discover', urls });
      if (!Array.isArray(res?.results)) throw new Error('Something went wrong while searching. Please try again.');
      setResults(res.results);
      const added = res.results.flatMap((r) => r.boards).filter((b) => b.status === 'added' || b.status === 'already_following');
      if (added.length) {
        onAdded();
        callFunction('match-jobs', {}).catch((e) => console.error(e));
      }
    } catch (err) {
      toast('error', friendlyError(err, 'Could not search those links.'));
    }
    setBusy(false);
  };

  const addManual = async () => {
    const t = token.trim();
    const valid = provider === 'workday' ? /^[a-z0-9-]{1,60}\.wd\d{1,3}\/[A-Za-z0-9_.-]{1,80}$/i.test(t) : /^[A-Za-z0-9._-]{1,100}$/.test(t);
    if (!valid) { toast('error', provider === 'workday' ? 'Workday boards look like tenant.wd5/SiteName.' : 'Board names can only contain letters, numbers, dots, dashes and underscores.'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('job_sources').insert({ provider, board_token: t, company_name: company.trim().slice(0, 120) }).select().maybeSingle();
    setBusy(false);
    if (error || !data) { toast('error', friendlyError(error, 'Could not add that source.')); return; }
    audit('job_source.added', 'job_sources', { provider, board_token: t });
    close();
    onAdded();
    sync(data.id);
  };

  const footer = mode === 'links'
    ? results
      ? <><Button variant="secondary" onClick={() => setResults(null)}>Search more links</Button><Button onClick={close}>Done</Button></>
      : <><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={find} loading={busy} disabled={!links.trim()} icon={<Search className="h-4 w-4" />}>{busy ? 'Searching...' : 'Find job boards'}</Button></>
    : <><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={addManual} loading={busy} disabled={!token.trim()}>Add and sync</Button></>;

  return (
    <Modal open={open} onClose={close} title="Add job sources" footer={footer}>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        {([['links', 'Links or names', Link2], ['manual', 'Board name', ListPlus]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setMode(k)} className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition ${mode === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {mode === 'links' && !results && (
        <div className="space-y-3">
          <Field label="Links or company names" hint="Up to 10, one per line. A company name, a job post, a job board, or a careers page all work.">
            <textarea className="input min-h-[140px] font-mono text-xs leading-relaxed" value={links} onChange={(e) => setLinks(e.target.value)}
              placeholder={'Ramp\nhttps://job-boards.greenhouse.io/affirm\nhttps://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite\nhttps://www.example.com/careers'} />
          </Field>
          <p className="text-xs leading-relaxed text-ink-500">We look for the employer's public Greenhouse, Lever, Ashby or Workday board, follow it for you, and re-check it about every hour. Handshake, LinkedIn and Indeed don't offer public feeds; paste the employer's own link or type the company name instead.</p>
        </div>
      )}

      {mode === 'links' && results && (
        <ul className="space-y-3">
          {results.map((r) => (
            <li key={r.input} className="rounded-xl border border-ink-200 p-3">
              <p className="truncate font-mono text-[11px] text-ink-500">{r.input}</p>
              {r.error && <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-rose-700"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />{r.error}</p>}
              {r.boards.map((b) => (
                <div key={`${b.provider}:${b.board_token}`} className="mt-2 flex items-start gap-2">
                  {b.status === 'added' || b.status === 'already_following'
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink-900">{b.company}</span>
                      <Badge>{PROVIDER_LABEL[b.provider] ?? b.provider}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">{STATUS_TEXT[b.status]}{b.status === 'added' || b.status === 'already_following' ? ` · ${b.jobs} open roles` : ''}</p>
                    {b.message && <p className="mt-1 text-xs leading-relaxed text-ink-600">{b.message}</p>}
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {mode === 'manual' && (
        <div className="space-y-4">
          <Field label="Platform">
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as JobSource['provider'])}>
              {Object.entries(PROVIDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Board name" hint={PROVIDER_HINTS[provider]}>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} maxLength={100} placeholder="company" />
          </Field>
          <Field label="Display name (optional)">
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
