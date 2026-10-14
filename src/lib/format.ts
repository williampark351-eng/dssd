import type { ApplicationState } from './types';

export const STATE_META: Record<ApplicationState, { label: string; tone: Tone; description: string }> = {
  DISCOVERED: { label: 'Discovered', tone: 'neutral', description: 'Found in a job source' },
  MATCHED: { label: 'Matched', tone: 'sky', description: 'Scored against your profile' },
  QUEUED: { label: 'Queued', tone: 'sky', description: 'Waiting for the worker' },
  PREPARING: { label: 'Preparing', tone: 'sky', description: 'Building your packet' },
  READY_FOR_REVIEW: { label: 'Ready for review', tone: 'amber', description: 'Packet ready; needs your decision' },
  SUBMITTING: { label: 'Submitting', tone: 'sky', description: 'Sending through an authorized integration' },
  SUBMITTED: { label: 'Submitted', tone: 'brand', description: 'Accepted or recorded as submitted' },
  CONFIRMED: { label: 'Confirmed', tone: 'success', description: 'Backed by a verified receipt' },
  NEEDS_USER_ACTION: { label: 'Needs you', tone: 'amber', description: 'We paused for your input' },
  BLOCKED: { label: 'Blocked', tone: 'rose', description: 'Cannot proceed as-is' },
  FAILED: { label: 'Failed', tone: 'rose', description: 'Submission was rejected or errored' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', description: 'Stopped by you' },
  UNKNOWN_SUBMISSION_RESULT: { label: 'Unverified result', tone: 'rose', description: 'We could not confirm receipt' },
};

export type Tone = 'neutral' | 'brand' | 'success' | 'amber' | 'rose' | 'sky';

export const IN_FLIGHT: ApplicationState[] = ['QUEUED', 'PREPARING', 'READY_FOR_REVIEW', 'SUBMITTING', 'NEEDS_USER_ACTION', 'UNKNOWN_SUBMISSION_RESULT', 'BLOCKED', 'FAILED'];
export const SUBMITTED_STATES: ApplicationState[] = ['SUBMITTED', 'CONFIRMED'];

export const METHOD_LABEL: Record<string, string> = {
  provider_api: 'Employer integration',
  manual_user_reported: 'Submitted by you',
};

export const PROVIDER_LABEL: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
};

export const RESPONSE_LABEL: Record<string, string> = {
  none: 'No response yet',
  acknowledged: 'Acknowledged',
  interview: 'Interview request',
  rejected: 'Not moving forward',
  offer: 'Offer',
  withdrawn: 'Withdrawn',
  other: 'Other',
};

export function formatDate(d: string | null | undefined, withTime = false): string {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString(undefined, withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function relativeTime(d: string | null | undefined): string {
  if (!d) return 'never';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function safeUrl(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function formatSalary(min: number | null, max: number | null, currency?: string | null): string {
  if (!min && !max) return 'Not disclosed';
  const fmt = (n: number) => `${currency && currency !== 'USD' ? currency + ' ' : '$'}${Math.round(n / 1000)}k`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min || max)!);
}
