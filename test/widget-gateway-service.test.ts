import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initializeGateway, sendMessage } from "../widget/services/gatewayService.js";

function createSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
    },
    status: 200,
  });
}

describe("widget gateway service SSE handling", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    initializeGateway({
      gatewayUrl: "https://example.test",
      provider: "gemini",
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("treats streams without assistant.completed as an error", async () => {
    fetchMock.mockResolvedValue(
      createSseResponse([
        'event: assistant.delta\n',
        'data: {"chunk":"Merhaba"}\n\n',
      ]),
    );

    const deltas: string[] = [];
    const completed: string[] = [];
    const errors: string[] = [];

    await sendMessage(
      "selam",
      (chunk) => deltas.push(chunk),
      (fullText) => completed.push(fullText),
      (error) => errors.push(error),
    );

    expect(deltas).toEqual(["Merhaba"]);
    expect(completed).toEqual([]);
    expect(errors).toEqual(["Stream completed without assistant.completed event"]);
  });

  it("parses a buffered assistant.completed event before EOF", async () => {
    fetchMock.mockResolvedValue(
      createSseResponse([
        'event: assistant.completed\ndata: {"message":{"content":"Tamamlandi"}}',
      ]),
    );

    const completed: string[] = [];
    const errors: string[] = [];

    await sendMessage(
      "selam",
      () => undefined,
      (fullText) => completed.push(fullText),
      (error) => errors.push(error),
    );

    expect(completed).toEqual(["Tamamlandi"]);
    expect(errors).toEqual([]);
  });

  it("parses a buffered error event before EOF", async () => {
    fetchMock.mockResolvedValue(
      createSseResponse([
        'event: error\ndata: {"message":"Proxy kesildi"}',
      ]),
    );

    const completed: string[] = [];
    const errors: string[] = [];

    await sendMessage(
      "selam",
      () => undefined,
      (fullText) => completed.push(fullText),
      (error) => errors.push(error),
    );

    expect(completed).toEqual([]);
    expect(errors).toEqual(["Proxy kesildi"]);
  });
});
