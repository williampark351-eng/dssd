/*
# Live feed: Workday boards, watch words, starter companies, faster refresh

1. Modified Tables
- `job_sources`: the board name rule now also allows a single "/" so Workday
  boards (written as `tenant.wd5/SiteName`) can be followed. Existing rows already
  satisfy the looser rule; no data changes.
- `candidate_preferences`:
  - `watch_words` (text[], default empty) - words that highlight matching job titles.
  - `watch_notify` (boolean, default false) - send a browser alert when a new matching role appears.
  - `feed_read_at` (timestamptz, nullable) - roles first seen after this moment show as "New".

2. Data
- Adds the jobwire starter companies to the shared board directory
  (Stripe, Airbnb, Databricks, Duolingo, Coinbase, Figma, Reddit, GitLab, Palantir,
  Spotify, OpenAI, Ramp, Linear, NVIDIA, Salesforce). Existing entries are untouched.

3. Scheduling
- The `job-board-refresh` job now runs every 15 minutes instead of hourly. The server
  decides which boards are due (boards someone follows: hourly; directory-only: every 12h).

4. Security
- No policy changes. candidate_preferences keeps its existing owner-only policies;
  the new columns are ordinary user preferences.
*/

ALTER TABLE job_sources DROP CONSTRAINT IF EXISTS job_sources_board_token_check;
ALTER TABLE job_sources ADD CONSTRAINT job_sources_board_token_check
  CHECK (board_token ~ '^[A-Za-z0-9._-]{1,100}(/[A-Za-z0-9._-]{1,80})?$');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_preferences' AND column_name='watch_words') THEN
    ALTER TABLE candidate_preferences ADD COLUMN watch_words text[] NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_preferences' AND column_name='watch_notify') THEN
    ALTER TABLE candidate_preferences ADD COLUMN watch_notify boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_preferences' AND column_name='feed_read_at') THEN
    ALTER TABLE candidate_preferences ADD COLUMN feed_read_at timestamptz;
  END IF;
END $$;

INSERT INTO discovered_boards (provider, board_token, company_name, source_url, discovered_via, status) VALUES
  ('greenhouse','stripe','Stripe','https://job-boards.greenhouse.io/stripe','seed','active'),
  ('greenhouse','airbnb','Airbnb','https://job-boards.greenhouse.io/airbnb','seed','active'),
  ('greenhouse','databricks','Databricks','https://job-boards.greenhouse.io/databricks','seed','active'),
  ('greenhouse','duolingo','Duolingo','https://job-boards.greenhouse.io/duolingo','seed','active'),
  ('greenhouse','coinbase','Coinbase','https://job-boards.greenhouse.io/coinbase','seed','active'),
  ('greenhouse','figma','Figma','https://job-boards.greenhouse.io/figma','seed','active'),
  ('greenhouse','reddit','Reddit','https://job-boards.greenhouse.io/reddit','seed','active'),
  ('greenhouse','gitlab','GitLab','https://job-boards.greenhouse.io/gitlab','seed','active'),
  ('lever','palantir','Palantir','https://jobs.lever.co/palantir','seed','active'),
  ('lever','spotify','Spotify','https://jobs.lever.co/spotify','seed','active'),
  ('ashby','openai','OpenAI','https://jobs.ashbyhq.com/openai','seed','active'),
  ('ashby','ramp','Ramp','https://jobs.ashbyhq.com/ramp','seed','active'),
  ('ashby','linear','Linear','https://jobs.ashbyhq.com/linear','seed','active'),
  ('workday','nvidia.wd5/NVIDIAExternalCareerSite','NVIDIA','https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite','seed','active'),
  ('workday','salesforce.wd12/External_Career_Site','Salesforce','https://salesforce.wd12.myworkdayjobs.com/External_Career_Site','seed','active')
ON CONFLICT (provider, board_token) DO NOTHING;

UPDATE discovered_boards SET status = 'active', last_error = NULL WHERE provider = 'workday' AND status = 'unsupported';

SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'job-board-refresh'), schedule := '*/15 * * * *');
