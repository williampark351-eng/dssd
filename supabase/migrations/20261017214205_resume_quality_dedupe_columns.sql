/*
# Resume Studio upgrade: quality scoring, deduplication, and source tracking

1. Modified Tables
- `resumes` gets five new optional columns (no existing column is changed or removed):
  - `file_hash` (text) — a fingerprint of the uploaded file's contents. Two uploads of
    the exact same file produce the same value, so the app can warn
    "you already uploaded this exact file" instead of silently creating a duplicate.
  - `dup_of_resume_id` (uuid, nullable) — when a duplicate is detected, points at the
    earlier resume it matches, so the UI can offer to remove the copy or keep both.
  - `quality` (jsonb) — the result of a rule-based "ATS-style" readiness check:
    { score (0-100), grade ("excellent" | "good" | "fair" | "poor"), checks: [...] }
    where each check names one criterion (contact info, experience with dates,
    quantified achievements, skills section, education) and whether it passed.
  - `quality_at` (timestamptz) — when the quality check last ran.
  - `source_kind` (text, default 'file') — where the resume came from:
    'file' (single upload), 'zip' (bulk upload), or 'text' (pasted).

2. Security
- No policy changes: `resumes` already has owner-scoped RLS for the authenticated role.
  The new columns inherit the existing SELECT/INSERT/UPDATE/DELETE owner policies.
- One UNIQUE partial index: a user can have only one resume per identical file
  fingerprint. This makes duplicate protection a database guarantee, not just UI logic.

3. Notes
- All additions are nullable or defaulted, so existing resume rows keep working and no
  data is touched.
- The quality score is a structural readability/formatting check computed from rules,
  not a verdict on the person's qualifications.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='file_hash') THEN
    ALTER TABLE resumes ADD COLUMN file_hash text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='dup_of_resume_id') THEN
    ALTER TABLE resumes ADD COLUMN dup_of_resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='quality') THEN
    ALTER TABLE resumes ADD COLUMN quality jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='quality_at') THEN
    ALTER TABLE resumes ADD COLUMN quality_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='source_kind') THEN
    ALTER TABLE resumes ADD COLUMN source_kind text NOT NULL DEFAULT 'file';
  END IF;
END $$;

-- One resume per identical file per user; partial so NULL hashes (pasted text) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS resumes_user_file_hash_key
  ON resumes (user_id, file_hash)
  WHERE file_hash IS NOT NULL;

-- Common lookups
CREATE INDEX IF NOT EXISTS resumes_user_source_idx ON resumes(user_id, source_kind);
