import { useEffect, useMemo, useState } from 'react';
import { MousePointerClick, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui';
import { buildFillBookmarklet, fillDetailsFromProfile } from '@/lib/bookmarklet';
import { supabase } from '@/lib/supabase';
import type { ParsedResume } from '@/lib/types';

export default function FillButtonCard() {
  const { profile } = useAuth();
  const [resume, setResume] = useState<Partial<ParsedResume> | null>(null);
  useEffect(() => {
    supabase.from('resumes').select('parsed').order('is_primary', { ascending: false }).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => { if (!error && data?.parsed) setResume(data.parsed as Partial<ParsedResume>); });
  }, []);
  const details = useMemo(() => fillDetailsFromProfile(profile ?? {}, resume), [profile, resume]);
  const href = useMemo(() => buildFillBookmarklet(details), [details]);
  const filled = Object.values(details).filter(Boolean).length;
  const total = Object.keys(details).length;

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-sm font-bold text-ink-950">Fill-application button</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">
            Drag the button to your bookmarks bar. On any application form (Greenhouse, Lever, Ashby, Workday, or a company's own site), click it to fill your name, contact details, links, current job, school and degree into empty fields, including forms embedded inside the page.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-ink-500">
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />It only fills empty boxes and never submits. You attach your resume, check the answers and press submit.</li>
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Your details stay in the button itself. Nothing is sent anywhere.</li>
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />If a company page embeds the form from another site, the button shows a link to open that form on its own so it can be filled.</li>
          </ul>
          <p className="mt-3 text-xs text-ink-400">Using {filled} of {total} details from your profile and main resume. If you change them, drag the button again.</p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <a
            href={href}
            onClick={(e) => e.preventDefault()}
            draggable
            className="inline-flex cursor-grab items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:-translate-y-0.5 hover:bg-brand-700 active:cursor-grabbing"
          >
            <MousePointerClick className="h-4 w-4" />Fill application
          </a>
          <span className="text-[11px] text-ink-400">Drag me to your bookmarks bar</span>
        </div>
      </div>
    </Card>
  );
}
