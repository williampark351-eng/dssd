/*
# Remove sandbox test employer data

1. Why
- The user wants only live employer jobs in the app. The built-in "Sandbox Labs" test board and its 8 sample roles are removed.

2. Changes
- Deletes job_matches, applications (events/outreach/interviews cascade; mock interviews keep their content with the link cleared), jobs, and job_sources rows whose provider is 'test_ats'.
- Deletes test_ats_submissions rows (sandbox receipts).
- No tables or columns are dropped.

3. Security
- No policy changes.
*/

DELETE FROM job_matches WHERE job_id IN (SELECT id FROM jobs WHERE provider = 'test_ats');
DELETE FROM applications WHERE job_id IN (SELECT id FROM jobs WHERE provider = 'test_ats');
DELETE FROM jobs WHERE provider = 'test_ats';
DELETE FROM job_sources WHERE provider = 'test_ats';
DELETE FROM test_ats_submissions;
