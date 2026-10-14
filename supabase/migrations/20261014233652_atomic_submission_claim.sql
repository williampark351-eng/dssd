/*
  # Atomic, re-validated submission claim

  ## What this changes
  Before the background worker sends an application to an employer, it must now call
  `claim_application_for_submit`. In one locked step the database re-checks every safety rule using the
  latest data (not what was true when the item was queued) and, only if all pass, moves it to SUBMITTING.

  ## New columns
  - `applications.submission_attempt_id` (uuid) - id of the in-flight send attempt, so a late or
    duplicate worker cannot overwrite a newer outcome.

  ## Checks performed at claim time
  1. Automation not paused.
  2. Listing still active; company not on the excluded list.
  3. No other submitted or in-flight application to the same role (by dedupe key).
  4. Daily automated-submission limit, counting both sent and in-flight items.
     The user's preferences row is locked so two workers cannot both take the last slot.
  5. A resume file is attached to the packet and every required answer is filled.
  6. For auto-apply (no explicit approval): auto mode on, an active consent whose limits are at least as
     strict as the current ones, a match computed after the criteria last changed, still eligible, score at
     or above the minimum, reviewed resume, and no sensitive answers.

  ## Also
  - `application_action` re-created to keep writing to the audit log.

  ## Security
  - `claim_application_for_submit` can only be executed by the service role (the worker), not by users.
*/

ALTER TABLE applications ADD COLUMN IF NOT EXISTS submission_attempt_id uuid;

CREATE OR REPLACE FUNCTION claim_application_for_submit(p_app uuid, p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app applications%ROWTYPE;
  v_job jobs%ROWTYPE;
  v_prefs candidate_preferences%ROWTYPE;
  v_match job_matches%ROWTYPE;
  v_consent auto_apply_consents%ROWTYPE;
  v_count int;
  v_attempt uuid := gen_random_uuid();
  v_approved boolean;
  v_reason text;
  v_outcome text;
BEGIN
  SELECT * INTO v_prefs FROM candidate_preferences WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'skip', 'reason', 'No preferences'); END IF;
  SELECT * INTO v_app FROM applications WHERE id = p_app AND user_id = p_user FOR UPDATE;
  IF NOT FOUND OR v_app.state <> 'QUEUED' THEN RETURN jsonb_build_object('result', 'skip', 'reason', 'Not queued'); END IF;
  SELECT * INTO v_job FROM jobs WHERE id = v_app.job_id;

  IF v_prefs.automation_paused THEN RETURN jsonb_build_object('result', 'skip', 'reason', 'Paused'); END IF;

  IF v_job.status IS DISTINCT FROM 'active' THEN
    v_outcome := 'BLOCKED'; v_reason := 'This listing has expired or was removed by the employer.';
  ELSIF EXISTS (SELECT 1 FROM unnest(coalesce(v_prefs.excluded_companies, '{}')) c WHERE lower(btrim(c)) = lower(btrim(v_job.company))) THEN
    v_outcome := 'BLOCKED'; v_reason := 'This company is on your excluded list.';
  ELSIF EXISTS (
    SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id
    WHERE a.user_id = p_user AND a.id <> v_app.id AND j.dedupe_key = v_job.dedupe_key
      AND (a.submitted_at IS NOT NULL OR a.state IN ('SUBMITTING', 'UNKNOWN_SUBMISSION_RESULT'))
  ) THEN
    v_outcome := 'BLOCKED'; v_reason := 'You already applied to this role through another listing.';
  ELSIF coalesce(v_app.resume_snapshot->>'file_path', '') = '' THEN
    v_outcome := 'NEEDS_USER_ACTION'; v_reason := 'The resume file for this packet is missing. Choose a resume with an uploaded file, then approve again.';
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_app.answers, '[]')) e
                WHERE coalesce((e->>'required')::boolean, false) AND btrim(coalesce(e->>'answer', '')) = '') THEN
    v_outcome := 'NEEDS_USER_ACTION'; v_reason := 'Some required questions are unanswered.';
  END IF;

  v_approved := v_app.user_approved_at IS NOT NULL;
  IF v_outcome IS NULL AND NOT v_approved THEN
    SELECT * INTO v_consent FROM auto_apply_consents
      WHERE user_id = p_user AND revoked_at IS NULL ORDER BY granted_at DESC LIMIT 1;
    SELECT * INTO v_match FROM job_matches WHERE user_id = p_user AND job_id = v_app.job_id;
    IF v_app.mode <> 'auto' OR v_prefs.apply_mode <> 'auto' OR v_consent.id IS NULL
       OR v_consent.min_score > v_prefs.auto_min_score OR v_consent.daily_quota < v_prefs.daily_quota THEN
      v_reason := 'Auto-apply is no longer active for your account. Review and approve this one yourself.';
    ELSIF v_match.id IS NULL OR v_match.computed_at < v_prefs.criteria_changed_at THEN
      v_reason := 'Your job criteria changed after this was queued. Review it before it is sent.';
    ELSIF v_match.eligible IS NOT TRUE OR v_match.score < v_prefs.auto_min_score THEN
      v_reason := format('This job no longer meets your auto-apply criteria (score %s, minimum %s).', coalesce(v_match.score, 0), v_prefs.auto_min_score);
    ELSIF coalesce((v_app.resume_snapshot->>'reviewed')::boolean, false) IS NOT TRUE THEN
      v_reason := 'The selected resume has not been reviewed.';
    ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_app.answers, '[]')) e
                  WHERE coalesce((e->>'sensitive')::boolean, false) AND btrim(coalesce(e->>'answer', '')) <> '') THEN
      v_reason := 'This application includes sensitive answers you must confirm yourself.';
    END IF;
    IF v_reason IS NOT NULL THEN v_outcome := 'READY_FOR_REVIEW'; END IF;
  END IF;

  IF v_outcome IS NULL THEN
    SELECT count(*) INTO v_count FROM applications
    WHERE user_id = p_user AND (
      (submission_method = 'provider_api' AND submitted_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
      OR state = 'SUBMITTING');
    IF v_count >= v_prefs.daily_quota THEN
      UPDATE applications SET next_attempt_at = (date_trunc('day', now() AT TIME ZONE 'utc') + interval '1 day') AT TIME ZONE 'utc',
        required_action = format('Daily limit of %s reached. This will continue tomorrow.', v_prefs.daily_quota), updated_at = now()
      WHERE id = p_app;
      PERFORM log_app_event(p_app, p_user, 'QUEUED', 'QUEUED', 'worker', 'Daily submission limit reached');
      RETURN jsonb_build_object('result', 'deferred');
    END IF;

    UPDATE applications SET state = 'SUBMITTING', submission_attempt_id = v_attempt, attempts = coalesce(attempts, 0) + 1,
      last_error = NULL, required_action = NULL, required_action_kind = NULL, updated_at = now()
    WHERE id = p_app;
    PERFORM log_app_event(p_app, p_user, 'QUEUED', 'SUBMITTING', 'worker', 'Re-checked and claimed for submission',
      jsonb_build_object('attempt_id', v_attempt, 'approved_by_user', v_approved));
    RETURN jsonb_build_object('result', 'claimed', 'attempt_id', v_attempt);
  END IF;

  UPDATE applications SET state = v_outcome,
    user_approved_at = CASE WHEN v_outcome = 'BLOCKED' THEN user_approved_at ELSE NULL END,
    last_error = CASE WHEN v_outcome = 'BLOCKED' THEN v_reason ELSE last_error END,
    required_action = CASE WHEN v_outcome = 'BLOCKED' THEN NULL ELSE v_reason END,
    required_action_kind = CASE v_outcome WHEN 'READY_FOR_REVIEW' THEN 'review' WHEN 'NEEDS_USER_ACTION' THEN
      CASE WHEN v_reason LIKE 'Some required%' THEN 'questions' ELSE 'resume' END ELSE NULL END,
    updated_at = now()
  WHERE id = p_app;
  PERFORM log_app_event(p_app, p_user, 'QUEUED', v_outcome, 'worker', v_reason);
  RETURN jsonb_build_object('result', 'rejected', 'state', v_outcome, 'reason', v_reason);
END;
$$;
REVOKE EXECUTE ON FUNCTION claim_application_for_submit(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_application_for_submit(uuid, uuid) TO service_role;

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
      evidence_level = 'user_reported',
      receipt_id = nullif(v_ref, ''),
      confirmation_evidence = jsonb_build_object('type', 'user_attested', 'note', v_note, 'reference', v_ref, 'recorded_at', now()),
      required_action = NULL, required_action_kind = NULL, last_error = NULL, updated_at = now()
    WHERE id = p_id;

  ELSIF p_action = 'add_receipt' THEN
    IF v_app.state NOT IN ('SUBMITTED','CONFIRMED') THEN RAISE EXCEPTION 'Only submitted applications can have a receipt'; END IF;
    IF length(btrim(v_note)) < 10 THEN RAISE EXCEPTION 'Paste the employer confirmation text (at least 10 characters)'; END IF;
    v_to := v_app.state;
    UPDATE applications SET receipt_id = coalesce(nullif(v_ref, ''), receipt_id),
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