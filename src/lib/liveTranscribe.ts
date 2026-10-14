import { supabase } from '@/lib/supabase';

export type LiveEvent =
  | { kind: 'ready' }
  | { kind: 'speaking'; active: boolean }
  | { kind: 'transcript'; id: string; text: string; final: boolean; tone?: string; language?: string }
  | { kind: 'translation'; id: string; text: string; final: boolean }
  | { kind: 'warning'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'closed' };

export type LiveSession = { stop: () => Promise<void>; level: () => number };

const WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('capture', Capture);
`;

const TARGET_RATE = 16000;

function downsample(input: Float32Array, rate: number): Int16Array {
  const ratio = rate / TARGET_RATE;
  const len = Math.floor(input.length / ratio);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function liveSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined' && typeof WebSocket !== 'undefined';
}

export async function startLiveSession(opts: { translateTo: string | null; onEvent: (e: LiveEvent) => void }): Promise<LiveSession> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error('Microphone access was blocked. Allow microphone access in your browser to practice out loud.');
  }

  const ctx = new AudioContext();
  const blobUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(blobUrl);
  URL.revokeObjectURL(blobUrl);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'capture');
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node).connect(mute).connect(ctx.destination);

  const wsUrl = `${import.meta.env.VITE_SUPABASE_URL.replace(/^http/, 'ws')}/functions/v1/live-transcribe?apikey=${encodeURIComponent(import.meta.env.VITE_SUPABASE_ANON_KEY)}`;
  const ws = new WebSocket(wsUrl);
  let ready = false;
  let level = 0;
  let pending: Float32Array[] = [];
  let pendingLen = 0;
  let finished: (() => void) | null = null;

  const cleanup = () => {
    node.port.onmessage = null;
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: session.access_token, translate_to: opts.translateTo }));
  ws.onerror = () => opts.onEvent({ kind: 'error', message: 'Could not connect to live practice. Check your connection and try again.' });
  ws.onclose = () => { cleanup(); finished?.(); opts.onEvent({ kind: 'closed' }); };
  ws.onmessage = (m) => {
    let ev: Record<string, string>;
    try { ev = JSON.parse(String(m.data)); } catch { return; }
    const id = ev.item_id || ev.response_id || 'x';
    switch (ev.type) {
      case 'relay.ready': ready = true; opts.onEvent({ kind: 'ready' }); break;
      case 'relay.error': opts.onEvent({ kind: 'error', message: ev.message || 'Live practice stopped.' }); break;
      case 'relay.warning': opts.onEvent({ kind: 'warning', message: ev.message }); break;
      case 'input_audio_buffer.speech_started': opts.onEvent({ kind: 'speaking', active: true }); break;
      case 'input_audio_buffer.speech_stopped': opts.onEvent({ kind: 'speaking', active: false }); break;
      case 'conversation.item.input_audio_transcription.delta': opts.onEvent({ kind: 'transcript', id, text: ev.delta ?? '', final: false }); break;
      case 'conversation.item.input_audio_transcription.completed':
        opts.onEvent({ kind: 'transcript', id, text: ev.transcript ?? '', final: true, tone: ev.emotion || undefined, language: ev.language || undefined }); break;
      case 'response.text.delta': opts.onEvent({ kind: 'translation', id, text: ev.delta ?? '', final: false }); break;
      case 'response.text.done': opts.onEvent({ kind: 'translation', id, text: ev.text ?? '', final: true }); break;
    }
  };

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const chunk = e.data;
    let peak = 0;
    for (let i = 0; i < chunk.length; i += 8) peak = Math.max(peak, Math.abs(chunk[i]));
    level = level * 0.7 + peak * 0.3;
    if (!ready || ws.readyState !== WebSocket.OPEN) return;
    pending.push(chunk);
    pendingLen += chunk.length;
    if (pendingLen < ctx.sampleRate / 10) return;
    const merged = new Float32Array(pendingLen);
    let off = 0;
    for (const p of pending) { merged.set(p, off); off += p.length; }
    pending = [];
    pendingLen = 0;
    ws.send(JSON.stringify({ type: 'audio', audio: toBase64(downsample(merged, ctx.sampleRate)) }));
  };

  return {
    level: () => level,
    stop: () => new Promise<void>((resolve) => {
      node.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      if (ws.readyState !== WebSocket.OPEN) { cleanup(); resolve(); return; }
      finished = resolve;
      ws.send(JSON.stringify({ type: 'finish' }));
      setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.close(); resolve(); }, 5000);
    }),
  };
}
