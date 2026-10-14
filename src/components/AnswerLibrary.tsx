import { useMemo, useState } from 'react';
import { BookOpen, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { supabase, friendlyError } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import type { LibraryAnswer } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Modal, Spinner, Toggle, useToast } from '@/components/ui';

const CATEGORIES = ['general', 'eligibility', 'experience', 'logistics', 'compensation', 'demographic', 'motivation'];
type Draft = { id?: string; question: string; answer: string; category: string; sensitive: boolean };

export default function AnswerLibrary() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, loading, error, reload } = useAsync(async () =>
    (await must(supabase.from('answer_library').select('*').order('updated_at', { ascending: false }))) as LibraryAnswer[]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data ?? []).filter((a) => !n || `${a.question} ${a.answer}`.toLowerCase().includes(n));
  }, [data, q]);

  const save = async () => {
    if (!edit) return;
    const question = edit.question.trim();
    if (question.length < 2) { toast('error', 'Write the question first.'); return; }
    setSaving(true);
    const row = { question, answer: edit.answer.slice(0, 10000), category: edit.category, sensitive: edit.sensitive, approved: true, updated_at: new Date().toISOString() };
    const { error: err } = edit.id
      ? await supabase.from('answer_library').update(row).eq('id', edit.id)
      : await supabase.from('answer_library').insert(row);
    setSaving(false);
    if (err) { toast('error', friendlyError(err, 'Could not save that answer.')); return; }
    toast('success', 'Answer saved.');
    setEdit(null);
    reload();
  };

  const remove = async (id: string) => {
    const { error: err } = await supabase.from('answer_library').delete().eq('id', id);
    if (err) { toast('error', friendlyError(err, 'Could not delete that answer.')); return; }
    reload();
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-ink-600">Approved answers are reused to prefill application questions. Sensitive answers (like demographics) are never filled in automatically without you seeing them.</p>
        <div className="flex gap-2">
          <div className="relative sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Search answers" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ question: '', answer: '', category: 'general', sensitive: false })}>Add</Button>
        </div>
      </div>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading ? <Spinner /> : list.length === 0 ? (
        <Card><EmptyState icon={<BookOpen className="h-5 w-5" />} title="Your answer library is empty"
          body="Add answers to common questions, or tick “Save to my answer library” while reviewing an application." /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <Card key={a.id} className="group p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-ink-950">{a.question}</p>
                <div className="flex shrink-0 gap-1 opacity-60 transition group-hover:opacity-100">
                  <button aria-label="Edit" onClick={() => setEdit({ id: a.id, question: a.question, answer: a.answer, category: a.category, sensitive: a.sensitive })} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"><Pencil className="h-3.5 w-3.5" /></button>
                  <button aria-label="Delete" onClick={() => remove(a.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-ink-600">{a.answer || <span className="italic text-ink-400">No answer yet</span>}</p>
              <div className="mt-3 flex gap-2">
                <Badge tone="neutral">{a.category}</Badge>
                {a.sensitive && <Badge tone="amber"><Lock className="h-3 w-3" />Sensitive</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit answer' : 'Add answer'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Question"><input className="input" value={edit.question} maxLength={1000} onChange={(e) => setEdit({ ...edit, question: e.target.value })} placeholder="e.g. Why do you want to work here?" /></Field>
            <Field label="Your answer"><textarea className="input min-h-[120px]" value={edit.answer} maxLength={10000} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} /></Field>
            <div className="flex items-end justify-between gap-4">
              <Field label="Category">
                <select className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-3 pb-2 text-sm font-semibold text-ink-700">Sensitive <Toggle checked={edit.sensitive} onChange={(v) => setEdit({ ...edit, sensitive: v })} /></label>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
