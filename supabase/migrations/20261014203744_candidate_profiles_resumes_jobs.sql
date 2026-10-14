/*
# Candidate profiles, resumes, answers, job sources, jobs and matches

1. New Tables
- `profiles` - one row per signed-in user (contact info, eligibility, onboarding flag, platform admin flag)
- `candidate_preferences` - job preferences, match weighting, apply mode, auto-apply consent, daily quota, pause switch
- `resumes` - multiple resume versions with parsed, candidate-reviewed content
- `answer_library` - reusable candidate-approved application answers
- `job_sources` - per-user ATS boards to collect jobs from (Greenhouse, Lever, Ashby, Workday, test ATS)
- `jobs` - normalized public job postings (shared, written only by backend services)
- `job_matches` - per-user match score, breakdown and explanation (written only by backend services)

2. Security
- RLS enabled on all tables.
- Users can only access their own profile, preferences, resumes, answers, sources and matches.
- `is_platform_admin` and `email` on profiles cannot be changed by users (column privileges).
- `jobs` is readable by all signed-in users because it only contains public job postings; nobody can write via the API.
- `job_matches` scores can only be written by the server; users may only toggle saved/dismissed.

3. Notes
1. A trigger creates the profile + preferences rows automatically at signup.
2. Auto-apply mode cannot be stored without a consent timestamp (check constraint).
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  linkedin_url text NOT NULL DEFAULT '',
  portfolio_url text NOT NULL DEFAULT '',
  years_experience int NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 70),
  work_authorization text NOT NULL DEFAULT '',
  requires_sponsorship boolean NOT NULL DEFAULT false,
  willing_to_relocate boolean NOT NULL DEFAULT false,
  onboarding_complete boolean NOT NULL DEFAULT false,
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

REVOKE INSERT, UPDATE, DELETE ON profiles FROM anon, authenticated;
GRANT UPDATE (full_name, headline, phone, location, linkedin_url, portfolio_url, years_experience,
  work_authorization, requires_sponsorship, willing_to_relocate, onboarding_complete, updated_at)
  ON profiles TO authenticated;

CREATE TABLE IF NOT EXISTS candidate_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  target_titles text[] NOT NULL DEFAULT '{}',
  locations text[] NOT NULL DEFAULT '{}',
  work_arrangements text[] NOT NULL DEFAULT '{}',
  seniority_levels text[] NOT NULL DEFAULT '{}',
  industries text[] NOT NULL DEFAULT '{}',
  employment_types text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  excluded_companies text[] NOT NULL DEFAULT '{}',
  min_salary int NOT NULL DEFAULT 0 CHECK (min_salary >= 0),
  salary_currency text NOT NULL DEFAULT 'USD',
  weights jsonb NOT NULL DEFAULT '{"experience":25,"skills":25,"title":15,"location":10,"seniority":10,"compensation":10,"other":5}',
  apply_mode text NOT NULL DEFAULT 'assisted' CHECK (apply_mode IN ('manual','assisted','auto')),
  auto_apply_consent_at timestamptz,
  auto_min_score int NOT NULL DEFAULT 75 CHECK (auto_min_score BETWEEN 0 AND 100),
  daily_quota int NOT NULL DEFAULT 10 CHECK (daily_quota BETWEEN 0 AND 50),
  automation_paused boolean NOT NULL DEFAULT false,
  generate_cover_letters boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auto_requires_consent CHECK (apply_mode <> 'auto' OR auto_apply_consent_at IS NOT NULL)
);
ALTER TABLE candidate_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_prefs" ON candidate_preferences;
CREATE POLICY "select_own_prefs" ON candidate_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_prefs" ON candidate_preferences;
CREATE POLICY "insert_own_prefs" ON candidate_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_prefs" ON candidate_preferences;
CREATE POLICY "update_own_prefs" ON candidate_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_prefs" ON candidate_preferences;
CREATE POLICY "delete_own_prefs" ON candidate_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My resume',
  target_category text NOT NULL DEFAULT '',
  file_path text,
  file_name text,
  file_type text,
  raw_text text NOT NULL DEFAULT '',
  parsed jsonb NOT NULL DEFAULT '{}',
  parse_status text NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending','parsed','failed','manual')),
  parse_error text,
  reviewed boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resumes_user_idx ON resumes(user_id);
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_resumes" ON resumes;
CREATE POLICY "select_own_resumes" ON resumes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_resumes" ON resumes;
CREATE POLICY "insert_own_resumes" ON resumes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_resumes" ON resumes;
CREATE POLICY "update_own_resumes" ON resumes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_resumes" ON resumes;
CREATE POLICY "delete_own_resumes" ON resumes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS answer_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (length(question) BETWEEN 2 AND 1000),
  answer text NOT NULL DEFAULT '' CHECK (length(answer) <= 10000),
  category text NOT NULL DEFAULT 'general',
  sensitive boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS answer_library_user_question_key ON answer_library(user_id, lower(question));
ALTER TABLE answer_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_answers" ON answer_library;
CREATE POLICY "select_own_answers" ON answer_library FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_answers" ON answer_library;
CREATE POLICY "insert_own_answers" ON answer_library FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_answers" ON answer_library;
CREATE POLICY "update_own_answers" ON answer_library FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_answers" ON answer_library;
CREATE POLICY "delete_own_answers" ON answer_library FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('greenhouse','lever','ashby','workday','test_ats')),
  board_token text NOT NULL CHECK (board_token ~ '^[A-Za-z0-9._-]{1,100}$'),
  company_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_error text,
  last_job_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, board_token)
);
ALTER TABLE job_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sources" ON job_sources;
CREATE POLICY "select_own_sources" ON job_sources FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sources" ON job_sources;
CREATE POLICY "insert_own_sources" ON job_sources FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sources" ON job_sources;
CREATE POLICY "update_own_sources" ON job_sources FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sources" ON job_sources;
CREATE POLICY "delete_own_sources" ON job_sources FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE UPDATE ON job_sources FROM authenticated;
GRANT UPDATE (company_name, active) ON job_sources TO authenticated;

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  board_token text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  location text NOT NULL DEFAULT '',
  work_arrangement text NOT NULL DEFAULT 'unknown',
  department text NOT NULL DEFAULT '',
  employment_type text NOT NULL DEFAULT '',
  seniority text NOT NULL DEFAULT '',
  salary_min int,
  salary_max int,
  salary_currency text,
  description text NOT NULL DEFAULT '',
  url text NOT NULL,
  apply_url text,
  questions jsonb NOT NULL DEFAULT '[]',
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
  posted_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, board_token, external_id)
);
CREATE INDEX IF NOT EXISTS jobs_dedupe_idx ON jobs(dedupe_key);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_source_idx ON jobs(provider, board_token);
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Public job postings: readable by any signed-in user, never writable through the API.
DROP POLICY IF EXISTS "authenticated_read_jobs" ON jobs;
CREATE POLICY "authenticated_read_jobs" ON jobs FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON jobs FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  score int NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  eligible boolean NOT NULL DEFAULT true,
  ineligible_reasons text[] NOT NULL DEFAULT '{}',
  breakdown jsonb NOT NULL DEFAULT '{}',
  explanation jsonb NOT NULL DEFAULT '{}',
  saved boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);
CREATE INDEX IF NOT EXISTS job_matches_user_score_idx ON job_matches(user_id, score DESC);
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_matches" ON job_matches;
CREATE POLICY "select_own_matches" ON job_matches FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_matches" ON job_matches;
CREATE POLICY "update_own_matches" ON job_matches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_matches" ON job_matches;
CREATE POLICY "delete_own_matches" ON job_matches FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE ON job_matches FROM anon, authenticated;
GRANT UPDATE (saved, dismissed) ON job_matches TO authenticated;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, coalesce(NEW.email, ''), coalesce(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO candidate_preferences (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
