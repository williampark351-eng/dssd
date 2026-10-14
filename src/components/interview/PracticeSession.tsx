import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Keyboard, Languages, Loader2, Mic, RotateCcw, Square, Trophy, Volume2, Wand2 } from 'lucide-react';
import { callFunction, friendlyError } from '@/lib/supabase';
import { liveSupported, startLiveSession, type LiveEvent, type LiveSession } from '@/lib/liveTranscribe';
import { answeredCount, applySegment, joinSegments, languageLabel, mostCommon, nextUnanswered, sessionScore, wordCount, type Segment } from '@/lib/interview';
import type { MockInterview, MockTurn } from '@/lib/types';
import { Badge, Button, Card, ErrorBanner, useToast } from '@/components/ui';
import FeedbackCard from '@/components/interview/FeedbackCard';

type Phase = 'ready' | 'connecting' | 'live' | 'reviewing' | 'feedback' | 'typing';

const FOCUS_LABEL: Record<string, string> = { behavioral: 'Behavioral', role: 'Role skills', resume: 'About your resume', motivation: 'Motivation' };
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function PracticeSession({ mi, onChange, onBack }: { mi: MockInterview; onChange: (mi: MockInterview) => void; onBack: () => void }) {
  const toast = useToast();
  const canLive = liveSupported();
  const [idx, setIdx] = useState(() => nextUnanswered(mi));
  const [phase, setPhaseState] = useState<Phase>(() => (mi.turns?.[nextUnanswered(mi)] ? 'feedback' : canLive ? 'ready' : 'typing'));
  const [segments, setSegments] = useState<Segment[]>([]);
  const [translation, setTranslation] = useState<Segment[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [tone, setTone] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [reading, setReading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState(false);

  const phaseRef = useRef<Phase>(phase);
  const live = useRef<LiveSession | null>(null);
  const segRef = useRef<Segment[]>([]);
  const trRef = useRef<Segment[]>([]);
  const tonesRef = useRef<string[]>([]);
  const startedAt = useRef(0);
  const durationRef = useRef(0);

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const question = mi.questions[idx];
  const turn = mi.turns?.[idx] ?? null;
  const total = mi.questions.length;
  const done = answeredCount(mi);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = mi.answer_language;
    u.rate = 0.98;
    u.onstart = () => setReading(true);
    u.onend = u.onerror = () => setReading(false);
    window.speechSynthesis.speak(u);
  }, [mi.answer_language]);

  useEffect(() => {
    if (question && phaseRef.current === 'ready') speak(question.question);
  }, [idx, question, speak]);

  useEffect(() => () => {
    live.current?.stop();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (phase !== 'live') return;
    let raf = 0;
    const tick = () => { setLevel(live.current?.level() ?? 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 500);
    return () => { cancelAnimationFrame(raf); clearInterval(t); };
  }, [phase]);

  const goTo = (i: number) => {
    if (phaseRef.current === 'live' || phaseRef.current === 'connecting' || phaseRef.current === 'reviewing') return;
    setSummary(false);
    setError(null);
    setIdx(i);
    setPhase(mi.turns?.[i] ? 'feedback' : canLive ? 'ready' : 'typing');
  };

  const elapsedSeconds = () => Math.round((Date.now() - startedAt.current) / 1000);

  const submit = async (transcript: string, translated: string, detectedTone: string, duration: number) => {
    setPhase('reviewing');
    setError(null);
    try {
      const r = await callFunction<{ turn?: MockTurn; completed?: boolean }>('ai-assist', {
        action: 'interview_feedback', interview_id: mi.id, index: idx, transcript, translation: translated, tone: detectedTone, duration_s: duration,
      });
      if (!r?.turn?.feedback) throw new Error('The AI coach could not review that answer. Please try again.');
      const turns = [...(mi.turns ?? [])];
      turns[idx] = r.turn;
      onChange({ ...mi, turns, status: r.completed ? 'completed' : 'in_progress', updated_at: new Date().toISOString() });
      setPhase('feedback');
    } catch (err) {
      setError(friendlyError(err, 'The AI coach could not review that answer. Please try again.'));
      setTyped(transcript);
      setPhase('typing');
    }
  };

  const finalize = async (duration: number) => {
    durationRef.current = duration;
    live.current = null;
    const text = joinSegments(segRef.current);
    if (wordCount(text) < 5) {
      setError((prev) => prev ?? "We didn't catch enough of your answer. Check your microphone and try again, or type your answer instead.");
      setPhase('ready');
      return;
    }
    await submit(text, joinSegments(trRef.current), mostCommon(tonesRef.current), durationRef.current);
  };

  const onEvent = (e: LiveEvent) => {
    switch (e.kind) {
      case 'ready':
        if (phaseRef.current !== 'connecting') break;
        startedAt.current = Date.now();
        setPhase('live');
        break;
      case 'speaking': setSpeaking(e.active); break;
      case 'transcript':
        segRef.current = applySegment(segRef.current, e.id, e.text, e.final);
        setSegments(segRef.current);
        if (e.tone) { tonesRef.current.push(e.tone); setTone(e.tone); }
        break;
      case 'translation':
        trRef.current = applySegment(trRef.current, e.id, e.text, e.final);
        setTranslation(trRef.current);
        break;
      case 'warning': setWarning(e.message); break;
      case 'error': setError(e.message); break;
      case 'closed':
        if (phaseRef.current === 'connecting') { live.current = null; setPhase('ready'); }
        else if (phaseRef.current === 'live') { setPhase('reviewing'); finalize(elapsedSeconds()); }
        break;
    }
  };

  const startAnswer = async () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    segRef.current = []; trRef.current = []; tonesRef.current = [];
    setSegments([]); setTranslation([]); setTone(''); setElapsed(0); setError(null); setWarning(null); setSpeaking(false);
    setPhase('connecting');
    try {
      const s = await startLiveSession({ translateTo: mi.translate_to, onEvent });
      if (phaseRef.current === 'connecting') live.current = s;
      else await s.stop();
    } catch (err) {
      setError(friendlyError(err, 'Could not start live practice.'));
      setPhase('ready');
    }
  };

  const stopAnswer = async () => {
    const s = live.current;
    if (!s || phaseRef.current !== 'live') return;
    const duration = elapsedSeconds();
    setPhase('reviewing');
    await s.stop();
    await finalize(duration);
  };

  const cancelConnect = async () => {
    const s = live.current;
    setPhase('ready');
    live.current = null;
    await s?.stop();
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await callFunction<{ questions?: MockInterview['questions'] }>('ai-assist', { action: 'interview_questions', interview_id: mi.id, count: 6 });
      if (!Array.isArray(r?.questions) || !r.questions.length) throw new Error('No questions came back. Please try again.');
      onChange({ ...mi, questions: r.questions, turns: [], status: 'in_progress' });
      setIdx(0);
      setPhase(canLive ? 'ready' : 'typing');
    } catch (err) {
      toast('error', friendlyError(err, 'Could not write questions right now.'));
    } finally {
      setGenerating(false);
    }
  };

  const header = (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>All sessions</Button>
        <div>
          <h1 className="text-lg font-bold text-ink-950">{mi.role_title}{mi.company && <span className="font-medium text-ink-500"> at {mi.company}</span>}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>Answering in {languageLabel(mi.answer_language)}</span>
            {mi.translate_to && <Badge tone="sky"><Languages className="h-3 w-3" />Live translation to {languageLabel(mi.translate_to)}</Badge>}
          </div>
        </div>
      </div>
      {total > 0 && <Button variant="secondary" size="sm" icon={<Trophy className="h-4 w-4" />} disabled={!done} onClick={() => setSummary(true)}>Results</Button>}
    </div>
  );

  if (!total) {
    return (
      <div>
        {header}
        <Card className="p-10 text-center">
          <Wand2 className="mx-auto h-8 w-8 text-brand-600" />
          <h2 className="mt-4 text-base font-bold text-ink-900">Questions are not ready yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">The AI writes questions based on the role and your resume.</p>
          <Button className="mt-6" loading={generating} icon={<Wand2 className="h-4 w-4" />} onClick={generate}>Write my questions</Button>
        </Card>
      </div>
    );
  }

  if (summary) {
    const avg = sessionScore(mi);
    return (
      <div>
        {header}
        <Card className="animate-fade-up p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-2xl font-bold text-brand-700 ring-1 ring-inset ring-brand-200">{avg ?? '--'}</div>
            <div>
              <h2 className="text-base font-bold text-ink-950">Average score</h2>
              <p className="text-sm text-ink-600">{done} of {total} questions answered</p>
            </div>
          </div>
          <ul className="mt-6 divide-y divide-ink-100">
            {mi.questions.map((q, i) => {
              const t = mi.turns?.[i];
              return (
                <li key={i}>
                  <button onClick={() => goTo(i)} className="flex w-full items-center gap-4 py-3 text-left transition hover:bg-ink-50/60">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold ${t ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-400'}`}>{t ? t.feedback.score : '--'}</span>
                    <span className="flex-1 text-sm text-ink-800">{q.question}</span>
                    <ArrowRight className="h-4 w-4 text-ink-400" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    );
  }

  const busy = phase === 'live' || phase === 'connecting' || phase === 'reviewing';
  const ring = Math.min(1, level * 4);

  return (
    <div>
      {header}
      <div className="mb-5 flex items-center gap-1.5" aria-label="Questions">
        {mi.questions.map((_, i) => (
          <button key={i} disabled={busy} onClick={() => goTo(i)} aria-label={`Question ${i + 1}`}
            className={`h-2 flex-1 rounded-full transition ${i === idx ? 'bg-brand-600' : mi.turns?.[i] ? 'bg-emerald-400 hover:bg-emerald-500' : 'bg-ink-200 hover:bg-ink-300'} disabled:cursor-not-allowed`} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Question {idx + 1} of {total}</span>
              <Badge tone="brand">{FOCUS_LABEL[question.focus] ?? 'Interview'}</Badge>
            </div>
            <p className="mt-4 text-xl font-semibold leading-snug text-ink-950 sm:text-2xl">{question.question}</p>
            <button onClick={() => speak(question.question)} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
              <Volume2 className={`h-4 w-4 ${reading ? 'animate-pulse' : ''}`} />{reading ? 'Reading aloud...' : 'Hear the question'}
            </button>
          </Card>

          {error && <ErrorBanner message={error} />}
          {warning && phase === 'live' && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</div>}

          <Card className="p-6 sm:p-8">
            {phase === 'ready' && (
              <div className="flex flex-col items-center py-4 text-center">
                <button onClick={startAnswer} className="group grid h-24 w-24 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-900/20 transition hover:scale-105 hover:bg-brand-700 active:scale-95" aria-label="Start answering">
                  <Mic className="h-9 w-9" />
                </button>
                <h3 className="mt-5 text-base font-bold text-ink-900">Answer out loud</h3>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-600">Speak as you would in the real interview. Your words appear live, and you get feedback when you finish.</p>
                <button onClick={() => { setTyped(''); setPhase('typing'); }} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"><Keyboard className="h-4 w-4" />Type my answer instead</button>
              </div>
            )}

            {phase === 'connecting' && (
              <div className="flex flex-col items-center py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                <p className="mt-4 text-sm font-semibold text-ink-700">Connecting your microphone...</p>
                <Button variant="ghost" size="sm" className="mt-3" onClick={cancelConnect}>Cancel</Button>
              </div>
            )}

            {phase === 'live' && (
              <div>
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="relative grid h-20 w-20 shrink-0 place-items-center">
                    <span className="absolute inset-0 rounded-full bg-rose-500/20 transition-transform duration-100" style={{ transform: `scale(${1 + ring * 0.35})` }} />
                    <span className="relative grid h-16 w-16 place-items-center rounded-full bg-rose-600 text-white"><Mic className="h-7 w-7" /></span>
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center justify-center gap-2 sm:justify-start">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" />
                      <span className="text-sm font-bold text-ink-900">Recording {fmtTime(elapsed)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">{speaking ? 'Hearing you...' : 'Waiting for you to speak'}{tone && <> · tone: <span className="capitalize">{tone}</span></>}</p>
                  </div>
                  <Button variant="dark" icon={<Square className="h-4 w-4" />} onClick={stopAnswer}>Done answering</Button>
                </div>
                <div className="mt-6 min-h-[120px] rounded-xl bg-ink-50 p-4 text-sm leading-relaxed" aria-live="polite">
                  {segments.length ? segments.map((s) => <span key={s.id} className={s.final ? 'text-ink-900' : 'text-ink-500'}>{s.text} </span>) : <span className="text-ink-400">Your words will appear here as you speak.</span>}
                </div>
                {mi.translate_to && (
                  <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-4 text-sm leading-relaxed">
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-sky-700">{languageLabel(mi.translate_to)}</div>
                    {translation.length ? translation.map((s) => <span key={s.id} className={s.final ? 'text-ink-900' : 'text-ink-500'}>{s.text} </span>) : <span className="text-ink-400">Translation appears here.</span>}
                  </div>
                )}
              </div>
            )}

            {phase === 'reviewing' && (
              <div className="flex flex-col items-center py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                <p className="mt-4 text-sm font-semibold text-ink-700">Your coach is reviewing the answer...</p>
              </div>
            )}

            {phase === 'typing' && (
              <div>
                <label className="text-sm font-semibold text-ink-800" htmlFor="typed-answer">Your answer</label>
                <textarea id="typed-answer" className="input mt-2 min-h-[180px] leading-relaxed" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={8000} placeholder="Write your answer the way you would say it." />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  {canLive ? <button onClick={() => { setError(null); setPhase('ready'); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"><Mic className="h-4 w-4" />Use my microphone</button>
                    : <span className="text-xs text-ink-500">Live voice practice is not supported in this browser.</span>}
                  <Button disabled={wordCount(typed) < 5} onClick={() => submit(typed.trim(), '', '', durationRef.current)}>Get feedback</Button>
                </div>
              </div>
            )}

            {phase === 'feedback' && turn && (
              <div>
                <FeedbackCard turn={turn} translateTo={mi.translate_to} />
                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-5">
                  <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { setError(null); durationRef.current = 0; setPhase(canLive ? 'ready' : 'typing'); }}>Try again</Button>
                  {idx < total - 1
                    ? <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => goTo(idx + 1)}>Next question</Button>
                    : <Button icon={<Trophy className="h-4 w-4" />} onClick={() => setSummary(true)}>See results</Button>}
                </div>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-ink-900">Progress</h3>
            <div className="mt-3 text-3xl font-bold text-ink-950">{done}<span className="text-base font-medium text-ink-400"> / {total}</span></div>
            <p className="text-xs text-ink-500">questions answered{sessionScore(mi) !== null && <> · average {sessionScore(mi)} / 5</>}</p>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-bold text-ink-900">Tips</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600">
              <li>Use the STAR shape: the situation, your task, what you did, and the result.</li>
              <li>Give numbers only if they are true and you can explain them.</li>
              <li>Pausing is fine. The transcript waits for you.</li>
              <li>Sessions stop after 15 minutes of recording.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
