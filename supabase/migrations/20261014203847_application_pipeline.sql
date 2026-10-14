/*
# Application pipeline

1. New Tables
- `applications` - one per user+job. Holds state, mode, the exact resume snapshot, cover letter and answers used,
  submission method, receipts/evidence, employer response, errors and required user actions.
- `application_events` - immutable timeline of every state change and worker step.
- `audit_logs` - user-visible audit trail of sensitive actions.
- `notifications` - in-app notifications produced by backend workers.

2. Security
- RLS enabled; users only see their own rows.
- Users cannot insert or update applications directly. All changes go through checked functions:
  `queue_applications`, `update_application_packet`, `application_action`. Only backend workers can set
  SUBMITTING / SUBMITTED-by-provider / CONFIRMED-by-provider states.
- Duplicate submissions blocked by UNIQUE(user_id, job_id) plus cross-provider duplicate detection.

3. Notes
1. UNKNOWN_SUBMISSION_RESULT cannot be re-queued, preventing accidental double submission.
2. User-reported submissions are labelled `manual_user_reported` and never shown as provider-verified.
*/

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  match_id uuid REFERENCES job_matches(id) ON DELETE SET NULL,
  match_score int NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('DISCOVERED','MATCHED','QUEUED','PREPARING','READY_FOR_REVIEW','SUBMITTING','SUBMITTED','CONFIRMED','NEEDS_USER_ACTION','BLOCKED','FAILED','CANCELLED','UNKNOWN_SUBMISSION_RESULT')),
  mode text NOT NULL DEFAULT 'assisted' CHECK (mode IN ('manual','assisted','auto')),
  resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  resume_snapshot jsonb,
  tailoring_notes jsonb NOT NULL DEFAULT '[]',
  cover_letter text NOT NULL DEFAULT '',
  answers jsonb NOT NULL DEFAULT '[]',
  prepared_at timestamptz,
  user_approved_at timestamptz,
  submission_method text CHECK (submission_method IN ('provider_api','test_ats','manual_user_reported')),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  receipt_id text,
  confirmation_evidence jsonb NOT NULL DEFAULT '{}',
  employer_response text NOT NULL DEFAULT 'none' CHECK (employer_response IN ('none','acknowledged','interview','rejected','offer','withdrawn','other')),
  employer_response_at timestamptz,
  employer_response_note text NOT NULL DEFAULT '',
  required_action text,
  required_action_kind text,
  last_error text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);
CREATE INDEX IF NOT EXISTS applications_user_state_idx ON applications(user_id, state);
CREATE INDEX IF NOT EXISTS applications_submitted_idx ON applications(user_id, submitted_at);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_applications" ON applications;
CREATE POLICY "select_own_applications" ON applications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_applications" ON applications;
CREATE POLICY "delete_own_applications" ON applications FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE ON applications FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_state text,
  to_state text,
  actor text NOT NULL DEFAULT 'system',
  message text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_events_app_idx ON application_events(application_id, created_at);
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_app_events" ON application_events;
CREATE POLICY "select_own_app_events" ON application_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON application_events FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid DEFAULT auth.uid(),
  action text NOT NULL,
  entity text NOT NULL DEFAULT '',
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id, created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_audit" ON audit_logs;
CREATE POLICY "select_own_audit" ON audit_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_audit" ON audit_logs;
CREATE POLICY "insert_own_audit" ON audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND auth.uid() = actor_id);
REVOKE UPDATE, DELETE ON audit_logs FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE ON notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;

CREATE OR REPLACE FUNCTION log_app_event(p_app uuid, p_user uuid, p_from text, p_to text, p_actor text, p_msg text, p_data jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO application_events (application_id, user_id, from_state, to_state, actor, message, data)
  VALUES (p_app, p_user, p_from, p_to, p_actor, p_msg, coalesce(p_data, '{}'));
$$;
REVOKE EXECUTE ON FUNCTION log_app_event(uuid, uuid, text, text, text, text, jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION queue_applications(p_job_ids uuid[], p_mode text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prefs candidate_preferences%ROWTYPE;
  v_job jobs%ROWTYPE;
  v_id uuid;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_mode NOT IN ('manual','assisted','auto') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  IF coalesce(array_length(p_job_ids, 1), 0) = 0 OR array_length(p_job_ids, 1) > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 jobs';
  END IF;
  SELECT * INTO v_prefs FROM candidate_preferences WHERE user_id = v_uid;
  IF p_mode = 'auto' AND (v_prefs.auto_apply_consent_at IS NULL OR v_prefs.apply_mode <> 'auto') THEN
    RAISE EXCEPTION 'Auto-apply requires explicit consent in Auto-Apply settings';
  END IF;

  FOR v_job IN SELECT * FROM jobs WHERE id = ANY(p_job_ids) AND status = 'active' LOOP
    IF EXISTS (SELECT 1 FROM unnest(v_prefs.excluded_companies) x WHERE lower(x) = lower(v_job.company)) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = v_uid AND j.dedupe_key = v_job.dedupe_key AND a.state <> 'CANCELLED'
    ) THEN
      CONTINUE;
    END IF;
    v_id := NULL;
    INSERT INTO applications (user_id, job_id, match_id, match_score, state, mode)
    SELECT v_uid, v_job.id, m.id, coalesce(m.score, 0), 'QUEUED', p_mode
    FROM (SELECT 1) s LEFT JOIN job_matches m ON m.user_id = v_uid AND m.job_id = v_job.id
    ON CONFLICT (user_id, job_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_count := v_count + 1;
      PERFORM log_app_event(v_id, v_uid, NULL, 'QUEUED', 'user', 'Added to application queue (' || p_mode || ' mode)');
    END IF;
  END LOOP;

  INSERT INTO audit_logs (user_id, actor_id, action, entity, details)
  VALUES (v_uid, v_uid, 'applications.queued', 'applications', jsonb_build_object('count', v_count, 'mode', p_mode));
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION queue_applications(uuid[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION queue_applications(uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION update_application_packet(p_id uuid, p_cover_letter text, p_answers jsonb, p_resume_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app applications%ROWTYPE;
  v_pending int;
  v_new_state text;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO v_app FROM applications WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.state NOT IN ('READY_FOR_REVIEW','NEEDS_USER_ACTION') THEN
    RAISE EXCEPTION 'This application can no longer be edited';
  END IF;
  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) > 200 THEN RAISE EXCEPTION 'Invalid answers'; END IF;
  IF length(coalesce(p_cover_letter, '')) > 20000 THEN RAISE EXCEPTION 'Cover letter too long'; END IF;

  IF p_resume_id IS NOT NULL THEN
    SELECT jsonb_build_object('id', id, 'name', name, 'parsed', parsed, 'file_path', file_path, 'file_name', file_name)
      INTO v_snapshot FROM resumes WHERE id = p_resume_id AND user_id = v_uid;
    IF v_snapshot IS NULL THEN RAISE EXCEPTION 'Resume not found'; END IF;
  END IF;

  SELECT count(*) INTO v_pending FROM jsonb_array_elements(p_answers) e
  WHERE coalesce((e->>'required')::boolean, false) AND btrim(coalesce(e->>'answer', '')) = '';

  v_new_state := v_app.state;
  IF v_app.state = 'NEEDS_USER_ACTION' AND v_app.required_action_kind = 'questions' AND v_pending = 0 THEN
    v_new_state := 'READY_FOR_REVIEW';
  END IF;

  UPDATE applications SET
    cover_letter = coalesce(p_cover_letter, ''),
    answers = p_answers,
    resume_id = coalesce(p_resume_id, resume_id),
    resume_snapshot = coalesce(v_snapshot, resume_snapshot),
    state = v_new_state,
    required_action = CASE WHEN v_new_state = 'READY_FOR_REVIEW' THEN NULL ELSE required_action END,
    required_action_kind = CASE WHEN v_new_state = 'READY_FOR_REVIEW' THEN NULL ELSE required_action_kind END,
    updated_at = now()
  WHERE id = p_id;

  PERFORM log_app_event(p_id, v_uid, v_app.state, v_new_state, 'user', 'Application packet edited', jsonb_build_object('pending_required', v_pending));
  RETURN v_new_state;
END;
$$;
REVOKE EXECUTE ON FUNCTION update_application_packet(uuid, text, jsonb, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_application_packet(uuid, text, jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION application_action(p_id uuid, p_action text, p_payload jsonb DEFAULT '{}')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app applications%ROWTYPE;
  v_to text;
  v_note text := left(coalesce(p_payload->>'note', ''), 2000);
  v_ref text := left(coalesce(p_payload->>'reference', ''), 500);
BEGIN
  SELECT * INTO v_app FROM applications WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  IF p_action = 'approve' THEN
    IF v_app.state <> 'READY_FOR_REVIEW' THEN RAISE EXCEPTION 'Only applications ready for review can be approved'; END IF;
    v_to := 'QUEUED';
    UPDATE applications SET state = v_to, user_approved_at = now(), updated_at = now(), next_attempt_at = NULL WHERE id = p_id;

  ELSIF p_action = 'cancel' THEN
    IF v_app.state IN ('SUBMITTING','SUBMITTED','CONFIRMED','CANCELLED') THEN RAISE EXCEPTION 'This application cannot be cancelled'; END IF;
    v_to := 'CANCELLED';
    UPDATE applications SET state = v_to, updated_at = now() WHERE id = p_id;

  ELSIF p_action = 'requeue' THEN
    IF v_app.state NOT IN ('FAILED','BLOCKED','CANCELLED','NEEDS_USER_ACTION') THEN RAISE EXCEPTION 'This application cannot be re-queued'; END IF;
    IF v_app.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Already submitted'; END IF;
    v_to := 'QUEUED';
    UPDATE applications SET state = v_to, user_approved_at = NULL, last_error = NULL, required_action = NULL,
      required_action_kind = NULL, attempts = 0, next_attempt_at = NULL, updated_at = now() WHERE id = p_id;

  ELSIF p_action = 'mark_manual_submitted' THEN
    IF v_app.state NOT IN ('READY_FOR_REVIEW','NEEDS_USER_ACTION','UNKNOWN_SUBMISSION_RESULT','BLOCKED','FAILED') THEN
      RAISE EXCEPTION 'This application cannot be marked as submitted';
    END IF;
    IF coalesce((p_payload->>'attested')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'You must confirm that you completed the submission yourself';
    END IF;
    v_to := 'SUBMITTED';
    UPDATE applications SET state = v_to, submission_method = 'manual_user_reported', submitted_at = now(),
      receipt_id = nullif(v_ref, ''),
      confirmation_evidence = jsonb_build_object('type', 'user_attested', 'note', v_note, 'reference', v_ref, 'recorded_at', now()),
      required_action = NULL, required_action_kind = NULL, last_error = NULL, updated_at = now()
    WHERE id = p_id;

  ELSIF p_action = 'add_receipt' THEN
    IF v_app.state <> 'SUBMITTED' THEN RAISE EXCEPTION 'Only submitted applications can be confirmed'; END IF;
    IF length(btrim(v_note)) < 10 THEN RAISE EXCEPTION 'Paste the employer confirmation text (at least 10 characters)'; END IF;
    v_to := 'CONFIRMED';
    UPDATE applications SET state = v_to, confirmed_at = now(), receipt_id = coalesce(nullif(v_ref, ''), receipt_id),
      confirmation_evidence = confirmation_evidence || jsonb_build_object('employer_receipt', jsonb_build_object(
        'type', 'employer_receipt_user_provided', 'text', v_note, 'reference', v_ref, 'recorded_at', now())),
      updated_at = now()
    WHERE id = p_id;

  ELSIF p_action = 'record_response' THEN
    IF v_app.state NOT IN ('SUBMITTED','CONFIRMED') THEN RAISE EXCEPTION 'Responses can only be recorded for submitted applications'; END IF;
    IF coalesce(p_payload->>'response', '') NOT IN ('acknowledged','interview','rejected','offer','withdrawn','other','none') THEN
      RAISE EXCEPTION 'Invalid response';
    END IF;
    v_to := v_app.state;
    UPDATE applications SET employer_response = p_payload->>'response', employer_response_note = v_note,
      employer_response_at = CASE WHEN p_payload->>'response' = 'none' THEN NULL ELSE now() END, updated_at = now()
    WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  PERFORM log_app_event(p_id, v_uid, v_app.state, v_to, 'user', 'User action: ' || p_action,
    jsonb_build_object('note', v_note, 'reference', v_ref, 'response', p_payload->>'response'));
  INSERT INTO audit_logs (user_id, actor_id, action, entity, entity_id, details)
  VALUES (v_uid, v_uid, 'application.' || p_action, 'applications', p_id, jsonb_build_object('from', v_app.state, 'to', v_to));
  RETURN v_to;
END;
$$;
REVOKE EXECUTE ON FUNCTION application_action(uuid, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION application_action(uuid, text, jsonb) TO authenticated;
