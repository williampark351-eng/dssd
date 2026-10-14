import { useState } from 'react';
import { Download, ScrollText, Trash2 } from 'lucide-react';
import { supabase, callFunction, friendlyError, audit } from '@/lib/supabase';
import { useAsync, must } from '@/lib/useAsync';
import { formatDate } from '@/lib/format';
import { Button, Card, ErrorBanner, Field, Modal, Spinner, useToast } from '@/components/ui';

const EXPORT_TABLES = [
  'profiles', 'candidate_preferences', 'resumes', 'answer_library', 'job_sources', 'job_matches', 'applications',
  'application_events', 'contacts', 'outreach_messages', 'interviews', 'mock_interviews', 'notifications', 'audit_logs', 'org_members', 'advisor_grants',
] as const;

type AuditRow = { id: string; action: string; entity: string; details: Record<string, unknown>; created_at: string };

export default function PrivacyPanel() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { data: logs, loading, error, reload } = useAsync(async () =>
    (await must(supabase.from('audit_logs').select('id, action, entity, details, created_at').order('created_at', { ascending: false }).limit(100))) as AuditRow[]);

  const exportData = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: user.id, email: user.email };
      for (const t of EXPORT_TABLES) {
        const { data, error: err } = await supabase.from(t).select('*').limit(10000);
        out[t] = err ? { error: 'Could not export this section' } : data;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `applyline-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      await audit('account.data_exported', 'account');
      reload();
      toast('success', 'Your data export has downloaded.');
    } catch (err) {
      toast('error', friendlyError(err, 'Export failed. Please try again.'));
    }
    setExporting(false);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await callFunction('account-delete', { confirm: 'DELETE' });
      await supabase.auth.signOut();
    } catch (err) {
      toast('error', friendlyError(err, 'Your account could not be deleted.'));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-ink-950">Download your data</h2>
          <p className="mt-1 max-w-lg text-sm text-ink-600">A complete copy of your profile, resumes, applications, messages, and activity history as a JSON file.</p>
        </div>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={exportData}>Export my data</Button>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2"><ScrollText className="h-4 w-4 text-ink-500" /><h2 className="text-sm font-bold text-ink-950">Activity log</h2><span className="text-xs text-ink-400">Last 100 events</span></div>
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading ? <Spinner /> : !logs?.length ? <p className="text-sm text-ink-500">No activity recorded yet.</p> : (
          <div className="scrollbar-thin max-h-96 divide-y divide-ink-100 overflow-auto">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-ink-800">{l.action}</span>
                <span className="shrink-0 text-xs text-ink-500">{formatDate(l.created_at, true)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-rose-200 p-6">
        <h2 className="text-sm font-bold text-rose-700">Delete account</h2>
        <p className="mt-1 max-w-lg text-sm text-ink-600">Permanently removes your account, resumes, applications, and history. This cannot be undone. If you created a university workspace, transfer or remove it first.</p>
        <Button className="mt-4" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => { setConfirm(''); setDeleteOpen(true); }}>Delete my account</Button>
      </Card>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?"
        footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" disabled={confirm !== 'DELETE'} loading={deleting} onClick={deleteAccount}>Delete forever</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-ink-600">Consider exporting your data first. Applications already received by employers stay with those employers.</p>
          <Field label='Type "DELETE" to confirm'><input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
