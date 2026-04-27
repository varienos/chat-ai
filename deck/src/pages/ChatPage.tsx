import React, { useState, useRef, useEffect, useCallback } from "react";
import ChatBubble from "../components/Chat/ChatBubble";
import { streamChat } from "../api/hooks";

const PROVIDERS = ["OpenAI", "Anthropic", "Google"] as const;

const PROVIDER_MAP: Record<string, string> = {
  OpenAI: "codex",
  Anthropic: "claude",
  Google: "gemini",
};

interface Message {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  latencyMs?: number;
  createdAt: string;
}

const ChatPage = () => {
  const [provider, setProvider] = useState<string>(PROVIDERS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const userMsg: Message = {
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    const backendProvider = PROVIDER_MAP[provider];

    // Add user message + empty assistant message in a single state update
    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant" as const, content: "", provider: backendProvider, createdAt: new Date().toISOString() },
    ]);
    setInput("");
    setStreaming(true);

    try {
      await streamChat(
        { message: userMsg.content, sessionId, provider: backendProvider },
        (chunk) => {
          // Append chunk to the last assistant message
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            const msg = updated[lastIdx];
            if (msg?.role === "assistant") {
              updated[lastIdx] = { ...msg, content: msg.content + chunk };
            }
            return updated;
          });
        },
        (completedMsg) => {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === "assistant") {
              updated[lastIdx] = {
                role: "assistant",
                content: completedMsg.content,
                provider: completedMsg.provider,
                latencyMs: completedMsg.latencyMs,
                createdAt: completedMsg.createdAt,
              };
            }
            return updated;
          });
          setStreaming(false);
        },
        (errMsg) => {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === "assistant") {
              updated[lastIdx] = {
                role: "assistant",
                content: `Hata: ${errMsg}`,
                provider: backendProvider,
                createdAt: new Date().toISOString(),
              };
            }
            return updated;
          });
          setStreaming(false);
        },
      );
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === "assistant") {
          updated[lastIdx] = {
            role: "assistant",
            content: `Hata: ${(err as Error).message || "Bağlantı hatası"}`,
            provider: backendProvider,
            createdAt: new Date().toISOString(),
          };
        }
        return updated;
      });
      setStreaming(false);
    }

  }, [input, provider, streaming, sessionId]);

  return (
    <>
      <div className="flex h-[calc(100vh-180px)] flex-col border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark rounded-sm">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
            <div className="flex items-center gap-4">
                <h3 className="font-semibold text-black dark:text-white">Canlı Sohbet</h3>
                <div className="flex gap-2">
                    {PROVIDERS.map((p) => (
                        <button
                            key={p}
                            onClick={() => setProvider(p)}
                            type="button"
                            className={`text-xs px-3 py-1 rounded-full border transition ${
                                provider === p
                                    ? "bg-primary text-white border-primary"
                                    : "bg-transparent text-black dark:text-white border-stroke dark:border-strokedark hover:border-primary"
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-bodydark2">
               <span className="hidden sm:inline">Seçili:</span>
               <span className="font-medium text-black dark:text-white">{provider}</span>
            </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 dark:bg-boxdark-2">
            {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                    <p className="mb-2">Bir sağlayıcı seçin ve sohbete başlayın!</p>
                </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                    <ChatBubble key={idx} role={msg.role} content={msg.content} provider={msg.provider} latencyMs={msg.latencyMs} createdAt={msg.createdAt} />
                ))}
              </>
            )}

            {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex justify-start mb-4">
                    <div className="bg-white dark:bg-boxdark px-4 py-3 rounded-2xl rounded-bl-none shadow-sm border border-stroke dark:border-strokedark">
                        <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div className="border-t border-stroke p-4 dark:border-strokedark bg-white dark:bg-boxdark">
            <form onSubmit={sendMessage} className="relative">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Mesajınızı yazın..."
                    className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-14 outline-none focus:border-primary focus-visible:shadow-none dark:border-strokedark dark:bg-boxdark-2 dark:focus:border-primary text-black dark:text-white"
                />
                <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white hover:bg-opacity-90 disabled:bg-opacity-50 transition"
                >
                    <svg
                        className="fill-current"
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M19.1667 9.16666L2.5 0.833328C2.1875 0.677078 1.82292 0.729161 1.5625 0.989578C1.30208 1.25 1.25 1.61458 1.40625 1.92708L4.16667 9.99999L1.40625 18.0729C1.25 18.3854 1.30208 18.75 1.5625 19.0104C1.71875 19.1667 1.92708 19.25 2.13542 19.25C2.26042 19.25 2.38542 19.2187 2.5 19.1667L19.1667 10.8333C19.4271 10.7083 19.5833 10.4375 19.5833 10.1562C19.5833 9.87499 19.4271 9.60416 19.1667 9.16666ZM5.41667 10.8333L3.125 17.5208L16.4896 10.8333H5.41667ZM5.41667 9.16666H16.4896L3.125 2.47916L5.41667 9.16666Z"
                            fill=""
                        />
                    </svg>
                </button>
            </form>
        </div>
      </div>
    </>
  );
};

export default ChatPage;
