import type { Job } from '@/lib/types';

export function watchRegex(words: string[]): RegExp | null {
  const list = words.map((w) => w.trim().toLowerCase()).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return list.length ? new RegExp(`\\b(?:${list.join('|')})(?:s|es)?\\b`, 'i') : null;
}

export function isNewJob(job: Pick<Job, 'first_seen_at'>, readAt: string | null): boolean {
  if (!readAt) return false;
  return Date.parse(job.first_seen_at) > Date.parse(readAt);
}

export function arrivals<T extends { id: string }>(previous: Set<string> | null, next: T[]): T[] {
  if (!previous) return [];
  return next.filter((j) => !previous.has(j.id));
}

export function notifyAboutJobs(jobs: Pick<Job, 'title' | 'company' | 'location'>[]) {
  if (!jobs.length || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (jobs.length > 3) {
    new Notification(`${jobs.length} new roles match your watch words`, { body: jobs.slice(0, 3).map((j) => `${j.title}, ${j.company}`).join('\n'), tag: 'applyline-watch' });
    return;
  }
  for (const j of jobs) new Notification(j.title, { body: [j.company, j.location].filter(Boolean).join(' · '), tag: `applyline-${j.title}-${j.company}` });
}
