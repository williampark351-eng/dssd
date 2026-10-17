import { supabase, callFunction, friendlyError } from '@/lib/supabase';
import type { Resume } from '@/lib/types';

const ALLOWED = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
} as const;

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export function resumeFileProblem(file: File): string | null {
  const ext = file.name.toLowerCase().split('.').pop();
  if (!(file.type in ALLOWED) && !['pdf', 'docx', 'txt', 'rtf'].includes(ext ?? '')) return 'Upload a PDF, DOCX, TXT or RTF file.';
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
  const ext = file.name.toLowerCase().endsWith('.docx') ? 'docx'
    : file.name.toLowerCase().endsWith('.txt') ? 'txt'
    : file.name.toLowerCase().endsWith('.rtf') ? 'rtf' : 'pdf';
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from('resumes').upload(path, file, {
    contentType: ALLOWED[file.type as keyof typeof ALLOWED] ?? 'application/pdf',
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from('resumes').insert({
    name: name.trim() || file.name.replace(/\.[^.]+$/, ''), file_path: path, file_name: file.name.slice(0, 200), file_type: ext,
    is_primary: makePrimary, parse_status: 'pending', source_kind: 'file',
  }).select().maybeSingle();
  if (error || !data) {
    await supabase.storage.from('resumes').remove([path]);
    if (error && (error as { code?: string }).code === '23505') throw new Error('This exact file is already uploaded.');
    throw error ?? new Error('Upload failed');
  }
  return parse(data.id);
}

export async function createResumeFromText(text: string, name: string, makePrimary: boolean): Promise<Resume> {
  const { data, error } = await supabase.from('resumes').insert({
    name: name.trim() || 'Pasted resume', raw_text: text.slice(0, 100000), is_primary: makePrimary, parse_status: 'pending', source_kind: 'text',
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

export function resumeQualityLabel(quality: Resume['quality']): string {
  if (!quality) return 'Not checked yet';
  const grade = quality.grade;
  const score = Math.round(quality.score);
  if (grade === 'excellent') return `Reads cleanly for hiring software (${score}/100)`;
  if (grade === 'good') return `Mostly machine-readable (${score}/100)`;
  if (grade === 'fair') return `Some formatting may confuse scanners (${score}/100)`;
  return `Likely to confuse resume scanners (${score}/100)`;
}
