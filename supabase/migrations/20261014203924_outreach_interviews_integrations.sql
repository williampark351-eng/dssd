/*
# Outreach, interviews and integration infrastructure

1. New Tables
- `contacts` - hiring managers/recruiters the candidate added (with source and opt-out flag)
- `outreach_messages` - personalized follow-ups linked to an application and contact; draft -> approved -> sent -> replied
- `interviews` - interview stages linked to an application
- `provider_credentials` - employer-authorized ATS API keys (server-only, no API access)
- `test_ats_submissions` - receipts stored by the controlled test ATS used to exercise the submission flow safely

2. Security
- RLS on all tables. Contacts/outreach/interviews owner-scoped and may only link to the user's own applications.
- provider_credentials and test_ats_submissions have RLS enabled with no policies: only backend services can read them.
- A trigger blocks outreach to opted-out contacts, requires approval before marking sent, and requires the
  linked application to be submitted or confirmed.
*/

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company text NOT NULL DEFAULT '',
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  title text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  linkedin_url text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'user_entered' CHECK (source IN ('user_entered','job_posting','referral','career_center')),
  opted_out boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_key ON contacts(user_id, lower(email)) WHERE email <> '';
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_contacts" ON contacts;
CREATE POLICY "select_own_contacts" ON contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_contacts" ON contacts;
CREATE POLICY "insert_own_contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_contacts" ON contacts;
CREATE POLICY "update_own_contacts" ON contacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_contacts" ON contacts;
CREATE POLICY "delete_own_contacts" ON contacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','linkedin','other')),
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 10000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','replied','cancelled')),
  approved_at timestamptz,
  sent_at timestamptz,
  scheduled_for timestamptz,
  replied_at timestamptz,
  reply_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, contact_id)
);
CREATE INDEX IF NOT EXISTS outreach_user_idx ON outreach_messages(user_id, status);
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_outreach" ON outreach_messages;
CREATE POLICY "select_own_outreach" ON outreach_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_outreach" ON outreach_messages;
CREATE POLICY "insert_own_outreach" ON outreach_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
DROP POLICY IF EXISTS "update_own_outreach" ON outreach_messages;
CREATE POLICY "update_own_outreach" ON outreach_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
DROP POLICY IF EXISTS "delete_own_outreach" ON outreach_messages;
CREATE POLICY "delete_own_outreach" ON outreach_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION outreach_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_state text; v_opted boolean;
BEGIN
  SELECT state INTO v_state FROM applications WHERE id = NEW.application_id;
  IF v_state NOT IN ('SUBMITTED','CONFIRMED') THEN
    RAISE EXCEPTION 'Outreach is only available after an application is submitted';
  END IF;
  SELECT opted_out INTO v_opted FROM contacts WHERE id = NEW.contact_id;
  IF v_opted AND NEW.status IN ('draft','approved','sent') THEN
    RAISE EXCEPTION 'This contact has opted out of messages';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  IF NEW.status = 'sent' THEN
    IF NEW.approved_at IS NULL THEN RAISE EXCEPTION 'Messages must be approved before sending'; END IF;
    IF NEW.sent_at IS NULL THEN NEW.sent_at := now(); END IF;
  END IF;
  IF NEW.status = 'replied' AND NEW.replied_at IS NULL THEN NEW.replied_at := now(); END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('sent','replied') AND NEW.status IN ('draft','approved') THEN
    RAISE EXCEPTION 'A sent message cannot be moved back to draft';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION outreach_guard() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS outreach_guard_trg ON outreach_messages;
CREATE TRIGGER outreach_guard_trg BEFORE INSERT OR UPDATE ON outreach_messages FOR EACH ROW EXECUTE FUNCTION outreach_guard();

CREATE TABLE IF NOT EXISTS interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'Phone screen',
  scheduled_at timestamptz,
  format text NOT NULL DEFAULT 'video' CHECK (format IN ('phone','video','onsite','take_home','other')),
  interviewer text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'scheduled' CHECK (outcome IN ('requested','scheduled','completed','advanced','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interviews_user_idx ON interviews(user_id, scheduled_at);
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_interviews" ON interviews;
CREATE POLICY "select_own_interviews" ON interviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_interviews" ON interviews;
CREATE POLICY "insert_own_interviews" ON interviews FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_interviews" ON interviews;
CREATE POLICY "update_own_interviews" ON interviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_own_interviews" ON interviews;
CREATE POLICY "delete_own_interviews" ON interviews FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('greenhouse','lever','ashby','workday')),
  board_token text NOT NULL,
  api_key text NOT NULL,
  authorized_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, board_token)
);
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON provider_credentials FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS test_ats_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id text NOT NULL UNIQUE,
  job_external_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  applicant_email text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE test_ats_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON test_ats_submissions FROM anon, authenticated;
