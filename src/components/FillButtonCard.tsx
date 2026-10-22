import { useEffect, useMemo, useState } from 'react';
import { MousePointerClick, Pencil, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui';
import EditDetailsModal from '@/components/EditDetailsModal';
import { buildFillBookmarklet, fillDetailsFromProfile, type FillAnswer } from '@/lib/bookmarklet';
import { supabase } from '@/lib/supabase';
import type { ParsedResume } from '@/lib/types';

const STEPS = ['Drag the button to your bookmarks bar', 'Open any job application', 'Click the bookmark. It fills the form for you'];

export default function FillButtonCard({ compact = false }: { compact?: boolean }) {
  const { profile, prefs } = useAuth();
  const [resume, setResume] = useState<Partial<ParsedResume> | null>(null);
  const [answers, setAnswers] = useState<FillAnswer[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    supabase.from('resumes').select('parsed').order('is_primary', { ascending: false }).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => { if (!error && data?.parsed) setResume(data.parsed as Partial<ParsedResume>); });
    supabase.from('answer_library').select('question, answer').eq('approved', true).eq('sensitive', false).order('updated_at', { ascending: false }).limit(40)
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) setAnswers(data.filter((r) => r.question && r.answer).map((r) => [r.question, r.answer] as FillAnswer));
      });
  }, []);

  const details = useMemo(() => fillDetailsFromProfile(profile ?? {}, resume, prefs), [profile, resume, prefs]);
  const href = useMemo(() => buildFillBookmarklet(details, answers), [details, answers]);
  const filled = Object.values(details).filter(Boolean).length;
  const total = Object.keys(details).length;

  const button = (
    <a href={href} onClick={(e) => e.preventDefault()} draggable
      className="inline-flex cursor-grab items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:-translate-y-0.5 hover:bg-brand-700 active:cursor-grabbing">
      <MousePointerClick className="h-4 w-4" />Fill application
    </a>
  );
  const editLink = (
    <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800">
      <Pencil className="h-3 w-3" />Edit my details
    </button>
  );
  const modal = <EditDetailsModal open={editing} onClose={() => setEditing(false)} />;

  if (compact) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink-950">One-click autofill</h2>
        <ol className="mb-4 mt-2 space-y-1 text-xs text-ink-500">
          {STEPS.map((s, i) => <li key={s} className="flex gap-2"><span className="font-bold text-brand-700">{i + 1}</span>{s}</li>)}
        </ol>
        <div className="flex flex-col gap-2">{button}</div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-ink-400">
          <span>{filled} of {total} details ready</span>{editLink}
        </div>
        {modal}
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-sm font-bold text-ink-950">One-click autofill for any job application</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">
            Drag the button to your bookmarks bar once. On any application (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS or a company's own site), click it. It recognises the hiring system, opens the form if needed, and fills your contact details, links, current job, education, work authorization, sponsorship, relocation, salary and your approved saved answers.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-ink-500">
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Keeps filling as new questions or next steps appear, so multi-page forms like Workday fill as you go.</li>
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Only fills empty boxes and never submits. Browsers don't let any tool attach files, so you add your resume and press submit yourself.</li>
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Your details stay in the button itself. Sensitive saved answers are never included.</li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-400">
            <span>Using {filled} of {total} details and {answers.length} saved answer{answers.length === 1 ? '' : 's'}. After changing them, drag the button again.</span>
            {editLink}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          {button}
          <span className="text-[11px] text-ink-400">Drag me to your bookmarks bar</span>
        </div>
      </div>
      {modal}
    </Card>
  );
}
