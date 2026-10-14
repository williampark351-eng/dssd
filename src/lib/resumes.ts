import { supabase, callFunction } from '@/lib/supabase';
import type { Resume } from '@/lib/types';

const ALLOWED = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
} as const;

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export function resumeFileProblem(file: File): string | null {
  const ext = file.name.toLowerCase().split('.').pop();
  if (!(file.type in ALLOWED) && ext !== 'pdf' && ext !== 'docx') return 'Upload a PDF or DOCX file.';
  if (file.size > MAX_RESUME_BYTES) return 'That file is larger than 10 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

async function parse(resumeId: string, text?: string): Promise<Resume> {
  try {
    await callFunction('resume-parse', text ? { resume_id: resumeId, text } : { resume_id: resumeId });
  } catch (err) {
    console.error(err);
  }
  const { data, error } = await supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
  if (error || !data) throw error ?? new Error('Resume not found');
  return data as Resume;
}

export async function uploadResume(file: File, name: string, makePrimary: boolean): Promise<Resume> {
  const problem = resumeFileProblem(file);
  if (problem) throw new Error(problem);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');
  const ext = file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf';
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from('resumes').upload(path, file, {
    contentType: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from('resumes').insert({
    name: name.trim() || file.name.replace(/\.[^.]+$/, ''), file_path: path, file_name: file.name.slice(0, 200), file_type: ext,
    is_primary: makePrimary, parse_status: 'pending',
  }).select().maybeSingle();
  if (error || !data) {
    await supabase.storage.from('resumes').remove([path]);
    throw error ?? new Error('Upload failed');
  }
  return parse(data.id);
}

export async function createResumeFromText(text: string, name: string, makePrimary: boolean): Promise<Resume> {
  const { data, error } = await supabase.from('resumes').insert({
    name: name.trim() || 'Pasted resume', raw_text: text.slice(0, 100000), is_primary: makePrimary, parse_status: 'pending',
  }).select().maybeSingle();
  if (error || !data) throw error ?? new Error('Could not save resume');
  return parse(data.id, text);
}

export function reparseResume(resume: Resume, text?: string) {
  return parse(resume.id, text);
}

export async function setPrimaryResume(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');
  const off = await supabase.from('resumes').update({ is_primary: false }).eq('user_id', user.id).neq('id', id);
  if (off.error) throw off.error;
  const on = await supabase.from('resumes').update({ is_primary: true }).eq('id', id);
  if (on.error) throw on.error;
}
