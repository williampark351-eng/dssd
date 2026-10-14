/*
  # Retire the sandbox job board

  Only real job boards (Greenhouse, Lever, Ashby, Workday) can be followed.
  No existing rows use the sandbox provider, so this only tightens the rule.
*/
ALTER TABLE public.job_sources DROP CONSTRAINT IF EXISTS job_sources_provider_check;
ALTER TABLE public.job_sources ADD CONSTRAINT job_sources_provider_check
  CHECK (provider = ANY (ARRAY['greenhouse','lever','ashby','workday']));