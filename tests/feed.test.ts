import { describe, expect, it } from 'vitest';
import { companyGuesses, jobSiteMessage, looksLikeCompanyName, parseBoardSpec, parseBoardUrl } from '../supabase/functions/job-sync/discover';
import { normalizeWorkday, workdayPostedAt } from '../supabase/functions/job-sync/normalize';
import { arrivals, isNewJob, watchRegex } from '@/lib/watch';
import { buildFillBookmarklet, fieldFor, fillDetailsFromProfile, splitName } from '@/lib/bookmarklet';

describe('board specs and company names', () => {
  it('parses provider:token specs', () => {
    expect(parseBoardSpec('greenhouse:stripe')).toMatchObject({ provider: 'greenhouse', token: 'stripe' });
    expect(parseBoardSpec('ashby:Ramp')).toMatchObject({ provider: 'ashby' });
    expect(parseBoardSpec('workday:NVIDIA.wd5/NVIDIAExternalCareerSite')).toMatchObject({ provider: 'workday', token: 'nvidia.wd5/NVIDIAExternalCareerSite' });
    expect(parseBoardSpec('workday:nvidia')).toBeNull();
    expect(parseBoardSpec('stripe')).toBeNull();
  });
  it('tells company names apart from links', () => {
    expect(looksLikeCompanyName('Ramp')).toBe(true);
    expect(looksLikeCompanyName('Scale AI')).toBe(true);
    expect(looksLikeCompanyName('stripe.com')).toBe(false);
    expect(looksLikeCompanyName('https://ramp.com')).toBe(false);
    expect(looksLikeCompanyName('greenhouse:stripe')).toBe(false);
  });
  it('guesses board tokens for a name', () => {
    const tokens = companyGuesses('Scale AI, Inc').map((b) => `${b.provider}:${b.token}`);
    expect(tokens).toEqual(expect.arrayContaining(['greenhouse:scaleai', 'lever:scale-ai', 'ashby:scaleai']));
  });
  it('explains Handshake, LinkedIn and job search sites honestly', () => {
    expect(jobSiteMessage('https://app.joinhandshake.com/jobs/123')).toMatch(/Handshake/);
    expect(jobSiteMessage('www.linkedin.com/jobs/view/1')).toMatch(/LinkedIn/);
    expect(jobSiteMessage('https://www.indeed.com/viewjob?jk=1')).toMatch(/public feed/);
    expect(jobSiteMessage('https://jobs.lever.co/acme')).toBeNull();
  });
  it('reads Workday API and locale links', () => {
    expect(parseBoardUrl('https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/Careers/jobs')).toMatchObject({ provider: 'workday', token: 'acme.wd1/Careers' });
    expect(parseBoardUrl('https://acme.wd1.myworkdayjobs.com/fr-FR/Careers/job/Paris/Engineer_R1')).toMatchObject({ token: 'acme.wd1/Careers' });
  });
});

describe('Workday normalizing', () => {
  const now = Date.parse('2026-03-10T15:00:00Z');
  it('turns relative posted text into stable dates', () => {
    expect(workdayPostedAt('Posted Today', now)).toBe('2026-03-10T00:00:00.000Z');
    expect(workdayPostedAt('Posted 3 Days Ago', now)).toBe('2026-03-07T00:00:00.000Z');
    expect(workdayPostedAt('Posted 30+ Days Ago', now)).toBe('2026-02-08T00:00:00.000Z');
    expect(workdayPostedAt('', now)).toBeNull();
  });
  it('builds jobs from listings and details, deduping paths', () => {
    const listings = [
      { title: 'Data Engineer', externalPath: '/job/Austin/Data-Engineer_R1', locationsText: 'Austin, TX', postedOn: 'Posted Today' },
      { title: 'Data Engineer', externalPath: '/job/Austin/Data-Engineer_R1' },
      { title: 'Designer', externalPath: '/job/Remote/Designer_R2', postedOn: 'Posted Yesterday' },
    ];
    const details = new Map([['/job/Austin/Data-Engineer_R1', { jobPostingInfo: { title: 'Data Engineer', jobDescription: '<p>Pay $120,000 - $150,000</p>', externalUrl: 'https://acme.wd1.myworkdayjobs.com/Careers/job/Austin/Data-Engineer_R1', startDate: '2026-03-09' } }]]);
    const jobs = normalizeWorkday(listings, details, new Map([['/job/Remote/Designer_R2', 'Stored text']]), { token: 'acme.wd1/Careers', host: 'https://acme.wd1.myworkdayjobs.com', site: 'Careers', company: 'Acme', now });
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ provider: 'workday', company: 'Acme', salary_min: 120000, apply_url: 'https://acme.wd1.myworkdayjobs.com/Careers/job/Austin/Data-Engineer_R1/apply' });
    expect(jobs[0].posted_at).toBe('2026-03-09T00:00:00.000Z');
    expect(jobs[1]).toMatchObject({ description: 'Stored text', url: 'https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Designer_R2' });
  });
});

describe('watch words and new roles', () => {
  it('matches whole words, plurals and multi-word phrases', () => {
    const re = watchRegex(['data', 'machine learning', 'c++'])!;
    expect(re.test('Senior Data Engineer')).toBe(true);
    expect(re.test('Machine  Learning Researcher')).toBe(true);
    expect(re.test('Database Admin')).toBe(false);
    expect(watchRegex([' ', ''])).toBeNull();
  });
  it('flags roles first seen after the read marker', () => {
    expect(isNewJob({ first_seen_at: '2026-01-02T00:00:00Z' }, '2026-01-01T00:00:00Z')).toBe(true);
    expect(isNewJob({ first_seen_at: '2025-12-31T00:00:00Z' }, '2026-01-01T00:00:00Z')).toBe(false);
    expect(isNewJob({ first_seen_at: '2026-01-02T00:00:00Z' }, null)).toBe(false);
  });
  it('reports only arrivals after the first load', () => {
    expect(arrivals(null, [{ id: 'a' }])).toEqual([]);
    expect(arrivals(new Set(['a']), [{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'b' }]);
  });
});

describe('fill-application button', () => {
  it('splits names and maps profile details', () => {
    expect(splitName('Ada King Lovelace')).toEqual({ first: 'Ada King', last: 'Lovelace' });
    expect(splitName('Cher')).toEqual({ first: 'Cher', last: '' });
    expect(fillDetailsFromProfile({ full_name: 'Ada Lovelace', portfolio_url: 'https://ada.dev' })).toMatchObject({ first: 'Ada', last: 'Lovelace', website: 'https://ada.dev', email: '' });
  });
  it('recognizes common form fields', () => {
    expect(fieldFor('first_name First Name')).toBe('first');
    expect(fieldFor('job_application[last_name]')).toBe('last');
    expect(fieldFor('Email address')).toBe('email');
    expect(fieldFor('LinkedIn Profile URL')).toBe('linkedin');
    expect(fieldFor('GitHub or portfolio')).toBe('github');
    expect(fieldFor('Personal website')).toBe('website');
    expect(fieldFor('Current company')).toBe('company');
    expect(fieldFor('School')).toBe('school');
    expect(fieldFor('name')).toBe('full');
    expect(fieldFor('Mobile phone')).toBe('phone');
    expect(fieldFor('Why do you want to work here?')).toBeNull();
  });
  it('builds a bookmarklet that never submits', () => {
    const href = buildFillBookmarklet(fillDetailsFromProfile({ full_name: 'Ada "Q" Lovelace', email: 'ada@example.com' }));
    expect(href.startsWith('javascript:')).toBe(true);
    const code = decodeURIComponent(href.slice('javascript:'.length));
    expect(code).toContain('ada@example.com');
    expect(code).not.toMatch(/\.submit\(|requestSubmit/);
    expect(() => new Function(code)).not.toThrow();
  });
});
