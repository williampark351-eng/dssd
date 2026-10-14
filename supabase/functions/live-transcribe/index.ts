import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import WebSocket from "npm:ws@8.18.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UPSTREAM = "wss://ap-southeast-1.maas.qwencloudapi.com/api-ws/v1/realtime?model=qwen3.8-livetranslate-flash-realtime";
const MAX_SESSION_MS = 15 * 60 * 1000;
const DAILY_SESSIONS = 30;
const MAX_AUDIO_CHUNK = 128 * 1024;
const LANG_RE = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;

const FORWARD = new Set([
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "conversation.item.input_audio_transcription.delta",
  "conversation.item.input_audio_transcription.text",
  "conversation.item.input_audio_transcription.completed",
  "response.text.delta",
  "response.text.text",
  "response.text.done",
  "session.finished",
]);

function pick(ev: Record<string, unknown>) {
  const out: Record<string, unknown> = { type: ev.type };
  for (const k of ["item_id", "response_id", "delta", "text", "stash", "transcript", "language", "emotion"]) {
    if (typeof ev[k] === "string") out[k] = ev[k];
  }
  return out;
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if ((req.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return new Response(JSON.stringify({ error: "Expected a WebSocket connection" }), { status: 426, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);
  let upstream: WebSocket | null = null;
  let authed = false;
  let closed = false;
  let timer: number | undefined;

  const send = (msg: Record<string, unknown>) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(msg));
  };
  const shutdown = (reason?: string) => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    if (reason) send({ type: "relay.error", message: reason });
    try { upstream?.close(); } catch { /* already closed */ }
    try { client.close(); } catch { /* already closed */ }
  };

  const authTimer = setTimeout(() => { if (!authed) shutdown("Sign-in timed out."); }, 10000);

  const start = async (token: string, translateTo: string | null) => {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return shutdown("Please sign in again.");
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("action", "ai.live_session").gte("created_at", since);
    if ((count ?? 0) >= DAILY_SESSIONS) return shutdown(`You've reached today's limit of ${DAILY_SESSIONS} live practice sessions.`);
    const key = Deno.env.get("DASHSCOPE_API_KEY");
    if (!key) return shutdown("Live practice is not available right now.");

    await admin.from("audit_logs").insert({ user_id: user.id, actor_id: user.id, action: "ai.live_session", entity: "mock_interviews", details: { model: "qwen3.8-livetranslate-flash-realtime", translate_to: translateTo } });

    upstream = new WebSocket(UPSTREAM, { headers: { Authorization: `Bearer ${key}` } });
    upstream.on("open", () => {
      upstream!.send(JSON.stringify({
        type: "session.update",
        session: {
          output_modalities: ["text"],
          audio: { input: { turn_detection: { type: "server_vad", threshold: 0.5, silence_duration_ms: 1200 } } },
          ...(translateTo ? { translation: { language: translateTo } } : {}),
        },
      }));
      authed = true;
      clearTimeout(authTimer);
      timer = setTimeout(() => shutdown("Practice sessions are limited to 15 minutes. Start a new one to continue."), MAX_SESSION_MS);
      send({ type: "relay.ready" });
    });
    upstream.on("message", (data: unknown) => {
      try {
        const ev = JSON.parse(String(data));
        if (ev?.type === "error") {
          console.error("upstream error", ev.error);
          send({ type: "relay.warning", message: "The speech service had trouble with that. Keep going or restart the session." });
        } else if (FORWARD.has(ev?.type)) {
          send(pick(ev));
          if (ev.type === "session.finished") shutdown();
        }
      } catch (err) {
        console.error("bad upstream message", err);
      }
    });
    upstream.on("error", (err: unknown) => {
      console.error("upstream socket error", err);
      shutdown("Could not reach the speech service. Please try again.");
    });
    upstream.on("close", () => shutdown());
  };

  client.onmessage = (e) => {
    if (closed || typeof e.data !== "string" || e.data.length > MAX_AUDIO_CHUNK) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (!upstream) {
      if (msg.type !== "auth" || typeof msg.token !== "string") return shutdown("Please sign in again.");
      const t = typeof msg.translate_to === "string" && LANG_RE.test(msg.translate_to) ? msg.translate_to : null;
      client.onmessage = onAuthed;
      start(msg.token, t).catch((err) => { console.error("relay start failed", err); shutdown("Live practice is not available right now."); });
    }
  };

  const onAuthed = (e: MessageEvent) => {
    if (closed || !authed || !upstream || upstream.readyState !== WebSocket.OPEN) return;
    if (typeof e.data !== "string" || e.data.length > MAX_AUDIO_CHUNK) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "audio" && typeof msg.audio === "string" && /^[A-Za-z0-9+/=]+$/.test(msg.audio)) {
      upstream.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.audio }));
    } else if (msg.type === "finish") {
      upstream.send(JSON.stringify({ type: "session.finish" }));
    }
  };

  client.onclose = () => shutdown();
  client.onerror = () => shutdown();
  return response;
});
