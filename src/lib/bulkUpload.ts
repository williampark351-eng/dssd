import { supabase, callFunction, friendlyError } from '@/lib/supabase';
import type { Resume } from '@/lib/types';

export const MAX_BULK_FILES = 30;
export const MAX_ZIP_BYTES = 50 * 1024 * 1024;

type Ext = 'pdf' | 'docx' | 'txt' | 'rtf';

const EXT_OF: Record<Ext, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  rtf: 'application/rtf',
};

export type ZipEntry = { name: string; file: File };

function extOf(name: string): Ext | null {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const e = m?.[1] ?? '';
  if (e === 'pdf' || e === 'docx' || e === 'txt' || e === 'rtf') return e;
  return null;
}

/** Reads a ZIP in the browser and returns every supported resume inside it. */
export async function extractZipResumes(zip: File): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await zip.arrayBuffer());
  const ds = new DecompressionStream('deflate-raw');
  const out: ZipEntry[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let off = 0;
  while (off + 30 <= buf.length) {
    if (view.getUint32(off, true) !== 0x04034b50) break;
    const flags = view.getUint16(off + 6, true);
    const method = view.getUint16(off + 8, true);
    const sizeField = view.getUint32(off + 18, true);
    const nameLen = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const name = new TextDecoder().decode(buf.subarray(off + 30, off + 30 + nameLen));
    const dataStart = off + 30 + nameLen + extraLen;

    // Bit 3 (streamed entries, e.g. macOS Archive Utility) stores sizes only in the data descriptor after the payload.
    const hasDescriptor = (flags & 0x8) !== 0;
    const stored = method === 0;
    const deflated = method === 8;
    if (!stored && !deflated) { off = dataStart + sizeField; continue; }

    const end = hasDescriptor ? findDescriptorEnd(buf, dataStart, deflated ? 0 : sizeField) : dataStart + sizeField;
    const chunk = buf.subarray(dataStart, Math.min(end, buf.length));

    if (!name.endsWith('/') && !name.includes('__MACOSX') && !name.split('/').pop()?.startsWith('.')) {
      const ext = extOf(name);
      if (ext && chunk.length > 0) {
        let bytes = chunk;
        if (deflated) {
          try {
            const stream = new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            bytes = new Uint8Array(await new Response(stream).arrayBuffer());
          } catch {
            off = end;
            continue;
          }
        }
        const base = name.split('/').pop() || name;
        if (bytes.length > 0) out.push({ name: base, file: new File([bytes], base, { type: EXT_OF[ext] }) });
      }
    }
    off = end;
  }
  return out;
}

function findDescriptorEnd(buf: Uint8Array, from: number, storedSize: number): number {
  // Scan forward for the PK\x07\x08 signature; cap the scan at 64 KB.
  const cap = Math.min(buf.length, from + 65536);
  for (let i = from; i + 4 <= cap; i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x07 && buf[i + 3] === 0x08) {
      const size = storedSize || new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(i + 8, true);
      return i + 16 <= buf.length && size > 0 ? i + 16 : i;
    }
  }
  return buf.length;
}

export type BulkItem = {
  name: string;
  file: File | null;
  status: 'queued' | 'uploading' | 'parsing' | 'done' | 'duplicate' | 'skipped' | 'failed';
  detail: string;
  resume?: Resume;
  score?: number;
};

export type BulkSummary = { total: number; created: number; duplicates: number; failed: number };

export type BulkProgress = { items: BulkItem[]; summary: BulkSummary; running: boolean };

const UPLOAD_CONCURRENCY = 3;

/** Runs every picked file through upload + parse with progress callbacks. Returns the final item list. */
export async function bulkUpload(
  files: (File | null)[],
  names: string[],
  onUpdate: (p: BulkProgress) => void,
): Promise<BulkItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');

  const { data: existing } = await supabase.from('resumes').select('id, file_name, name');
  const existingNames = new Set((existing ?? []).map((r) => String(r.file_name ?? '').toLowerCase()));
  const usedHashes = new Set<string>();
  const items: BulkItem[] = files.map((f, i) => ({
    name: names[i],
    file: f,
    status: f ? 'queued' : 'skipped',
    detail: f ? '' : 'Unsupported file type (PDF, DOCX, TXT, RTF only)',
  }));

  const push = (running = true) => {
    onUpdate({
      items: items.map((i) => ({ ...i })),
      summary: {
        total: items.length,
        created: items.filter((i) => i.status === 'done').length,
        duplicates: items.filter((i) => i.status === 'duplicate' || i.status === 'skipped').length,
        failed: items.filter((i) => i.status === 'failed').length,
      },
      running,
    });
  };

  push();

  const queue = items.map((it, i) => ({ it, i })).filter((x) => x.it.status === 'queued');
  const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      const { it } = next;
      const file = it.file!;
      try {
        it.status = 'uploading';
        push();

        const lowered = file.name.toLowerCase();
        const twinName = existingNames.has(lowered);
        if (twinName) {
          it.status = 'duplicate';
          it.detail = 'A resume with this file name is already in your list';
          push();
          continue;
        }

        const ext = extOf(file.name) ?? 'pdf';
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from('resumes').upload(path, file, { contentType: EXT_OF[ext], upsert: false });
        if (up.error) throw up.error;
        const { data, error } = await supabase.from('resumes').insert({
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 120), file_path: path, file_name: file.name.slice(0, 200),
          file_type: ext, is_primary: false, parse_status: 'pending', source_kind: 'file',
        }).select().maybeSingle();
        if (error || !data) {
          await supabase.storage.from('resumes').remove([path]);
          throw error ?? new Error('Upload failed');
        }
        const resume = data as Resume;

        it.status = 'parsing';
        push();
        try {
          await callFunction('resume-parse', { resume_id: resume.id });
        } catch (parseErr) {
          console.error(parseErr);
        }
        const { data: fresh } = await supabase.from('resumes').select('*').eq('id', resume.id).maybeSingle();
        const final = (fresh ?? resume) as Resume;

        if (final.file_hash && usedHashes.has(final.file_hash)) {
          it.status = 'duplicate';
          it.detail = 'Same file contents as another resume in this batch';
          await supabase.from('resumes').delete().eq('id', final.id);
          await supabase.storage.from('resumes').remove([path]);
        } else if (final.dup_of_resume_id) {
          it.status = 'duplicate';
          it.detail = `Same file contents as an existing resume`;
          await supabase.from('resumes').delete().eq('id', final.id);
          await supabase.storage.from('resumes').remove([path]);
        } else {
          if (final.file_hash) usedHashes.add(final.file_hash);
          existingNames.add(final.file_name?.toLowerCase() ?? '');
          it.status = final.parse_status === 'failed' ? 'failed' : 'done';
          it.detail = final.parse_status === 'failed' ? (final.parse_error || 'We could not read this file') : '';
          it.resume = final;
          it.score = final.quality ? Number(final.quality.score) : undefined;
        }
        push();
      } catch (err) {
        it.status = 'failed';
        it.detail = friendlyError(err, 'Upload failed. Please try again.');
        push();
      }
    }
  });

  await Promise.all(workers);
  push(false);
  return items;
}
