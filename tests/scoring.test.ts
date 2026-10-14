import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, deniesSponsorship, normalizeWeights, requiredYears, scoreJob, type CandidateInput, type JobInput } from '../supabase/functions/match-jobs/scoring';

const job = (over: Partial<JobInput> = {}): JobInput => ({
  title: 'Data Analyst', company: 'Acme', location: 'Remote - US', work_arrangement: 'remote', seniority: 'entry',
  employment_type: 'Full-time', department: 'Analytics', salary_min: 70000, salary_max: 90000,
  description: 'We need 2+ years of experience with SQL, Python and Tableau to build dashboards.', ...over,
});

const candidate = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  skills: ['SQL', 'Python', 'Tableau'], experience_titles: ['Data Analyst Intern'], years_experience: 3,
  target_titles: ['Data Analyst'], locations: ['New York'], work_arrangements: ['remote'], seniority_levels: ['entry'],
  industries: [], keywords: ['dashboards'], employment_types: ['Full-time'], excluded_companies: [], min_salary: 60000,
  requires_sponsorship: false, willing_to_relocate: false, ...over,
});

describe('weights', () => {
  it('defaults to the documented weights that sum to 100', () => {
    expect(DEFAULT_WEIGHTS).toEqual({ experience: 25, skills: 25, title: 15, location: 10, seniority: 10, compensation: 10, other: 5 });
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('replaces invalid weights with defaults', () => {
    const w = normalizeWeights({ skills: -5, title: Number.NaN as unknown as number, other: 500 });
    expect(w.skills).toBe(25);
    expect(w.title).toBe(15);
    expect(w.other).toBe(100);
  });
});

describe('scoreJob', () => {
  it('scores a strong match highly and explains why', () => {
    const r = scoreJob(job(), candidate());
    expect(r.eligible).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.explanation.satisfied.join(' ')).toMatch(/sql/i);
    expect(r.explanation.satisfied.join(' ')).toMatch(/2\+ years/);
  });

  it('always returns a score between 0 and 100', () => {
    const r = scoreJob(job({ title: 'Chief Surgeon', description: 'Requires 15+ years of experience in kubernetes, rust, java', salary_max: 10, salary_min: 5 }), candidate({ years_experience: 0 }));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.explanation.missing.length).toBeGreaterThan(0);
  });

  it('applies eligibility filters before scoring', () => {
    const excluded = scoreJob(job(), candidate({ excluded_companies: ['acme'] }));
    expect(excluded.eligible).toBe(false);
    expect(excluded.score).toBe(0);
    expect(excluded.ineligible_reasons[0]).toMatch(/excluded/);

    const sponsor = scoreJob(job({ description: 'We are unable to sponsor visas for this role.' }), candidate({ requires_sponsorship: true }));
    expect(sponsor.eligible).toBe(false);

    const onsite = scoreJob(job({ work_arrangement: 'onsite', location: 'Austin, TX' }), candidate());
    expect(onsite.eligible).toBe(false);
    expect(scoreJob(job({ work_arrangement: 'onsite', location: 'Austin, TX' }), candidate({ willing_to_relocate: true })).eligible).toBe(true);
  });

  it('marks unknowns instead of guessing', () => {
    const r = scoreJob(job({ description: 'Great team.', salary_min: null, salary_max: null }), candidate());
    expect(r.explanation.unknown).toEqual(expect.arrayContaining(['Years of experience not stated', 'Salary not disclosed']));
  });

  it('penalizes pay below the minimum', () => {
    const ok = scoreJob(job(), candidate());
    const low = scoreJob(job(), candidate({ min_salary: 200000 }));
    expect(low.breakdown.compensation).toBeLessThan(ok.breakdown.compensation);
    expect(low.score).toBeLessThan(ok.score);
  });

  it('respects custom weights', () => {
    const skillsOnly = { experience: 0, skills: 100, title: 0, location: 0, seniority: 0, compensation: 0, other: 0 };
    const r = scoreJob(job(), candidate({ skills: [] }), skillsOnly);
    expect(r.score).toBe(0);
  });
});

describe('text signals', () => {
  it('reads required years', () => {
    expect(requiredYears('Minimum 5+ years of experience')).toBe(5);
    expect(requiredYears('No experience needed')).toBeNull();
  });
  it('detects explicit no-sponsorship language', () => {
    expect(deniesSponsorship('This position is not eligible for visa sponsorship')).toBe(true);
    expect(deniesSponsorship('We sponsor visas')).toBe(false);
  });
});
