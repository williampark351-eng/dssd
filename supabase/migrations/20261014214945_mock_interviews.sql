/*
# Mock interview practice sessions

1. New Tables
- `mock_interviews` - one practice interview session for a candidate
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `application_id` (uuid, optional link to the application being practiced for; cleared if the application is deleted)
  - `resume_id` (uuid, optional resume the questions were based on; cleared if the resume is deleted)
  - `role_title`, `company`, `job_description` (text, context for the interview)
  - `answer_language` (text, language the candidate answers in; default 'en')
  - `translate_to` (text, optional language for live translation of answers)
  - `questions` (jsonb array of {question, focus})
  - `turns` (jsonb array of answered questions with transcript, translation, detected tone and AI feedback)
  - `status` ('in_progress' or 'completed')
  - `created_at`, `updated_at`

2. Security
- RLS enabled; owners can select, insert, update and delete only their own sessions.

3. Notes
1. Practice data is private to the candidate; advisors and organizations cannot read it.
2. Rows are removed automatically when the account is deleted.
*/

CREATE TABLE IF NOT EXISTS mock_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  role_title text NOT NULL DEFAULT '' CHECK (char_length(role_title) <= 300),
  company text NOT NULL DEFAULT '' CHECK (char_length(company) <= 200),
  job_description text NOT NULL DEFAULT '' CHECK (char_length(job_description) <= 20000),
  answer_language text NOT NULL DEFAULT 'en' CHECK (char_length(answer_language) <= 10),
  translate_to text CHECK (translate_to IS NULL OR char_length(translate_to) <= 10),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mock_interviews_user_idx ON mock_interviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mock_interviews_application_idx ON mock_interviews(application_id);

ALTER TABLE mock_interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_mock_interviews" ON mock_interviews;
CREATE POLICY "select_own_mock_interviews" ON mock_interviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_mock_interviews" ON mock_interviews;
CREATE POLICY "insert_own_mock_interviews" ON mock_interviews FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (application_id IS NULL OR EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.user_id = auth.uid()))
  AND (resume_id IS NULL OR EXISTS (SELECT 1 FROM resumes r WHERE r.id = resume_id AND r.user_id = auth.uid()))
);
DROP POLICY IF EXISTS "update_own_mock_interviews" ON mock_interviews;
CREATE POLICY "update_own_mock_interviews" ON mock_interviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND (application_id IS NULL OR EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.user_id = auth.uid()))
  AND (resume_id IS NULL OR EXISTS (SELECT 1 FROM resumes r WHERE r.id = resume_id AND r.user_id = auth.uid()))
);
DROP POLICY IF EXISTS "delete_own_mock_interviews" ON mock_interviews;
CREATE POLICY "delete_own_mock_interviews" ON mock_interviews FOR DELETE TO authenticated USING (auth.uid() = user_id);
