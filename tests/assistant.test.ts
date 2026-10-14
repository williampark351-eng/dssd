import { describe, expect, it } from 'vitest';
import { looksLikeJobDescription } from '../supabase/functions/ai-assist/assistant';

describe('HR assistant input detection', () => {
  it('treats pasted postings as job descriptions', () => {
    const jd = 'About the role\nWe are hiring a Data Analyst. Responsibilities include building dashboards and partnering with finance. Qualifications: 2+ years of SQL. '.repeat(4);
    expect(looksLikeJobDescription(jd)).toBe(true);
    expect(looksLikeJobDescription('Responsibilities: own reporting. Requirements: SQL and Excel.')).toBe(true);
  });
  it('treats short prompts as application questions', () => {
    expect(looksLikeJobDescription('Why do you want to work at Stripe?')).toBe(false);
    expect(looksLikeJobDescription('Describe a time you handled a difficult stakeholder and what you learned from it.')).toBe(false);
  });
});
