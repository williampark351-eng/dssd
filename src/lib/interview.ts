import type { MockInterview } from '@/lib/types';

export type Segment = { id: string; text: string; final: boolean };

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'zh', label: 'Chinese' }, { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' }, { code: 'de', label: 'German' }, { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' }, { code: 'ja', label: 'Japanese' }, { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' }, { code: 'ar', label: 'Arabic' }, { code: 'hi', label: 'Hindi' },
];

export const languageLabel = (code: string | null) => LANGUAGES.find((l) => l.code === code)?.label ?? code ?? '';

export function applySegment(list: Segment[], id: string, text: string, final: boolean): Segment[] {
  const i = list.findIndex((s) => s.id === id);
  if (i === -1) return [...list, { id, text, final }];
  const prev = list[i];
  if (prev.final && !final) return list;
  const next = [...list];
  next[i] = { id, text: final ? text : prev.text + text, final };
  return next;
}

export const joinSegments = (list: Segment[]) => list.map((s) => s.text.trim()).filter(Boolean).join(' ');

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function wordsPerMinute(words: number, seconds: number): number | null {
  if (seconds < 5 || words === 0) return null;
  return Math.round((words / seconds) * 60);
}

export function paceLabel(wpm: number | null): string {
  if (wpm === null) return 'Not enough audio';
  if (wpm < 110) return 'A little slow';
  if (wpm > 170) return 'A little fast';
  return 'Comfortable pace';
}

export function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = '';
  let max = 0;
  for (const [v, n] of counts) if (n > max) { best = v; max = n; }
  return best;
}

export function sessionScore(mi: Pick<MockInterview, 'turns'>): number | null {
  const scores = (mi.turns ?? []).flatMap((t) => (t?.feedback && typeof t.feedback.score === 'number' ? [t.feedback.score] : []));
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

export function answeredCount(mi: Pick<MockInterview, 'turns' | 'questions'>): number {
  return (mi.questions ?? []).filter((_, i) => mi.turns?.[i]).length;
}

export function nextUnanswered(mi: Pick<MockInterview, 'turns' | 'questions'>): number {
  const i = (mi.questions ?? []).findIndex((_, idx) => !mi.turns?.[idx]);
  return i === -1 ? 0 : i;
}
