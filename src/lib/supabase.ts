import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export async function callFunction<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Network error. Check your connection and try again.');
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload || typeof payload !== 'object') {
    const msg = payload && typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return payload as T;
}

const SAFE_MESSAGES = [
  'Only applications', 'This application', 'Application not found', 'You must confirm', 'Paste the employer',
  'Responses can only', 'Auto-apply requires', 'Select between', 'Outreach is only', 'This contact has opted',
  'Messages must be approved', 'A sent message', 'Seat limit', 'Invitation is invalid', 'This organization has no seats',
  'Not authorized', 'Already submitted', 'Organization limit', 'Provide 1 to 500', 'Invalid cohort', 'Resume not found', 'Cover letter too long',
];

export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  console.error(err);
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === '23505') return 'That already exists.';
  if (SAFE_MESSAGES.some((s) => msg.startsWith(s))) return msg.split('\n')[0];
  if (err instanceof Error && !code) return msg || fallback;
  return fallback;
}

export async function audit(action: string, entity = '', details: Record<string, unknown> = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('audit_logs').insert({ user_id: user.id, actor_id: user.id, action, entity, details });
}
