import { supabase } from '@/lib/supabase';
import type { ApplyMode, Job, JobSource } from '@/lib/types';

export function sourceFilter(sources: Pick<JobSource, 'provider' | 'board_token'>[]): string {
  return sources.map((s) => `and(provider.eq.${s.provider},board_token.eq.${s.board_token})`).join(',');
}

const LIST_COLUMNS = 'id, provider, board_token, external_id, title, company, location, work_arrangement, department, employment_type, seniority, salary_min, salary_max, salary_currency, url, apply_url, dedupe_key, status, posted_at, first_seen_at, last_seen_at';
const PAGE = 1000;
const MAX_JOBS = 10000;

export async function fetchJobsForSources(sources: JobSource[]): Promise<Job[]> {
  if (!sources.length) return [];
  const out: Job[] = [];
  for (let from = 0; from < MAX_JOBS; from += PAGE) {
    const { data, error } = await supabase.from('jobs')
      .select(LIST_COLUMNS)
      .or(sourceFilter(sources))
      .order('first_seen_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Omit<Job, 'description'>[];
    out.push(...rows.map((r) => ({ ...r, description: '' })));
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchJobDescription(jobId: string): Promise<string> {
  const { data, error } = await supabase.from('jobs').select('description').eq('id', jobId).maybeSingle();
  if (error) throw error;
  return typeof data?.description === 'string' ? data.description : '';
}

export async function queueJobs(jobIds: string[], mode: ApplyMode): Promise<number> {
  const { data, error } = await supabase.rpc('queue_applications', { p_job_ids: jobIds, p_mode: mode });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}
