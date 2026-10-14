/*
  # Submission safety: server-controlled consent and truthful evidence

  ## What this changes, in plain English
  1. Turning auto-apply on or off can now only happen through two server functions.
     The browser can no longer flip the mode or forge a consent timestamp directly.
     Every grant is stored with the consent wording version and the score/daily limits the person agreed to.
  2. Loosening the agreed limits (lowering the minimum score or raising the daily cap) automatically
     withdraws auto-apply consent, so the person must agree again.
  3. Changing job-matching preferences records `criteria_changed_at`; the application worker refuses to
     auto-submit until matches have been recomputed after that moment.
  4. Applications get an `evidence_level` that separates self-reported submissions from ones an employer
     system actually accepted. A pasted confirmation email no longer upgrades an application to "Confirmed".
  5. Editing a packet can only change answer text. Field names, required flags, options and sensitivity
     always come from the stored packet, and choices must be one of the employer's options.

  ## New tables
  - `auto_apply_consents`: id, user_id, policy_version, statements (jsonb), min_score, daily_quota,
    granted_at, revoked_at, revoke_reason. Append-only history; written only by server functions.

  ## Modified tables
  - `candidate_preferences`: new `criteria_changed_at` (timestamptz). `apply_mode`, `auto_apply_consent_at`
    and `criteria_changed_at` are no longer writable by signed-in users directly.
  - `applications`: new `evidence_level` text (none | user_reported | provider_accepted | receipt_verified |
    employer_response_verified).

  ## Security
  - RLS enabled on `auto_apply_consents`; owners can read their own history; no client writes.
  - Column privileges on `candidate_preferences` narrowed to user-editable fields.
  - New SECURITY DEFINER functions `set_apply_mode`, `grant_auto_apply_consent` check auth.uid().

  ## Notes
  1. No data is removed. Existing rows are backfilled with the matching evidence level.
*/

CREATE TABLE IF NOT EXISTS auto_apply_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  statements jsonb NOT NULL DEFAULT '[]',
  min_score int NOT NULL,
  daily_quota int NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text
);
CREATE INDEX IF NOT EXISTS auto_apply_consents_user_idx ON auto_apply_consents (user_id, granted_at DESC);
ALTER TABLE auto_apply_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_consents" ON auto_apply_consents;
CREATE POLICY "select_own_consents" ON auto_apply_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON auto_apply_consents FROM authenticated, anon;

ALTER TABLE candidate_preferences ADD COLUMN IF NOT EXISTS criteria_changed_at timestamptz NOT NULL DEFAULT now();

REVOKE INSERT, UPDATE ON candidate_preferences FROM authenticated;
GRANT INSERT (user_id, target_titles, locations, work_arrangements, seniority_levels, employment_types, industries, keywords,
  excluded_companies, min_salary, salary_currency, weights, auto_min_score, daily_quota, generate_cover_letters,
  automation_paused, feed_read_at, watch_words, watch_notify, updated_at) ON candidate_preferences TO authenticated;
GRANT UPDATE (target_titles, locations, work_arrangements, seniority_levels, employment_types, industries, keywords,
  excluded_companies, min_salary, salary_currency, weights, auto_min_score, daily_quota, generate_cover_letters,
  automation_paused, feed_read_at, watch_words, watch_notify, updated_at) ON candidate_preferences TO authenticated;

CREATE OR REPLACE FUNCTION guard_candidate_preferences() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_consent auto_apply_consents%ROWTYPE;
BEGIN
  IF (NEW.target_titles, NEW.locations, NEW.work_arrangements, NEW.seniority_levels, NEW.employment_types, NEW.industries,
      NEW.keywords, NEW.excluded_companies, NEW.min_salary, NEW.salary_currency, NEW.weights)
     IS DISTINCT FROM
     (OLD.target_titles, OLD.locations, OLD.work_arrangements, OLD.seniority_levels, OLD.employment_types, OLD.industries,
      OLD.keywords, OLD.excluded_companies, OLD.min_salary, OLD.salary_currency, OLD.weights) THEN
    NEW.criteria_changed_at := now();
  END IF;

  IF NEW.apply_mode = 'auto' THEN
    SELECT * INTO v_consent FROM auto_apply_consents
      WHERE user_id = NEW.user_id AND revoked_at IS NULL ORDER BY granted_at DESC LIMIT 1;
    IF NOT FOUND OR NEW.auto_min_score < v_consent.min_score OR NEW.daily_quota > v_consent.daily_quota THEN
      UPDATE auto_apply_consents SET revoked_at = now(),
        revoke_reason = CASE WHEN v_consent.id IS NULL THEN 'missing' ELSE 'limits_loosened' END
        WHERE user_id = NEW.user_id AND revoked_at IS NULL;
      NEW.apply_mode := 'assisted';
      NEW.auto_apply_consent_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION guard_candidate_preferences() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS candidate_preferences_guard ON candidate_preferences;
CREATE TRIGGER candidate_preferences_guard BEFORE UPDATE ON candidate_preferences
  FOR EACH ROW EXECUTE FUNCTION guard_candidate_preferences();

CREATE OR REPLACE FUNCTION set_apply_mode(p_mode text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_mode NOT IN ('manual', 'assisted') THEN RAISE EXCEPTION 'Use the consent step to turn on auto-apply'; END IF;
  UPDATE auto_apply_consents SET revoked_at = now(), revoke_reason = 'mode_changed' WHERE user_id = v_uid AND revoked_at IS NULL;
  UPDATE candidate_preferences SET apply_mode = p_mode, auto_apply_consent_at = NULL WHERE user_id = v_uid;
  INSERT INTO audit_logs (user_id, actor_id, action, entity_type, metadata)
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
  INSERT INTO audit_logs (user_id, actor_id, action, entity_type, metadata)
    VALUES (v_uid, v_uid, 'auto_apply.consent_granted', 'candidate_preferences',
      jsonb_build_object('policy_version', p_policy_version, 'min_score', v_prefs.auto_min_score, 'daily_quota', v_prefs.daily_quota));
  RETURN v_now;
END;
$$;
REVOKE EXECUTE ON FUNCTION grant_auto_apply_consent(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION grant_auto_apply_consent(text, jsonb) TO authenticated;

-- Existing auto-mode users have no recorded consent history; send them back through the consent step.
UPDATE candidate_preferences SET apply_mode = 'assisted', auto_apply_consent_at = NULL
  WHERE apply_mode = 'auto' AND NOT EXISTS (SELECT 1 FROM auto_apply_consents c WHERE c.user_id = candidate_preferences.user_id AND c.revoked_at IS NULL);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'evidence_level') THEN
    ALTER TABLE applications ADD COLUMN evidence_level text NOT NULL DEFAULT 'none'
      CHECK (evidence_level IN ('none','user_reported','provider_accepted','receipt_verified','employer_response_verified'));
  END IF;
END $$;
UPDATE applications SET evidence_level = CASE
  WHEN submission_method = 'manual_user_reported' THEN 'user_reported'
  WHEN submission_method IS NOT NULL THEN 'provider_accepted'
  ELSE 'none' END
WHERE evidence_level = 'none' AND submitted_at IS NOT NULL;