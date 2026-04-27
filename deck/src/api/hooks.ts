import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";

// ── Types ────────────────────────────────────────────────────────────

export interface ProviderStats {
  avgLatencyMs: number;
  errorRate: number;
  totalMessages: number;
  totalSessions: number;
}

export interface DailyVolume {
  count: number;
  date: string;
  provider: string;
}

export interface SessionStatsResponse {
  byProvider: Record<string, ProviderStats>;
  dailyVolume: DailyVolume[];
}

export interface VisitorMetadata {
  browser: string | null;
  city: string | null;
  country: string | null;
  deviceType: string | null;
  ip: string;
  os: string | null;
  userAgent: string;
}

export interface SessionRow {
  createdAt: string;
  id: string;
  lastActivityAt: string;
  messageCount: number;
  provider: string;
  status: string;
  summary: string | null;
  visitorMetadata: VisitorMetadata | null;
}

export interface SessionsResponse {
  sessions: SessionRow[];
  total: number;
  page: number;
  limit: number;
}

export interface SessionMessage {
  content: string;
  createdAt: string;
  id: string;
  latencyMs?: number;
  metadata: Record<string, unknown>;
  provider: string;
  role: "assistant" | "user";
  sessionId: string;
}

export interface SessionDetailResponse {
  session: SessionRow;
  messages: SessionMessage[];
}

export interface SettingItem {
  key: string;
  value: unknown;
  mutable: boolean;
  type?: string;
  min?: number;
  max?: number;
}

export interface SettingsResponse {
  settings: SettingItem[];
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useSessionStats(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery<SessionStatsResponse>({
    queryKey: ["session-stats", from, to],
    queryFn: () => client.get(`/deck/api/sessions/stats${qs ? `?${qs}` : ""}`),
  });
}

export function useSessions(opts: {
  page: number;
  limit: number;
  provider?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const params = new URLSearchParams({
    page: String(opts.page),
    limit: String(opts.limit),
  });
  if (opts.provider) params.set("provider", opts.provider);
  if (opts.status) params.set("status", opts.status);
  if (opts.sortBy) params.set("sortBy", opts.sortBy);
  if (opts.sortOrder) params.set("sortOrder", opts.sortOrder);
  return useQuery<SessionsResponse>({
    queryKey: ["sessions", opts],
    queryFn: () => client.get(`/deck/api/sessions?${params}`),
  });
}

export function useSessionDetail(id: string) {
  return useQuery<SessionDetailResponse>({
    queryKey: ["session", id],
    queryFn: () => client.get(`/deck/api/sessions/${id}`),
    enabled: !!id,
  });
}

export function useSettings() {
  return useQuery<SettingsResponse>({
    queryKey: ["settings"],
    queryFn: () => client.get("/deck/api/settings"),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      client.patch<{ updated: Record<string, string>; warnings?: string[] }>("/deck/api/settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useOpenApiSpec() {
  return useQuery<Record<string, unknown>>({
    queryKey: ["openapi-spec"],
    queryFn: () => client.get("/deck/api/openapi-spec"),
    staleTime: Infinity,
  });
}

// ── Knowledge Base ──────────────────────────────────────────────────

export interface KnowledgeFile {
  name: string;
  size: number;
  modifiedAt: string;
}

export function useKnowledgeFiles() {
  return useQuery<{ files: KnowledgeFile[] }>({
    queryKey: ["knowledge-files"],
    queryFn: () => client.get("/deck/api/knowledge"),
  });
}

export function useKnowledgeFile(filename: string) {
  return useQuery<{ name: string; content: string }>({
    queryKey: ["knowledge-file", filename],
    queryFn: () => client.get(`/deck/api/knowledge/${filename}`),
    enabled: !!filename,
  });
}

export function useSaveKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      client.put<{ ok: boolean; name: string }>(`/deck/api/knowledge/${filename}`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-files"] });
      qc.invalidateQueries({ queryKey: ["knowledge-file"] });
    },
  });
}

export function useDeleteKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) =>
      client.delete<{ ok: boolean }>(`/deck/api/knowledge/${filename}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge-files"] }),
  });
}

// ── SSE streaming (plain async, not a hook) ──────────────────────────

export async function streamChat(
  body: { message: string; sessionId: string; provider?: string },
  onDelta: (chunk: string) => void,
  onCompleted: (msg: SessionMessage) => void,
  onError: (err: string) => void,
) {
  let res: Response;
  try {
    res = await fetch("/deck/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
    });
  } catch (err) {
    onError((err as Error).message || "Network error");
    return;
  }

  if (res.status === 401) {
    window.location.href = "/deck/login";
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Stream failed" }));
    onError(err.message || `HTTP ${res.status}`);
    return;
  }

  if (!res.body) {
    onError("Response body is empty");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let completedReceived = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop()!; // keep incomplete line in buffer
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const raw = line.slice(6);
          try {
            const data = JSON.parse(raw);
            if (currentEvent === "assistant.delta" && typeof data.chunk === "string") {
              onDelta(data.chunk);
            } else if (currentEvent === "assistant.completed") {
              completedReceived = true;
              onCompleted(data.message);
            } else if (currentEvent === "error") {
              completedReceived = true;
              onError(data.message);
            }
          } catch {
            if (currentEvent === "assistant.completed" || currentEvent === "error") {
              completedReceived = true;
              onError("Received malformed response from server");
            }
          }
        }
      }
    }
  } catch (err) {
    onError((err as Error).message || "Stream interrupted");
    return;
  }

  if (!completedReceived) {
    onError("Stream ended unexpectedly");
  }
}
