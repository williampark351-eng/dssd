import { describe, expect, it } from 'vitest';
import { ungroundedClaims } from '../supabase/functions/ai-assist/grounding';
import { groundParsed } from '../supabase/functions/resume-parse/ground';
import { parseResumeText } from '../supabase/functions/resume-parse/parser';

const RESUME = `Jordan Rivera
jordan@example.com
EXPERIENCE
Data Analyst
Northwind Traders
2021 - 2024
Built SQL pipelines that cut reporting time by 40%
SKILLS
SQL, Python, Excel`;
const JOB = 'Data Analyst at Acme. Requirements: 5+ years with SQL and Kubernetes. Salary $120,000.';

describe('ungroundedClaims (AI drafts)', () => {
  it('accepts drafts that only use resume facts', () => {
    expect(ungroundedClaims('I built SQL pipelines at Northwind Traders that cut reporting time by 40%.', RESUME, JOB)).toEqual([]);
  });
  it('rejects skills the candidate never listed', () => {
    expect(ungroundedClaims('I have deep experience with Kubernetes and Tableau.', RESUME, JOB)).toEqual(expect.arrayContaining(['kubernetes', 'tableau']));
  });
  it('allows mentioning job requirements without claiming them', () => {
    expect(ungroundedClaims('Your team runs on Kubernetes, which excites me to learn.', RESUME, JOB)).not.toContain('kubernetes');
  });
  it('rejects invented figures and copied requirements claimed as own', () => {
    expect(ungroundedClaims('I increased revenue by 300%.', RESUME, JOB)).toContain('300%');
    expect(ungroundedClaims('I have 5+ years of experience.', RESUME, JOB)).toContain('5+');
  });
  it('rejects invented degrees', () => {
    expect(ungroundedClaims('My MBA prepared me well.', RESUME, JOB)).toContain('mba');
  });
});

describe('groundParsed (AI resume extraction)', () => {
  const fallback = parseResumeText(RESUME);

  it('keeps values that appear in the resume', () => {
    const { parsed, dropped } = groundParsed({
      contact: { name: 'Jordan Rivera', email: 'jordan@example.com' },
      experience: [{ title: 'Data Analyst', company: 'Northwind Traders', start: '2021', end: '2024', bullets: ['Built SQL pipelines that cut reporting time by 40%'] }],
      skills: ['SQL', 'Python', 'Excel'],
    }, RESUME, fallback);
    expect(dropped).toBe(0);
    expect(parsed.experience[0]).toMatchObject({ title: 'Data Analyst', company: 'Northwind Traders' });
    expect(parsed.experience[0].bullets).toHaveLength(1);
    expect(parsed.estimated_years).toBe(3);
  });

  it('drops hallucinated skills, roles, bullets and contact details', () => {
    const { parsed, dropped } = groundParsed({
      contact: { name: 'Jordan Rivera', email: 'fake@evil.com' },
      experience: [
        { title: 'Data Analyst', company: 'Northwind Traders', bullets: ['Led a team of 12 engineers'] },
        { title: 'VP of Data', company: 'Google', bullets: [] },
      ],
      skills: ['SQL', 'Kubernetes'],
      certifications: ['PMP'],
    }, RESUME, fallback);
    expect(dropped).toBeGreaterThanOrEqual(4);
    expect(parsed.contact.email).toBe('jordan@example.com');
    expect(JSON.stringify(parsed)).not.toMatch(/Google|VP of Data|Kubernetes|12 engineers|PMP|evil/);
  });

  it('falls back to the rule-based result on garbage', () => {
    expect(groundParsed('nonsense', RESUME, fallback).parsed.skills).toEqual(fallback.skills);
  });
});
