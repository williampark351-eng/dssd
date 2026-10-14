const BASE_URL = "https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1";
const MODEL = "qwen3.8-flash";

export type ChatMessage = { role: "system" | "user"; content: string };

export async function qwenJson<T>(messages: ChatMessage[], maxTokens = 1200): Promise<T> {
  const key = Deno.env.get("DASHSCOPE_API_KEY");
  if (!key) throw new Error("AI is not configured");
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI returned no content");
  const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return JSON.parse(cleaned) as T;
}
