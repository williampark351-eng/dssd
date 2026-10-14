/*
# Universities and organizations

1. New Tables
- `organizations` - universities / career centers with a seat limit
- `org_members` - membership with role: org_admin, advisor, student (optional cohort)
- `cohorts` - groups of students inside an organization
- `invitations` - single-use invitation tokens bound to an email address
- `advisor_grants` - student-controlled permission letting their organization's advisors view their activity

2. Security
- Strict tenant isolation: every policy checks membership in the specific organization.
- Organizations, memberships and invitations are created only through checked functions
  (`create_organization`, `create_invitations`, `accept_invitation`) that enforce role, email match and seats.
- Advisors only see a student's applications, profile, resumes and interviews when that student has an active grant.
- Organization analytics are aggregate-only (`org_analytics`); per-student detail is limited to students who granted access.
- Platform admins (flag not user-editable) can call `platform_overview`.
*/

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  kind text NOT NULL DEFAULT 'university' CHECK (kind IN ('university','career_center','bootcamp','other')),
  seat_limit int NOT NULL DEFAULT 120 CHECK (seat_limit BETWEEN 1 AND 100000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  term text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('org_admin','advisor','student')),
  cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS org_members_user_idx ON org_members(user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('org_admin','advisor','student')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_open_email_key ON invitations(org_id, lower(email)) WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS advisor_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (student_id, org_id)
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_grants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION my_org_role(p_org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM org_members WHERE org_id = p_org AND user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION my_org_role(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION my_org_role(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), false);
$$;
REVOKE EXECUTE ON FUNCTION is_platform_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated;

CREATE OR REPLACE FUNCTION has_advisor_access(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM advisor_grants g
    JOIN org_members s ON s.org_id = g.org_id AND s.user_id = g.student_id
    JOIN org_members me ON me.org_id = g.org_id AND me.user_id = auth.uid()
    WHERE g.student_id = p_student AND g.revoked_at IS NULL AND me.role IN ('advisor','org_admin')
  );
$$;
REVOKE EXECUTE ON FUNCTION has_advisor_access(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION has_advisor_access(uuid) TO authenticated;

DROP POLICY IF EXISTS "members_select_org" ON organizations;
CREATE POLICY "members_select_org" ON organizations FOR SELECT TO authenticated
  USING (my_org_role(id) IS NOT NULL OR is_platform_admin());
DROP POLICY IF EXISTS "admins_update_org" ON organizations;
CREATE POLICY "admins_update_org" ON organizations FOR UPDATE TO authenticated
  USING (my_org_role(id) = 'org_admin') WITH CHECK (my_org_role(id) = 'org_admin');
REVOKE INSERT, UPDATE, DELETE ON organizations FROM anon, authenticated;
GRANT UPDATE (name, kind) ON organizations TO authenticated;

DROP POLICY IF EXISTS "members_select_cohorts" ON cohorts;
CREATE POLICY "members_select_cohorts" ON cohorts FOR SELECT TO authenticated USING (my_org_role(org_id) IS NOT NULL);
DROP POLICY IF EXISTS "admins_insert_cohorts" ON cohorts;
CREATE POLICY "admins_insert_cohorts" ON cohorts FOR INSERT TO authenticated WITH CHECK (my_org_role(org_id) = 'org_admin');
DROP POLICY IF EXISTS "admins_update_cohorts" ON cohorts;
CREATE POLICY "admins_update_cohorts" ON cohorts FOR UPDATE TO authenticated USING (my_org_role(org_id) = 'org_admin') WITH CHECK (my_org_role(org_id) = 'org_admin');
DROP POLICY IF EXISTS "admins_delete_cohorts" ON cohorts;
CREATE POLICY "admins_delete_cohorts" ON cohorts FOR DELETE TO authenticated USING (my_org_role(org_id) = 'org_admin');

DROP POLICY IF EXISTS "select_org_members" ON org_members;
CREATE POLICY "select_org_members" ON org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR my_org_role(org_id) IN ('org_admin','advisor'));
DROP POLICY IF EXISTS "admins_update_members" ON org_members;
CREATE POLICY "admins_update_members" ON org_members FOR UPDATE TO authenticated
  USING (my_org_role(org_id) = 'org_admin') WITH CHECK (my_org_role(org_id) = 'org_admin'
    AND (cohort_id IS NULL OR EXISTS (SELECT 1 FROM cohorts c WHERE c.id = cohort_id AND c.org_id = org_members.org_id)));
DROP POLICY IF EXISTS "delete_members" ON org_members;
CREATE POLICY "delete_members" ON org_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR my_org_role(org_id) = 'org_admin');
REVOKE INSERT, UPDATE ON org_members FROM anon, authenticated;
GRANT UPDATE (role, cohort_id) ON org_members TO authenticated;

DROP POLICY IF EXISTS "staff_select_invitations" ON invitations;
CREATE POLICY "staff_select_invitations" ON invitations FOR SELECT TO authenticated USING (my_org_role(org_id) IN ('org_admin','advisor'));
DROP POLICY IF EXISTS "admins_delete_invitations" ON invitations;
CREATE POLICY "admins_delete_invitations" ON invitations FOR DELETE TO authenticated USING (my_org_role(org_id) = 'org_admin' AND accepted_at IS NULL);
REVOKE INSERT, UPDATE ON invitations FROM anon, authenticated;

DROP POLICY IF EXISTS "select_grants" ON advisor_grants;
CREATE POLICY "select_grants" ON advisor_grants FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR my_org_role(org_id) IN ('org_admin','advisor'));
DROP POLICY IF EXISTS "insert_own_grants" ON advisor_grants;
CREATE POLICY "insert_own_grants" ON advisor_grants FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND my_org_role(org_id) IS NOT NULL);
DROP POLICY IF EXISTS "update_own_grants" ON advisor_grants;
CREATE POLICY "update_own_grants" ON advisor_grants FOR UPDATE TO authenticated
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "delete_own_grants" ON advisor_grants;
CREATE POLICY "delete_own_grants" ON advisor_grants FOR DELETE TO authenticated USING (student_id = auth.uid());
REVOKE UPDATE ON advisor_grants FROM authenticated;
GRANT UPDATE (revoked_at, granted_at) ON advisor_grants TO authenticated;

DROP POLICY IF EXISTS "advisors_select_applications" ON applications;
CREATE POLICY "advisors_select_applications" ON applications FOR SELECT TO authenticated USING (has_advisor_access(user_id));
DROP POLICY IF EXISTS "advisors_select_profiles" ON profiles;
CREATE POLICY "advisors_select_profiles" ON profiles FOR SELECT TO authenticated USING (has_advisor_access(id));
DROP POLICY IF EXISTS "advisors_select_interviews" ON interviews;
CREATE POLICY "advisors_select_interviews" ON interviews FOR SELECT TO authenticated USING (has_advisor_access(user_id));

CREATE OR REPLACE FUNCTION create_organization(p_name text, p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF (SELECT count(*) FROM organizations WHERE created_by = v_uid) >= 5 THEN RAISE EXCEPTION 'Organization limit reached'; END IF;
  INSERT INTO organizations (name, kind, created_by) VALUES (btrim(p_name), coalesce(p_kind, 'university'), v_uid) RETURNING id INTO v_id;
  INSERT INTO org_members (org_id, user_id, role) VALUES (v_id, v_uid, 'org_admin');
  INSERT INTO audit_logs (user_id, actor_id, action, entity, entity_id) VALUES (v_uid, v_uid, 'org.created', 'organizations', v_id);
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_organization(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_organization(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION create_invitations(p_org uuid, p_cohort uuid, p_emails text[], p_role text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_seats int; v_used int; v_email text; v_count int := 0;
BEGIN
  IF my_org_role(p_org) <> 'org_admin' OR my_org_role(p_org) IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_role NOT IN ('org_admin','advisor','student') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  IF coalesce(array_length(p_emails, 1), 0) = 0 OR array_length(p_emails, 1) > 500 THEN RAISE EXCEPTION 'Provide 1 to 500 emails'; END IF;
  IF p_cohort IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cohorts WHERE id = p_cohort AND org_id = p_org) THEN RAISE EXCEPTION 'Invalid cohort'; END IF;
  SELECT seat_limit INTO v_seats FROM organizations WHERE id = p_org;
  SELECT (SELECT count(*) FROM org_members WHERE org_id = p_org)
       + (SELECT count(*) FROM invitations WHERE org_id = p_org AND accepted_at IS NULL AND expires_at > now()) INTO v_used;
  FOREACH v_email IN ARRAY p_emails LOOP
    v_email := lower(btrim(v_email));
    CONTINUE WHEN v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    CONTINUE WHEN EXISTS (SELECT 1 FROM org_members m JOIN profiles p ON p.id = m.user_id WHERE m.org_id = p_org AND lower(p.email) = v_email);
    IF v_used + v_count >= v_seats THEN RAISE EXCEPTION 'Seat limit reached (% seats)', v_seats; END IF;
    INSERT INTO invitations (org_id, cohort_id, email, role, invited_by) VALUES (p_org, p_cohort, v_email, p_role, v_uid)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  INSERT INTO audit_logs (user_id, actor_id, action, entity, entity_id, details)
  VALUES (v_uid, v_uid, 'org.invitations_created', 'organizations', p_org, jsonb_build_object('count', v_count, 'role', p_role));
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_invitations(uuid, uuid, text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_invitations(uuid, uuid, text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION accept_invitation(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_inv invitations%ROWTYPE; v_seats int; v_members int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  UPDATE invitations SET accepted_at = now(), accepted_by = v_uid
  WHERE token = p_token AND accepted_at IS NULL AND expires_at > now() AND lower(email) = v_email
  RETURNING * INTO v_inv;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invitation is invalid, expired, or for a different email'; END IF;
  SELECT seat_limit INTO v_seats FROM organizations WHERE id = v_inv.org_id;
  SELECT count(*) INTO v_members FROM org_members WHERE org_id = v_inv.org_id;
  IF v_members >= v_seats THEN RAISE EXCEPTION 'This organization has no seats available'; END IF;
  INSERT INTO org_members (org_id, user_id, role, cohort_id) VALUES (v_inv.org_id, v_uid, v_inv.role, v_inv.cohort_id)
  ON CONFLICT (org_id, user_id) DO UPDATE SET cohort_id = coalesce(EXCLUDED.cohort_id, org_members.cohort_id);
  INSERT INTO audit_logs (user_id, actor_id, action, entity, entity_id) VALUES (v_uid, v_uid, 'org.joined', 'organizations', v_inv.org_id);
  RETURN v_inv.org_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION accept_invitation(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION accept_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION org_roster(p_org uuid)
RETURNS TABLE (user_id uuid, full_name text, email text, role text, cohort_id uuid, joined_at timestamptz, advisor_access boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(my_org_role(p_org), '') NOT IN ('org_admin','advisor') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT m.user_id, p.full_name, p.email, m.role, m.cohort_id, m.joined_at,
    EXISTS (SELECT 1 FROM advisor_grants g WHERE g.student_id = m.user_id AND g.org_id = p_org AND g.revoked_at IS NULL)
  FROM org_members m JOIN profiles p ON p.id = m.user_id WHERE m.org_id = p_org ORDER BY m.joined_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION org_roster(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION org_roster(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION org_analytics(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF coalesce(my_org_role(p_org), '') NOT IN ('org_admin','advisor') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  WITH students AS (
    SELECT m.user_id, m.cohort_id FROM org_members m WHERE m.org_id = p_org AND m.role = 'student'
  ), apps AS (
    SELECT s.cohort_id, a.* FROM students s JOIN applications a ON a.user_id = s.user_id
  ), ints AS (
    SELECT s.cohort_id, i.* FROM students s JOIN interviews i ON i.user_id = s.user_id
  ), cohort_rows AS (
    SELECT c.id, c.name, c.term FROM cohorts c WHERE c.org_id = p_org
    UNION ALL SELECT NULL, 'Unassigned', ''
  )
  SELECT jsonb_build_object(
    'students', (SELECT count(*) FROM students),
    'active_students', (SELECT count(DISTINCT user_id) FROM apps),
    'applications', (SELECT count(*) FROM apps),
    'submitted', (SELECT count(*) FROM apps WHERE state IN ('SUBMITTED','CONFIRMED')),
    'confirmed', (SELECT count(*) FROM apps WHERE state = 'CONFIRMED'),
    'responses', (SELECT count(*) FROM apps WHERE employer_response <> 'none'),
    'interviews', (SELECT count(*) FROM ints),
    'offers', (SELECT count(*) FROM apps WHERE employer_response = 'offer'),
    'cohorts', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', cr.id, 'name', cr.name, 'term', cr.term,
        'students', (SELECT count(*) FROM students s WHERE s.cohort_id IS NOT DISTINCT FROM cr.id),
        'applications', (SELECT count(*) FROM apps a WHERE a.cohort_id IS NOT DISTINCT FROM cr.id),
        'submitted', (SELECT count(*) FROM apps a WHERE a.cohort_id IS NOT DISTINCT FROM cr.id AND a.state IN ('SUBMITTED','CONFIRMED')),
        'responses', (SELECT count(*) FROM apps a WHERE a.cohort_id IS NOT DISTINCT FROM cr.id AND a.employer_response <> 'none'),
        'interviews', (SELECT count(*) FROM ints i WHERE i.cohort_id IS NOT DISTINCT FROM cr.id),
        'offers', (SELECT count(*) FROM apps a WHERE a.cohort_id IS NOT DISTINCT FROM cr.id AND a.employer_response = 'offer')
      )), '[]') FROM cohort_rows cr),
    'granted_students', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'name', p.full_name, 'email', p.email,
        'applications', (SELECT count(*) FROM applications a WHERE a.user_id = s.user_id),
        'submitted', (SELECT count(*) FROM applications a WHERE a.user_id = s.user_id AND a.state IN ('SUBMITTED','CONFIRMED')),
        'needs_action', (SELECT count(*) FROM applications a WHERE a.user_id = s.user_id AND a.state IN ('NEEDS_USER_ACTION','READY_FOR_REVIEW')),
        'interviews', (SELECT count(*) FROM interviews i WHERE i.user_id = s.user_id)
      )), '[]')
      FROM students s JOIN profiles p ON p.id = s.user_id
      WHERE EXISTS (SELECT 1 FROM advisor_grants g WHERE g.student_id = s.user_id AND g.org_id = p_org AND g.revoked_at IS NULL))
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION org_analytics(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION org_analytics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION platform_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM profiles),
    'organizations', (SELECT count(*) FROM organizations),
    'jobs_active', (SELECT count(*) FROM jobs WHERE status = 'active'),
    'applications', (SELECT count(*) FROM applications),
    'submitted', (SELECT count(*) FROM applications WHERE state IN ('SUBMITTED','CONFIRMED')),
    'failures', (SELECT count(*) FROM applications WHERE state IN ('FAILED','UNKNOWN_SUBMISSION_RESULT'))
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION platform_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION platform_overview() TO authenticated;
