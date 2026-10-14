import { describe, expect, it } from 'vitest';
import { findBoardsInHtml, findCareerLinks, isAllowedPublicUrl, isPrivateAddress, parseBoardUrl } from '../supabase/functions/job-sync/discover';

describe('parseBoardUrl', () => {
  it('detects boards from board, job and API links', () => {
    expect(parseBoardUrl('https://job-boards.greenhouse.io/affirm')).toMatchObject({ provider: 'greenhouse', token: 'affirm' });
    expect(parseBoardUrl('https://boards.greenhouse.io/Affirm/jobs/12345')).toMatchObject({ provider: 'greenhouse', token: 'affirm' });
    expect(parseBoardUrl('https://boards.greenhouse.io/embed/job_board?for=stripe')).toMatchObject({ provider: 'greenhouse', token: 'stripe' });
    expect(parseBoardUrl('https://jobs.ashbyhq.com/opengov')).toMatchObject({ provider: 'ashby', token: 'opengov' });
    expect(parseBoardUrl('https://jobs.lever.co/netflix/abc-123')).toMatchObject({ provider: 'lever', token: 'netflix' });
    expect(parseBoardUrl('https://api.lever.co/v0/postings/netflix?mode=json')).toMatchObject({ provider: 'lever', token: 'netflix' });
    expect(parseBoardUrl('https://acme.wd5.myworkdayjobs.com/en-US/External')).toMatchObject({ provider: 'workday', token: 'acme.wd5/External' });
  });
  it('rejects unrelated or malformed links', () => {
    expect(parseBoardUrl('https://example.com/careers')).toBeNull();
    expect(parseBoardUrl('https://boards.greenhouse.io/embed/job_board')).toBeNull();
    expect(parseBoardUrl('https://jobs.lever.co/')).toBeNull();
    expect(parseBoardUrl('ftp://jobs.lever.co/x')).toBeNull();
    expect(parseBoardUrl('not a url')).toBeNull();
  });
});

describe('findBoardsInHtml', () => {
  it('finds embedded and linked boards, deduplicated', () => {
    const html = `<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme&amp;b=x"></script>
      <a href="https://boards.greenhouse.io/acme/jobs/1">Role</a>
      <a href="https:\\/\\/jobs.ashbyhq.com\\/acme-labs">Ashby</a>`;
    const boards = findBoardsInHtml(html).map((b) => `${b.provider}:${b.token}`);
    expect(boards).toContain('greenhouse:acme');
    expect(boards).toContain('ashby:acme-labs');
    expect(boards.filter((b) => b === 'greenhouse:acme')).toHaveLength(1);
  });
  it('finds same-site careers links to follow', () => {
    const links = findCareerLinks('<a href="/careers">Careers</a><a href="https://other.com/jobs">x</a>', new URL('https://acme.com/'));
    expect(links.map((l) => l.href)).toEqual(['https://acme.com/careers']);
  });
});

describe('outbound fetch safety', () => {
  it('flags private and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
  it('only allows public web addresses', () => {
    expect(isAllowedPublicUrl(new URL('https://acme.com/careers'))).toBe(true);
    expect(isAllowedPublicUrl(new URL('http://localhost/'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('http://169.254.169.254/latest'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('http://[::1]/'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('https://acme.com:8443/'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('https://user:pw@acme.com/'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('http://db.internal/'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('file:///etc/passwd'))).toBe(false);
  });
});
