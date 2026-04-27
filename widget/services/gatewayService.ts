export interface GatewayConfig {
  gatewayUrl: string;
  apiToken?: string;
  provider?: string;
}

let config: GatewayConfig | null = null;
let sessionId: string | null = null;

interface StreamState {
  completed: boolean;
  currentEvent: string;
  fullText: string;
}

export function initializeGateway(userConfig: GatewayConfig): void {
  config = userConfig;
  sessionId = crypto.randomUUID();
}

export function resetSession(): void {
  sessionId = crypto.randomUUID();
}

function processSseLines(
  lines: string[],
  state: StreamState,
  onDelta: (chunk: string) => void,
  onCompleted: (fullText: string) => void,
  onError: (error: string) => void,
): boolean {
  for (const line of lines) {
    if (line.startsWith("event: ")) {
      state.currentEvent = line.slice(7).trim();
      continue;
    }

    if (!line.startsWith("data: ")) {
      continue;
    }

    try {
      const data = JSON.parse(line.slice(6));

      if (state.currentEvent === "assistant.delta" && typeof data.chunk === "string") {
        state.fullText += data.chunk;
        onDelta(state.fullText);
      } else if (state.currentEvent === "assistant.completed") {
        state.completed = true;
        state.fullText = data.message?.content || state.fullText;
        onCompleted(state.fullText);
        return true;
      } else if (state.currentEvent === "error") {
        onError(data.message || "Bir hata oluştu");
        return true;
      }
    } catch {
      if (state.currentEvent === "assistant.completed" || state.currentEvent === "error") {
        onError("Received malformed response from server");
        return true;
      }

      console.warn("[varien-widget] Failed to parse SSE data:", line.slice(6));
    }
  }

  return false;
}

export async function sendMessage(
  text: string,
  onDelta: (chunk: string) => void,
  onCompleted: (fullText: string) => void,
  onError: (error: string) => void,
): Promise<void> {
  if (!config) throw new Error("Gateway not initialized");
  if (!sessionId) sessionId = crypto.randomUUID();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiToken) {
    headers["Authorization"] = `Bearer ${config.apiToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${config.gatewayUrl}/api/widget/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: text,
        sessionId,
        provider: config.provider,
      }),
    });
  } catch (err) {
    console.error("[varien-widget] Fetch failed:", err);
    onError("Bağlantı hatası. Lütfen tekrar deneyin.");
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "İstek başarısız" }));
    onError(err.message || `HTTP ${res.status}`);
    return;
  }

  if (!res.body) {
    onError("Yanıt boş");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state: StreamState = {
    completed: false,
    currentEvent: "",
    fullText: "",
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      if (processSseLines(lines, state, onDelta, onCompleted, onError)) {
        return;
      }
    }
  } catch (err) {
    console.error("[varien-widget] Stream read failed:", err);
    onError("Bağlantı kesildi. Lütfen tekrar deneyin.");
    return;
  }

  if (buffer && processSseLines([buffer], state, onDelta, onCompleted, onError)) {
    return;
  }

  if (!state.completed) {
    onError("Stream completed without assistant.completed event");
  }
}
