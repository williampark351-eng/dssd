import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileText, RefreshCw, Star, Trash2, Upload } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useNav } from '@/context/NavContext';
import { createResumeFromText, reparseResume, resumeFileProblem, setPrimaryResume, uploadResume } from '@/lib/resumes';
import { relativeTime } from '@/lib/format';
import type { Resume } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Modal, PageHeader, Spinner, useToast } from '@/components/ui';
import ResumeEditor from '@/components/ResumeEditor';
import AnswerLibrary from '@/components/AnswerLibrary';

export default function ResumeStudio() {
  const toast = useToast();
  const { param, navigate } = useNav();
  const tab = param === 'answers' ? 'answers' : 'resumes';
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [editing, setEditing] = useState<Resume | null>(null);
  const [deleting, setDeleting] = useState<Resume | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(async () =>
    (await must(supabase.from('resumes').select('*').order('is_primary', { ascending: false }).order('created_at', { ascending: false }))) as Resume[]);

  const afterCreate = (r: Resume) => {
    audit('resume.created', 'resume', { resume_id: r.id });
    toast(r.parse_status === 'parsed' ? 'success' : 'info', r.parse_status === 'parsed' ? 'Resume parsed. Review it before applying.' : 'Saved, but we could not read everything. Please fill in the details.');
    reload();
    setEditing(r);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = resumeFileProblem(file);
    if (problem) { toast('error', problem); return; }
    setUploading(true);
    try { afterCreate(await uploadResume(file, '', !data?.length)); }
    catch (err) { toast('error', friendlyError(err, 'Upload failed. Please try again.')); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPaste = async () => {
    if (pasteText.trim().length < 50) { toast('error', 'Paste at least a few lines of your resume.'); return; }
    setUploading(true);
    try { const r = await createResumeFromText(pasteText, pasteName, !data?.length); setPasteOpen(false); setPasteText(''); setPasteName(''); afterCreate(r); }
    catch (err) { toast('error', friendlyError(err, 'Could not save that resume.')); }
    setUploading(false);
  };

  const withBusy = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try { await fn(); toast('success', ok); reload(); }
    catch (err) { toast('error', friendlyError(err, 'Something went wrong.')); }
    setBusy(null);
  };

  const remove = (r: Resume) => withBusy(`del-${r.id}`, async () => {
    const { error: err } = await supabase.from('resumes').delete().eq('id', r.id);
    if (err) throw err;
    if (r.file_path) await supabase.storage.from('resumes').remove([r.file_path]);
    audit('resume.deleted', 'resume', { resume_id: r.id });
    setDeleting(null);
  }, 'Resume deleted.');

  return (
    <>
      <PageHeader title="Resume Studio" subtitle="Your resume versions and reusable answers. Nothing here is ever embellished: tailoring only reorders and emphasizes what you wrote."
        actions={tab === 'resumes' && <>
          <Button variant="secondary" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => setPasteOpen(true)}>Paste text</Button>
          <Button icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>Upload PDF or DOCX</Button>
        </>} />
      <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      <div className="mb-6 inline-flex rounded-xl bg-ink-100 p-1">
        {[['resumes', 'Resume versions'], ['answers', 'Answer library']].map(([k, l]) => (
          <button key={k} onClick={() => navigate('resumes', k === 'answers' ? 'answers' : undefined)} className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${tab === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>{l}</button>
        ))}
      </div>

      {tab === 'answers' ? <AnswerLibrary /> : (
        <>
          {error && <ErrorBanner message={error} onRetry={reload} />}
          {loading ? <Spinner /> : !data?.length ? (
            <Card>
              <button onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }} className="w-full">
                <EmptyState icon={<FileText className="h-5 w-5" />} title="Add your first resume" body="Drop a PDF or DOCX here, or click to upload. You will review everything we extract before it is used." />
              </button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.map((r) => (
                <Card key={r.id} className={`flex flex-col p-5 transition hover:shadow-md ${r.is_primary ? 'ring-2 ring-brand-500/40' : ''}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><FileText className="h-5 w-5" /></div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.is_primary && <Badge tone="brand"><Star className="h-3 w-3" />Primary</Badge>}
                      {r.reviewed ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" />Reviewed</Badge> : <Badge tone="amber"><AlertTriangle className="h-3 w-3" />Needs review</Badge>}
                    </div>
                  </div>
                  <p className="font-bold text-ink-950">{r.name}</p>
                  <p className="text-xs text-ink-500">{r.target_category || 'General'} · {r.file_name ?? 'Pasted text'} · updated {relativeTime(r.updated_at)}</p>
                  <p className="mt-3 line-clamp-2 text-sm text-ink-600">{r.parsed?.summary || `${r.parsed?.experience?.length ?? 0} roles · ${r.parsed?.skills?.length ?? 0} skills`}</p>
                  {r.parse_status === 'failed' && <p className="mt-2 text-xs text-rose-600">{r.parse_error || 'We could not read this file. Fill in details manually.'}</p>}
                  {!!r.parsed?.skills?.length && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {r.parsed.skills.slice(0, 6).map((s) => <span key={s} className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">{s}</span>)}
                      {r.parsed.skills.length > 6 && <span className="text-[11px] text-ink-400">+{r.parsed.skills.length - 6}</span>}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    <Button size="sm" onClick={() => setEditing(r)}>{r.reviewed ? 'Edit' : 'Review'}</Button>
                    {!r.is_primary && <Button size="sm" variant="secondary" loading={busy === `p-${r.id}`} onClick={() => withBusy(`p-${r.id}`, () => setPrimaryResume(r.id), 'Primary resume updated.')}>Make primary</Button>}
                    {r.file_path && <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={busy === `r-${r.id}`} onClick={() => withBusy(`r-${r.id}`, async () => { await reparseResume(r); }, 'Re-parsed. Review the result.')}>Re-parse</Button>}
                    <Button size="sm" variant="ghost" className="ml-auto text-rose-600" aria-label="Delete" onClick={() => setDeleting(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste resume text"
        footer={<><Button variant="secondary" onClick={() => setPasteOpen(false)}>Cancel</Button><Button onClick={onPaste} loading={uploading}>Save and parse</Button></>}>
        <div className="space-y-4">
          <Field label="Version name"><input className="input" value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="e.g. Data analyst resume" maxLength={120} /></Field>
          <Field label="Resume text"><textarea className="input min-h-[240px] font-mono text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} maxLength={100000} /></Field>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete this resume?"
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Keep it</Button><Button variant="danger" loading={!!deleting && busy === `del-${deleting.id}`} onClick={() => deleting && remove(deleting)}>Delete</Button></>}>
        <p className="text-sm text-ink-600">The file and its parsed data will be removed. Applications already prepared keep their own snapshot of what was sent.</p>
      </Modal>

      <ResumeEditor resume={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </>
  );
}
