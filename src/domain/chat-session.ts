import type { ProviderName } from "./providers.js";

export type ChatRole = "assistant" | "user";

export type SessionStatus = "active" | "completed" | "error";

export interface VisitorMetadata {
  browser: string | null;
  city: string | null;
  country: string | null;
  deviceType: string | null;
  ip: string;
  os: string | null;
  userAgent: string;
}

export interface SessionRecord {
  createdAt: string;
  id: string;
  lastActivityAt: string;
  messageCount: number;
  provider: ProviderName;
  status: SessionStatus;
  summary: string | null;
  visitorMetadata: VisitorMetadata | null;
}

export interface StoredChatMessage {
  content: string;
  createdAt: string;
  id: string;
  latencyMs?: number;
  metadata: Record<string, unknown>;
  provider: ProviderName;
  role: ChatRole;
  sessionId: string;
}

export interface NewChatMessage {
  content: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  provider: ProviderName;
  role: ChatRole;
}
