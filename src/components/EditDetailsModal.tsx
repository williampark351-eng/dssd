import { useEffect, useState } from 'react';
import { supabase, callFunction, friendlyError, audit } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button, Modal, useToast } from '@/components/ui';
import { ProfileForm, pickProfile, type ProfileDraft } from '@/components/ProfileForms';

export default function EditDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, setProfile } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open && profile) setDraft(pickProfile(profile)); }, [open, profile]);

  const save = async () => {
    if (!draft || !profile) return;
    if (!draft.full_name.trim()) { toast('error', 'Add your name.'); return; }
    setSaving(true);
    const row = { ...draft, years_experience: Math.max(0, Math.min(70, Number(draft.years_experience) || 0)), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('profiles').update(row).eq('id', profile.id);
    setSaving(false);
    if (error) { toast('error', friendlyError(error, 'Could not save your details.')); return; }
    setProfile({ ...profile, ...row });
    audit('profile.updated', 'profile');
    toast('success', 'Details saved. Drag the Fill application button to your bookmarks bar again to use them.');
    callFunction('match-jobs', {}).catch((e) => console.error(e));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Your application details"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Save details</Button></>}>
      <p className="mb-4 text-sm text-ink-600">These are what the Fill application button types into employer forms.</p>
      {draft && <ProfileForm value={draft} onChange={setDraft} />}
    </Modal>
  );
}
