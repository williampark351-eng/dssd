import { describe, expect, it } from 'vitest';
import { estimateYears, parseResumeText } from '../supabase/functions/resume-parse/parser';

const RESUME = `Jordan Rivera
Brooklyn, NY | jordan.rivera@example.com | (555) 123-4567
linkedin.com/in/jordanrivera

SUMMARY
Analyst who turns messy data into clear decisions.

EXPERIENCE
Data Analyst
Northwind Traders, New York, NY
Jan 2022 - Present
• Built SQL pipelines that cut reporting time by 40%
• Created Tableau dashboards for 5 teams

Business Intern
Contoso, Boston, MA
Jun 2020 - Dec 2021
- Automated weekly reports in Python

EDUCATION
B.S. Economics
State University
2016 - 2020

SKILLS
SQL, Python, Tableau; Excel | Statistics`;

describe('parseResumeText', () => {
  const p = parseResumeText(RESUME);

  it('extracts contact details', () => {
    expect(p.contact.name).toBe('Jordan Rivera');
    expect(p.contact.email).toBe('jordan.rivera@example.com');
    expect(p.contact.phone).toContain('555');
    expect(p.contact.linkedin).toContain('linkedin.com/in/jordanrivera');
    expect(p.contact.location).toBe('Brooklyn, NY');
  });

  it('extracts sections', () => {
    expect(p.summary).toMatch(/messy data/);
    expect(p.experience.length).toBeGreaterThanOrEqual(2);
    expect(p.experience[0].title).toMatch(/Data Analyst/);
    expect(p.experience[0].bullets.join(' ')).toMatch(/SQL pipelines/);
    expect(p.education.length).toBeGreaterThanOrEqual(1);
    expect(p.skills.map((s) => s.toLowerCase())).toEqual(expect.arrayContaining(['sql', 'python', 'tableau', 'excel', 'statistics']));
  });

  it('never invents content that is not in the text', () => {
    const all = JSON.stringify(p).toLowerCase();
    for (const fake of ['kubernetes', 'phd', 'harvard', 'manager']) expect(all).not.toContain(fake);
  });

  it('handles empty input', () => {
    const e = parseResumeText('');
    expect(e.experience).toEqual([]);
    expect(e.skills).toEqual([]);
    expect(e.estimated_years).toBe(0);
  });
});

describe('estimateYears', () => {
  it('merges overlapping roles instead of double counting', () => {
    expect(estimateYears([
      { title: 'A', company: '', location: '', start: '2015', end: '2020', bullets: [] },
      { title: 'B', company: '', location: '', start: '2018', end: '2022', bullets: [] },
    ])).toBe(7);
  });
  it('ignores roles without dates', () => {
    expect(estimateYears([{ title: 'A', company: '', location: '', start: '', end: '', bullets: [] }])).toBe(0);
  });
});
