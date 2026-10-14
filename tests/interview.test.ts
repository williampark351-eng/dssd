import { describe, expect, it } from 'vitest';
import { speechStats } from '../supabase/functions/ai-assist/interview';
import { answeredCount, applySegment, joinSegments, mostCommon, nextUnanswered, paceLabel, sessionScore, wordsPerMinute } from '../src/lib/interview';
import type { MockTurn } from '../src/lib/types';

const turn = (score: number) => ({ feedback: { score } }) as MockTurn;

describe('speechStats', () => {
  it('counts words and filler words', () => {
    expect(speechStats('Um, so basically I, uh, led the migration.')).toEqual({ word_count: 8, filler_words: 3 });
    expect(speechStats('   ')).toEqual({ word_count: 0, filler_words: 0 });
  });
});

describe('live transcript segments', () => {
  it('appends deltas and replaces with the final transcript', () => {
    let s = applySegment([], 'a', 'Hello', false);
    s = applySegment(s, 'a', ' wor', false);
    expect(s[0].text).toBe('Hello wor');
    s = applySegment(s, 'a', 'Hello world.', true);
    s = applySegment(s, 'a', ' late', false);
    expect(s).toEqual([{ id: 'a', text: 'Hello world.', final: true }]);
    s = applySegment(s, 'b', 'Second part.', true);
    expect(joinSegments(s)).toBe('Hello world. Second part.');
  });
});

describe('pace and tone', () => {
  it('computes words per minute only with enough audio', () => {
    expect(wordsPerMinute(150, 60)).toBe(150);
    expect(wordsPerMinute(10, 3)).toBeNull();
    expect(paceLabel(90)).toBe('A little slow');
    expect(paceLabel(140)).toBe('Comfortable pace');
    expect(paceLabel(200)).toBe('A little fast');
  });
  it('picks the most common tone', () => {
    expect(mostCommon(['neutral', 'happy', 'neutral', ''])).toBe('neutral');
    expect(mostCommon([])).toBe('');
  });
});

describe('session progress', () => {
  const questions = [{ question: 'a', focus: 'role' }, { question: 'b', focus: 'role' }, { question: 'c', focus: 'role' }];
  it('averages scores and finds the next unanswered question', () => {
    const mi = { questions, turns: [turn(4), null, turn(3)] };
    expect(sessionScore(mi)).toBe(3.5);
    expect(answeredCount(mi)).toBe(2);
    expect(nextUnanswered(mi)).toBe(1);
    expect(sessionScore({ turns: [] })).toBeNull();
    expect(nextUnanswered({ questions, turns: [turn(1), turn(2), turn(3)] })).toBe(0);
  });
});
