/*
# Auto-follow starter companies

1. Why
- Live roles were stored for the 17 directory companies, but accounts only see roles from companies they follow,
  so new users saw only the sandbox test roles.

2. Changes
- Every existing account now follows all active seeded directory companies (Stripe, OpenAI, NVIDIA, etc.).
- `handle_new_user` (runs on signup) now also follows those companies for every new account.
- Users can still unfollow any company from the Discover page; nothing is re-added after that except at signup.

3. Security
- No policy changes. Rows are owned by each user (`user_id`) and remain covered by existing owner-only policies.
*/

INSERT INTO job_sources (user_id, provider, board_token, company_name, last_job_count, last_synced_at)
SELECT u.id, b.provider, b.board_token, b.company_name, coalesce(b.job_count, 0), b.last_checked_at
FROM auth.users u
CROSS JOIN discovered_boards b
WHERE b.discovered_via = 'seed' AND b.status = 'active'
ON CONFLICT (user_id, provider, board_token) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
INSERT INTO profiles (id, email, full_name)
VALUES (NEW.id, coalesce(NEW.email, ''), coalesce(NEW.raw_user_meta_data->>'full_name', ''))
ON CONFLICT (id) DO NOTHING;
INSERT INTO candidate_preferences (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
INSERT INTO job_sources (user_id, provider, board_token, company_name, last_job_count, last_synced_at)
SELECT NEW.id, b.provider, b.board_token, b.company_name, coalesce(b.job_count, 0), b.last_checked_at
FROM discovered_boards b
WHERE b.discovered_via = 'seed' AND b.status = 'active'
ON CONFLICT (user_id, provider, board_token) DO NOTHING;
RETURN NEW;
END;
$function$;
