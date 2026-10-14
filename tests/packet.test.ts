import { describe, expect, it } from 'vitest';
import { buildAnswers, chooseResume, coverLetter, isSensitive, tailorResume, type Profile, type Question, type ResumeRow } from '../supabase/functions/application-worker/packet';

const profile: Profile = { full_name: 'Jordan Rivera', email: 'j@example.com', phone: '555-123-4567', location: 'Brooklyn, NY', linkedin_url: 'https://linkedin.com/in/jr', portfolio_url: '' };
const q = (label: string, field: string, required = true, extra: Partial<Question> = {}): Question => ({ label, field, required, type: 'input_text', ...extra });

describe('buildAnswers', () => {
  it('fills standard fields from the profile', () => {
    const { answers, pending } = buildAnswers([q('First Name', 'first_name'), q('Last Name', 'last_name'), q('Email', 'email'), q('Phone', 'phone')], profile, [], '');
    expect(answers.map((a) => a.answer)).toEqual(['Jordan', 'Rivera', 'j@example.com', '555-123-4567']);
    expect(answers.every((a) => a.source === 'profile')).toBe(true);
    expect(pending).toBe(0);
  });

  it('leaves unknown required questions empty and counts them as pending', () => {
    const { answers, pending } = buildAnswers([q('Why do you want to work at Acme?', 'q1')], profile, [], '');
    expect(answers[0].answer).toBe('');
    expect(answers[0].source).toBe('pending');
    expect(pending).toBe(1);
  });

  it('reuses approved library answers for similar questions', () => {
    const lib = [{ question: 'Are you willing to travel for work?', answer: 'Yes, up to 25%', approved: true, sensitive: false }];
    const { answers } = buildAnswers([q('Are you willing to travel?', 'q2')], profile, lib, '');
    expect(answers[0]).toMatchObject({ answer: 'Yes, up to 25%', source: 'library' });
  });

  it('ignores unapproved library answers', () => {
    const lib = [{ question: 'Are you willing to travel?', answer: 'Yes', approved: false, sensitive: false }];
    expect(buildAnswers([q('Are you willing to travel?', 'q2')], profile, lib, '').pending).toBe(1);
  });

  it('flags sensitive questions and never fills them from the profile', () => {
    const { answers } = buildAnswers([q('What is your gender?', 'gender'), q('Will you require visa sponsorship?', 'sponsor')], profile, [], '');
    expect(answers.every((a) => a.sensitive)).toBe(true);
    expect(answers.every((a) => a.answer === '')).toBe(true);
  });

  it('only accepts library answers that match a select option', () => {
    const lib = [{ question: 'Are you willing to relocate?', answer: 'Maybe later', approved: true, sensitive: false }];
    const options = [{ label: 'Yes', value: '1' }, { label: 'No', value: '0' }];
    const { answers } = buildAnswers([q('Are you willing to relocate?', 'reloc', true, { type: 'multi_value_single_select', options })], profile, lib, '');
    expect(answers[0].answer).toBe('');
  });
});

describe('sensitivity detection', () => {
  it.each(['Gender', 'Race / Ethnicity', 'Veteran status', 'Do you have a disability?', 'Salary expectations', 'Are you legally authorized to work in the US?'])('%s is sensitive', (label) => {
    expect(isSensitive(label)).toBe(true);
  });
  it('treats ordinary questions as not sensitive', () => {
    expect(isSensitive('Why are you interested in this role?')).toBe(false);
  });
});

describe('resume selection and tailoring', () => {
  const r = (id: string, over: Partial<ResumeRow>): ResumeRow => ({ id, name: id, target_category: '', is_primary: false, updated_at: '', parsed: { skills: [], experience: [] }, ...over });

  it('prefers the resume that fits the role', () => {
    const resumes = [
      r('general', { is_primary: true, parsed: { skills: ['Excel'], experience: [{ title: 'Clerk' }] } }),
      r('data', { target_category: 'Data analyst', parsed: { skills: ['SQL', 'Python', 'Tableau'], experience: [{ title: 'Analyst' }] } }),
    ];
    expect(chooseResume(resumes, 'Data Analyst', 'SQL and Python and Tableau')?.id).toBe('data');
  });

  it('returns null when no resume has usable content', () => {
    expect(chooseResume([r('empty', {})], 'Analyst', '')).toBeNull();
  });

  it('reorders but never adds content', () => {
    const parsed = { skills: ['Excel', 'SQL'], experience: [{ title: 'Analyst', company: 'Northwind', bullets: ['Organized files', 'Wrote SQL reports'] }] };
    const t = tailorResume(parsed, 'Looking for SQL expertise');
    expect(t.parsed.skills).toEqual(['SQL', 'Excel']);
    expect(t.parsed.experience?.[0].bullets).toEqual(['Wrote SQL reports', 'Organized files']);
    expect(new Set(t.parsed.skills)).toEqual(new Set(parsed.skills));
    expect(t.notes.join(' ')).toMatch(/No new skills/);
  });

  it('writes a cover letter using only real skills', () => {
    const letter = coverLetter(profile, { skills: ['SQL'], experience: [{ title: 'Analyst', company: 'Northwind' }] }, { title: 'Data Analyst', company: 'Acme' }, ['SQL']);
    expect(letter).toContain('Acme');
    expect(letter).toContain('SQL');
    expect(letter).not.toMatch(/kubernetes|phd/i);
  });
});
