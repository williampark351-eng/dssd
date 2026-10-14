/*
  # Tamper-proof packet edits and honest receipts

  ## What this changes
  1. `set_apply_mode` / `grant_auto_apply_consent`: write to the audit log's real columns (entity, details).
  2. `update_application_packet`: only answer text (and its source label) can be changed. Field names,
     required flags, option lists and sensitivity always come from the stored packet. Unknown fields and
     choices that are not one of the employer's options are rejected. Any prior approval is cleared.
  3. `application_action`:
     - `mark_manual_submitted` records evidence_level = user_reported.
     - `add_receipt` stores the confirmation the person pasted but keeps the application as Submitted;
       it is labelled "self-reported" and no longer counts as a verified receipt.

  ## Security
  - Functions remain SECURITY DEFINER with a fixed search_path, check auth.uid(), and are not callable by anon.
*/

CREATE OR REPLACE FUNCTION set_apply_mode(p_mode text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_mode NOT IN ('manual', 'assisted') THEN RAISE EXCEPTION 'Use the consent step to turn on auto-apply'; END IF;
  UPDATE auto_apply_consents SET revoked_at = now(), revoke_reason = 'mode_changed' WHERE user_id = v_uid AND revoked_at IS NULL;
  UPDATE candidate_preferences SET apply_mode = p_mode, auto_apply_consent_at = NULL WHERE user_id = v_uid;
  INSERT INTO audit_logs (user_id, actor_id, action, entity, details)
    VALUES (v_uid, v_uid, 'apply_mode.changed', 'candidate_preferences', jsonb_build_object('mode', p_mode));
  RETURN p_mode;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_apply_mode(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_apply_mode(text) TO authenticated;

CREATE OR REPLACE FUNCTION grant_auto_apply_consent(p_policy_version text, p_statements jsonb) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prefs candidate_preferences%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_policy_version IS DISTINCT FROM 'auto-apply-v1' THEN RAISE EXCEPTION 'The consent wording has changed. Reload the page and review it again.'; END IF;
  IF jsonb_typeof(p_statements) <> 'array' OR jsonb_array_length(p_statements) <> 4 THEN RAISE EXCEPTION 'Confirm every statement to continue'; END IF;
  SELECT * INTO v_prefs FROM candidate_preferences WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complete your preferences first'; END IF;
  UPDATE auto_apply_consents SET revoked_at = v_now, revoke_reason = 'superseded' WHERE user_id = v_uid AND revoked_at IS NULL;
  INSERT INTO auto_apply_consents (user_id, policy_version, statements, min_score, daily_quota, granted_at)
    VALUES (v_uid, p_policy_version, p_statements, v_prefs.auto_min_score, v_prefs.daily_quota, v_now);
  UPDATE candidate_preferences SET apply_mode = 'auto', auto_apply_consent_at = v_now WHERE user_id = v_uid;
  INSERT INTO audit_logs (user_id, actor_id, action, entity, details)
    VALUES (v_uid, v_uid, 'auto_apply.consent_granted', 'candidate_preferences',
      jsonb_build_object('policy_version', p_policy_version, 'min_score', v_prefs.auto_min_score, 'daily_quota', v_prefs.daily_quota));
  RETURN v_now;
END;
$$;
REVOKE EXECUTE ON FUNCTION grant_auto_apply_consent(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION grant_auto_apply_consent(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION update_application_packet(p_id uuid, p_cover_letter text, p_answers jsonb, p_resume_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app applications%ROWTYPE;
  v_pending int;
  v_new_state text;
  v_snapshot jsonb;
  v_answers jsonb;
  v_unknown int;
  v_bad_choice text;
BEGIN
  SELECT * INTO v_app FROM applications WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.state NOT IN ('READY_FOR_REVIEW','NEEDS_USER_ACTION') THEN
    RAISE EXCEPTION 'This application can no longer be edited';
  END IF;
  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) > 200 THEN RAISE EXCEPTION 'Invalid answers'; END IF;
  IF length(coalesce(p_cover_letter, '')) > 20000 THEN RAISE EXCEPTION 'Cover letter too long'; END IF;

  SELECT count(*) INTO v_unknown FROM jsonb_array_elements(p_answers) c
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_app.answers, '[]'::jsonb)) s WHERE s->>'field' = c->>'field');
  IF v_unknown > 0 THEN RAISE EXCEPTION 'This packet changed since you opened it. Reload and try again.'; END IF;

  SELECT coalesce(jsonb_agg(
    s || jsonb_build_object(
      'answer', left(coalesce(c->>'answer', s->>'answer', ''), 5000),
      'source', CASE WHEN c IS NULL THEN s->>'source'
                     WHEN coalesce(c->>'answer', '') IS DISTINCT FROM coalesce(s->>'answer', '')
                       THEN CASE WHEN c->>'source' = 'ai_draft' THEN 'ai_draft' ELSE 'user' END
                     ELSE s->>'source' END)
    ORDER BY ord), '[]'::jsonb)
  INTO v_answers
  FROM jsonb_array_elements(coalesce(v_app.answers, '[]'::jsonb)) WITH ORDINALITY AS t(s, ord)
  LEFT JOIN LATERAL (SELECT e AS c FROM jsonb_array_elements(p_answers) e WHERE e->>'field' = t.s->>'field' LIMIT 1) m ON true;

  SELECT e->>'question' INTO v_bad_choice FROM jsonb_array_elements(v_answers) e
  WHERE jsonb_typeof(e->'options') = 'array' AND jsonb_array_length(e->'options') > 0
    AND btrim(coalesce(e->>'answer', '')) <> ''
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e->'options') o WHERE o->>'label' = e->>'answer')
  LIMIT 1;
  IF v_bad_choice IS NOT NULL THEN RAISE EXCEPTION 'Pick one of the listed options for "%"', left(v_bad_choice, 120); END IF;

  IF p_resume_id IS NOT NULL THEN
    SELECT jsonb_build_object('id', id, 'name', name, 'parsed', parsed, 'file_path', file_path, 'file_name', file_name, 'reviewed', reviewed)
      INTO v_snapshot FROM resumes WHERE id = p_resume_id AND user_id = v_uid;
    IF v_snapshot IS NULL THEN RAISE EXCEPTION 'Resume not found'; END IF;
  END IF;

  SELECT count(*) INTO v_pending FROM jsonb_array_elements(v_answers) e
  WHERE coalesce((e->>'required')::boolean, false) AND btrim(coalesce(e->>'answer', '')) = '';

  v_new_state := v_app.state;
  IF v_app.state = 'NEEDS_USER_ACTION' AND v_app.required_action_kind = 'questions' AND v_pending = 0 THEN
    v_new_state := 'READY_FOR_REVIEW';
  END IF;

  UPDATE applications SET
    cover_letter = coalesce(p_cover_letter, ''),
    answers = v_answers,
    resume_id = coalesce(p_resume_id, resume_id),
    resume_snapshot = coalesce(v_snapshot, resume_snapshot),
    user_approved_at = NULL,
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

  PERFORM log_app_event(p_id, v_uid, v_app.state, v_to, 'user', 'Action: ' || p_action, jsonb_build_object('note', v_note));
  RETURN v_to;
END;
$$;
REVOKE EXECUTE ON FUNCTION application_action(uuid, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION application_action(uuid, text, jsonb) TO authenticated;