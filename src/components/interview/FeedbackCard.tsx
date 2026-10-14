import { Check, Lightbulb, MessageSquareQuote, Sparkles, ThumbsUp, X } from 'lucide-react';
import type { MockTurn } from '@/lib/types';
import { languageLabel, paceLabel, wordsPerMinute } from '@/lib/interview';

const STAR: { key: keyof MockTurn['feedback']['structure']; label: string }[] = [
  { key: 'situation', label: 'Situation' }, { key: 'task', label: 'Task' }, { key: 'action', label: 'Action' }, { key: 'result', label: 'Result' },
];

const scoreTone = (s: number) => (s >= 4 ? 'text-emerald-600 bg-emerald-50 ring-emerald-200' : s >= 3 ? 'text-amber-700 bg-amber-50 ring-amber-200' : 'text-rose-600 bg-rose-50 ring-rose-200');

function List({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className={`mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${tone}`}>{icon}{title}</h4>
      <ul className="space-y-1.5">
        {items.map((s, i) => <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-700"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-400" />{s}</li>)}
      </ul>
    </div>
  );
}

export default function FeedbackCard({ turn, translateTo }: { turn: MockTurn; translateTo: string | null }) {
  const f = turn.feedback;
  const wpm = wordsPerMinute(f.word_count, turn.duration_s);
  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ${scoreTone(f.score)}`}>
          <div className="text-center"><div className="text-3xl font-bold leading-none">{f.score}</div><div className="mt-1 text-[11px] font-semibold opacity-80">out of 5</div></div>
        </div>
        <p className="text-sm leading-relaxed text-ink-700">{f.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAR.map(({ key, label }) => (
          <div key={key} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset ${f.structure[key] ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-ink-50 text-ink-500 ring-ink-200'}`}>
            {f.structure[key] ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}{label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-ink-50 p-3 text-center">
        <div><div className="text-lg font-bold text-ink-900">{wpm ?? '--'}</div><div className="text-xs text-ink-500">words/min, {paceLabel(wpm).toLowerCase()}</div></div>
        <div><div className="text-lg font-bold text-ink-900">{f.filler_words}</div><div className="text-xs text-ink-500">filler words</div></div>
        <div><div className="text-lg font-bold capitalize text-ink-900">{turn.tone || '--'}</div><div className="text-xs text-ink-500">detected tone</div></div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <List icon={<ThumbsUp className="h-3.5 w-3.5" />} title="What worked" items={f.strengths} tone="text-emerald-700" />
        <List icon={<Lightbulb className="h-3.5 w-3.5" />} title="To improve" items={f.improvements} tone="text-amber-700" />
      </div>
      <List icon={<Sparkles className="h-3.5 w-3.5" />} title="From your resume, worth mentioning" items={f.talking_points} tone="text-brand-700" />

      <details className="group rounded-xl border border-ink-100 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-700"><MessageSquareQuote className="h-4 w-4" />Your answer</summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{turn.transcript}</p>
        {turn.translation && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">In {languageLabel(translateTo)}</div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{turn.translation}</p>
          </div>
        )}
      </details>
    </div>
  );
}
