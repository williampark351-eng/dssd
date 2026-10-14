/*
# Automatic job board discovery and scheduled refresh

1. Plain-English summary
   Users can paste any job link or company careers page and the system finds the employer's
   public job board (Greenhouse, Lever, Ashby, or Workday). Every board the system knows about
   goes into a shared directory, and a background schedule refreshes each board roughly every
   12 hours so listings stay current without anyone pressing "Refresh".

2. New Tables
   - `discovered_boards` - shared directory of public employer job boards
     - `id` uuid primary key
     - `provider` greenhouse | lever | ashby | workday
     - `board_token` the board's public name (Workday uses "tenant/site")
     - `company_name` display name
     - `source_url` the link the board was found from
     - `discovered_via` seed | url | career_page | follow
     - `status` active | unsupported | not_found | error
     - `job_count`, `last_checked_at`, `last_error`, `created_at`
     - No user identifiers are stored, so the directory never reveals who follows what.
   - `discovery_runs` - log of each automatic refresh (counts only, no personal data)
   - `discovery_config` - single private row holding the address and secret token the
     scheduler uses to call the refresh service. Not readable by any app user.

3. Security
   - RLS enabled on all three tables.
   - `discovered_boards` and `discovery_runs`: signed-in users may read (public company job
     boards and aggregate counts only). No insert/update/delete policies, so only the backend
     service can write.
   - `discovery_config`: RLS on, no policies, and all privileges revoked from anon and
     authenticated. Only the backend service role can read it.

4. Scheduling
   1. Enables pg_net (outbound HTTP from the database) and pg_cron (scheduler).
   2. Schedules `job-board-refresh` hourly. Each run refreshes up to a batch of boards that
      have not been checked in 12 hours, oldest first, which spreads load evenly.
   3. The job reads the address and token from `discovery_config` at run time, so nothing
      sensitive is embedded in the schedule definition.

5. Data
   - Seeds two public boards (Affirm on Greenhouse, OpenGov on Ashby).
   - Backfills the directory from boards users already follow.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS discovered_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('greenhouse','lever','ashby','workday')),
  board_token text NOT NULL CHECK (board_token ~ '^[A-Za-z0-9._/-]{1,200}$'),
  company_name text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '' CHECK (length(source_url) <= 2000),
  discovered_via text NOT NULL DEFAULT 'url' CHECK (discovered_via IN ('seed','url','career_page','follow')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsupported','not_found','error')),
  job_count int NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, board_token)
);
CREATE INDEX IF NOT EXISTS discovered_boards_refresh_idx ON discovered_boards (status, last_checked_at NULLS FIRST);
ALTER TABLE discovered_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_board_directory" ON discovered_boards;
CREATE POLICY "read_board_directory" ON discovered_boards FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  boards_checked int NOT NULL DEFAULT 0,
  jobs_seen int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS discovery_runs_started_idx ON discovery_runs (started_at DESC);
ALTER TABLE discovery_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_discovery_runs" ON discovery_runs;
CREATE POLICY "read_discovery_runs" ON discovery_runs FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS discovery_config (
  id int PRIMARY KEY CHECK (id = 1),
  function_url text NOT NULL,
  anon_key text NOT NULL,
  cron_token text NOT NULL
);
ALTER TABLE discovery_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON discovery_config FROM anon, authenticated;

INSERT INTO discovered_boards (provider, board_token, company_name, source_url, discovered_via)
VALUES
  ('greenhouse', 'affirm', 'Affirm', 'https://job-boards.greenhouse.io/affirm', 'seed'),
  ('ashby', 'opengov', 'OpenGov', 'https://jobs.ashbyhq.com/opengov', 'seed')
ON CONFLICT (provider, board_token) DO NOTHING;

INSERT INTO discovered_boards (provider, board_token, company_name, discovered_via)
SELECT DISTINCT ON (provider, board_token) provider, board_token, company_name, 'follow'
FROM job_sources
WHERE provider IN ('greenhouse','lever','ashby')
ON CONFLICT (provider, board_token) DO NOTHING;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'job-board-refresh';
  PERFORM cron.schedule(
    'job-board-refresh',
    '17 * * * *',
    $job$
      SELECT net.http_post(
        url := c.function_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || c.anon_key, 'x-cron-token', c.cron_token),
        body := '{"mode":"scheduled"}'::jsonb,
        timeout_milliseconds := 140000
      )
      FROM public.discovery_config c WHERE c.id = 1
    $job$
  );
END $$;
