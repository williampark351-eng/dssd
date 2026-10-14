import { describe, expect, it } from 'vitest';
import { dedupeKey, detectArrangement, htmlToText, inferLevel, normalizeGreenhouse, normalizeLever, normalizeTestAts, parseSalary } from '../supabase/functions/job-sync/normalize';

describe('job normalization helpers', () => {
  it('detects work arrangement', () => {
    expect(detectArrangement('Remote - US')).toBe('remote');
    expect(detectArrangement('New York', 'Hybrid')).toBe('hybrid');
    expect(detectArrangement('On-site in Boston')).toBe('onsite');
    expect(detectArrangement('Boston, MA')).toBe('unknown');
  });
  it('infers seniority from titles', () => {
    expect(inferLevel('Software Engineering Intern')).toBe('intern');
    expect(inferLevel('Senior Data Scientist')).toBe('senior');
    expect(inferLevel('Staff Engineer')).toBe('lead');
    expect(inferLevel('Junior Analyst')).toBe('entry');
    expect(inferLevel('Product Designer')).toBe('mid');
  });
  it('parses salary ranges and rejects nonsense', () => {
    expect(parseSalary('Pay: $120k - $150k')).toEqual({ min: 120000, max: 150000 });
    expect(parseSalary('$95,000 to $110,000 per year')).toEqual({ min: 95000, max: 110000 });
    expect(parseSalary('No salary listed')).toEqual({ min: null, max: null });
  });
  it('builds stable dedupe keys', () => {
    expect(dedupeKey('Acme, Inc.', 'Data  Analyst', 'NYC')).toBe(dedupeKey('acme inc', 'data analyst', 'nyc'));
  });
  it('strips html', () => {
    const t = htmlToText('<p>Hello&nbsp;<b>world</b></p><script>alert(1)</script>');
    expect(t).toContain('Hello');
    expect(t).toContain('world');
    expect(t).not.toContain('<');
  });
});

describe('provider adapters', () => {
  it('normalizes Greenhouse payloads', () => {
    const jobs = normalizeGreenhouse({ jobs: [{ id: 1, title: 'Backend Engineer', location: { name: 'Remote' }, absolute_url: 'https://boards.greenhouse.io/acme/jobs/1', content: '&lt;p&gt;Build APIs&lt;/p&gt;', departments: [{ name: 'Eng' }], updated_at: '2026-10-01T00:00:00Z' }] }, 'acme', 'Acme');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ provider: 'greenhouse', external_id: '1', title: 'Backend Engineer', company: 'Acme', work_arrangement: 'remote' });
    expect(jobs[0].description).toContain('Build APIs');
  });
  it('normalizes Lever payloads', () => {
    const jobs = normalizeLever([{ id: 'abc', text: 'Designer', categories: { location: 'Hybrid - SF', team: 'Design', commitment: 'Full-time' }, hostedUrl: 'https://jobs.lever.co/acme/abc', applyUrl: 'https://jobs.lever.co/acme/abc/apply', descriptionPlain: 'Design things', createdAt: 1760000000000 }], 'acme', 'Acme');
    expect(jobs[0]).toMatchObject({ provider: 'lever', external_id: 'abc', work_arrangement: 'hybrid' });
  });
  it('drops malformed rows and unsafe URLs', () => {
    const jobs = normalizeTestAts({ jobs: [{ id: 'x', title: '' }, { id: 'y', title: 'Analyst', url: 'javascript:alert(1)' }] }, 'sandbox');
    for (const j of jobs) {
      expect(j.title).not.toBe('');
      expect(j.url.startsWith('javascript')).toBe(false);
    }
  });
  it('tolerates empty or garbage payloads', () => {
    expect(normalizeGreenhouse(null, 'a', 'A')).toEqual([]);
    expect(normalizeLever({ nope: true }, 'a', 'A')).toEqual([]);
    expect(normalizeTestAts('bad', 'a')).toEqual([]);
  });
});
