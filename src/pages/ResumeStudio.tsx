import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Copy, FileText, RefreshCw, Star, Trash2, Upload, X } from 'lucide-react';
import { supabase, friendlyError, audit } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { useNav } from '@/context/NavContext';
import { createResumeFromText, reparseResume, resumeFileProblem, resumeQualityLabel, setPrimaryResume, uploadResume } from '@/lib/resumes';
import { bulkUpload, extractZipResumes, MAX_BULK_FILES, MAX_ZIP_BYTES } from '@/lib/bulkUpload';
import type { BulkItem } from '@/lib/bulkUpload';
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
  const [bulk, setBulk] = useState<BulkItem[] | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const collect = async (list: FileList | File[]): Promise<File[]> => {
    const files = Array.from(list);
    const out: File[] = [];
    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.zip')) {
        if (f.size > MAX_ZIP_BYTES) { toast('error', `${f.name} is larger than 50 MB.`); continue; }
        try {
          const entries = await extractZipResumes(f);
          if (!entries.length) toast('error', `${f.name} contains no PDF, DOCX, TXT or RTF resumes.`);
          out.push(...entries.slice(0, MAX_BULK_FILES - out.length).map((e) => e.file));
        } catch { toast('error', `Could not read ${f.name}.`); }
      } else out.push(f);
    }
    return out.slice(0, MAX_BULK_FILES);
  };

  const runBulk = async (files: File[]) => {
    if (!files.length) return;
    setBulkRunning(true);
    setBulk([]);
    try {
      await bulkUpload(files, files.map((f) => f.name), (p) => setBulk(p.items));
      audit('resume.bulk_uploaded', 'resume', { count: files.length });
      reload();
      toast('success', 'Batch finished. Review each new resume before using it.');
    } catch (err) { toast('error', friendlyError(err, 'Bulk upload failed. Please try again.')); }
    setBulkRunning(false);
  };

  const onFiles = async (list: FileList | File[]) => {
    const files = await collect(list);
    if (files.length === 1) {
      const problem = resumeFileProblem(files[0]);
      if (problem) { toast('error', problem); return; }
      setUploading(true);
      try { afterCreate(await uploadResume(files[0], '', !data?.length)); }
      catch (err) { toast('error', friendlyError(err, 'Upload failed. Please try again.')); }
      setUploading(false);
    } else if (files.length > 1) await runBulk(files);
  };

  const { data, loading, error, reload } = useAsync(async () =>
    (await must(supabase.from('resumes').select('*').order('is_primary', { ascending: false }).order('created_at', { ascending: false }))) as Resume[]);

  const afterCreate = (r: Resume) => {
    audit('resume.created', 'resume', { resume_id: r.id });
    toast(r.parse_status === 'parsed' ? 'success' : 'info', r.parse_status === 'parsed' ? 'Resume parsed. Review it before applying.' : 'Saved, but we could not read everything. Please fill in the details.');
    reload();
    setEditing(r);
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
          <Button icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>Upload resumes</Button>
        </>} />
      <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.rtf,.zip" className="hidden" onChange={(e) => { onFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; }} />

      <div className="mb-6 inline-flex rounded-xl bg-ink-100 p-1">
        {[['resumes', 'Resume versions'], ['answers', 'Answer library']].map(([k, l]) => (
          <button key={k} onClick={() => navigate('resumes', k === 'answers' ? 'answers' : undefined)} className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${tab === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>{l}</button>
        ))}
      </div>

      {tab === 'answers' ? <AnswerLibrary /> : (
        <>
          {error && <ErrorBanner message={error} onRetry={reload} />}
          <Card className={`mb-6 transition ${dragOver ? 'ring-2 ring-brand-500' : ''}`}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
            >
              <button onClick={() => fileRef.current?.click()} className="w-full">
                <EmptyState
                  icon={<Upload className="h-5 w-5" />}
                  title={data?.length ? 'Add more resumes' : 'Add your first resume'}
                  body="Drop one or many PDF, DOCX, TXT or RTF files here, or a ZIP folder of them. You review everything we extract before it is used."
                />
              </button>
            </div>
          </Card>
          {bulkRunning && <Spinner label="Uploading and reading your resumes…" />}
          {bulk && bulk.length > 0 && (
            <Card className="mb-6 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-ink-950">This batch</p>
                {!bulkRunning && <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setBulk(null)}>Dismiss</Button>}
              </div>
              <ul className="divide-y divide-ink-100">
                {bulk.map((it, i) => (
                  <li key={i} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink-800">{it.name}</span>
                    <span className="shrink-0 text-xs text-ink-500">{it.detail}</span>
                    {it.status === 'done' && <Badge tone="success"><CheckCircle2 className="h-3 w-3" />Added{typeof it.score === 'number' ? ` · ${it.score}/100` : ''}</Badge>}
                    {it.status === 'duplicate' && <Badge tone="amber"><Copy className="h-3 w-3" />Duplicate</Badge>}
                    {it.status === 'skipped' && <Badge tone="neutral">Skipped</Badge>}
                    {it.status === 'failed' && <Badge tone="danger"><AlertTriangle className="h-3 w-3" />Failed</Badge>}
                    {(it.status === 'uploading' || it.status === 'parsing' || it.status === 'queued') && <Badge tone="brand"><RefreshCw className="h-3 w-3 animate-spin" />{it.status === 'parsing' ? 'Reading' : 'Uploading'}</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {loading ? <Spinner /> : !data?.length ? (
            <Card>
              <EmptyState icon={<FileText className="h-5 w-5" />} title="Nothing here yet" body="Use the drop zone above to add your first resume. You will review everything we extract before it is used." />
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
                  {r.dup_of_resume_id && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      <Copy className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">Same file contents as another resume in your list.</span>
                      <button className="font-bold underline" onClick={() => setDeleting(r)}>Remove copy</button>
                    </div>
                  )}
                  {r.quality && (
                    <details className="mt-3 rounded-lg bg-ink-50 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-bold text-ink-800">{resumeQualityLabel(r.quality)}</summary>
                      <p className="mt-1 text-[11px] text-ink-500">This checks how easily hiring software can read the file — not the quality of you or your experience.</p>
                      <ul className="mt-2 space-y-1">
                        {r.quality.checks.map((c) => (
                          <li key={c.id} className="flex items-start gap-1.5 text-[11px]">
                            {c.passed ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />}
                            <span className="text-ink-600"><span className="font-semibold text-ink-800">{c.label}:</span> {c.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
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
