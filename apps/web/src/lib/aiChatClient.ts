// AI chat client for the site-wide chat page (/chat).
// Talks to the site's own streaming endpoint (/api/demo/chat-ai), which proxies
// DashScope / Qwen on the server. The API key never reaches the browser.
//
// The endpoint returns plain-text token deltas (not SSE frames), so we just read
// the response body as a UTF-8 stream and emit each chunk via `onToken`.

export interface AiChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamAiOptions {
  onToken: (delta: string) => void;
  signal?: AbortSignal;
}

export async function streamAiChat(
  messages: AiChatMessage[],
  opts: StreamAiOptions,
): Promise<void> {
  const res = await fetch("/api/demo/chat-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let message = `AI 服务出错 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  if (!res.body) throw new Error("AI 服务未返回内容");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      if (pending) {
        opts.onToken(pending);
        pending = "";
      }
    }
    const tail = decoder.decode();
    if (tail) opts.onToken(tail);
  } finally {
    reader.releaseLock?.();
  }
}
