import React, { useState, useRef, useEffect } from "react";
import { Message, WidgetConfig } from "../types";
import {
    sendMessage,
    initializeGateway,
    resetSession,
} from "../services/gatewayService";

// Theme colors
interface ThemeColors {
    bg: string;
    bgSecondary: string;
    text: string;
    textSecondary: string;
    border: string;
    bubbleBg: string;
    bubbleBorder: string;
    bubbleText: string;
    inputBg: string;
    inputText: string;
    typingDot: string;
    poweredBy: string;
}

const themes: Record<"light" | "dark", ThemeColors> = {
    light: {
        bg: "#ffffff",
        bgSecondary: "#f8fafc",
        text: "#334155",
        textSecondary: "#94a3b8",
        border: "#e2e8f0",
        bubbleBg: "#ffffff",
        bubbleBorder: "#e2e8f0",
        bubbleText: "#334155",
        inputBg: "#f8fafc",
        inputText: "#334155",
        typingDot: "#818cf8",
        poweredBy: "#cbd5e1",
    },
    dark: {
        bg: "#1e1e2e",
        bgSecondary: "#2a2a3e",
        text: "#e2e8f0",
        textSecondary: "#94a3b8",
        border: "#3a3a52",
        bubbleBg: "#2a2a3e",
        bubbleBorder: "#3a3a52",
        bubbleText: "#e2e8f0",
        inputBg: "#2a2a3e",
        inputText: "#e2e8f0",
        typingDot: "#818cf8",
        poweredBy: "#64748b",
    },
};

// Inline styles to avoid external CSS dependencies
const getStyles = (t: ThemeColors) => ({
    container: {
        position: "fixed" as const,
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "flex-end",
        gap: "16px",
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    chatWindow: (isOpen: boolean, primaryColor: string) => ({
        transformOrigin: "bottom right",
        transition: "all 300ms ease-out",
        backgroundColor: t.bg,
        width: "380px",
        maxWidth: "calc(100vw - 48px)",
        height: "520px",
        maxHeight: "calc(100vh - 120px)",
        borderRadius: "16px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        border: `1px solid ${t.border}`,
        display: "flex",
        flexDirection: "column" as const,
        overflow: "hidden",
        opacity: isOpen ? 1 : 0,
        transform: isOpen
            ? "scale(1) translateY(0)"
            : "scale(0.95) translateY(40px)",
        pointerEvents: isOpen ? ("auto" as const) : ("none" as const),
        position: isOpen ? ("relative" as const) : ("absolute" as const),
    }),
    header: (primaryColor: string) => ({
        background: `linear-gradient(135deg, ${primaryColor}, ${adjustColor(primaryColor, -20)})`,
        padding: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
    }),
    headerInfo: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
    },
    avatar: {
        position: "relative" as const,
    },
    avatarCircle: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
    },
    onlineIndicator: (primaryColor: string) => ({
        position: "absolute" as const,
        bottom: 0,
        right: 0,
        width: "12px",
        height: "12px",
        backgroundColor: "#4ade80",
        border: `2px solid ${primaryColor}`,
        borderRadius: "50%",
    }),
    headerText: {
        title: {
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "18px",
            lineHeight: 1.2,
            margin: 0,
        },
        subtitle: {
            color: "rgba(255, 255, 255, 0.8)",
            fontSize: "12px",
            margin: 0,
        },
    },
    minimizeBtn: {
        color: "rgba(255, 255, 255, 0.8)",
        padding: "8px",
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    messagesArea: {
        flex: 1,
        overflowY: "auto" as const,
        padding: "16px",
        backgroundColor: t.bgSecondary,
        display: "flex",
        flexDirection: "column" as const,
        gap: "16px",
    },
    messageRow: (isUser: boolean) => ({
        display: "flex",
        width: "100%",
        justifyContent: isUser ? "flex-end" : "flex-start",
    }),
    messageBubble: (isUser: boolean, primaryColor: string) => ({
        maxWidth: "80%",
        borderRadius: "16px",
        padding: "12px",
        fontSize: "14px",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
        backgroundColor: isUser ? primaryColor : t.bubbleBg,
        color: isUser ? "#ffffff" : t.bubbleText,
        border: isUser ? "none" : `1px solid ${t.bubbleBorder}`,
        borderTopRightRadius: isUser ? "4px" : "16px",
        borderTopLeftRadius: isUser ? "16px" : "4px",
    }),
    messageText: {
        whiteSpace: "pre-wrap" as const,
        lineHeight: 1.5,
        margin: 0,
    },
    messageTime: (isUser: boolean) => ({
        fontSize: "10px",
        display: "block",
        marginTop: "4px",
        opacity: 0.7,
        color: isUser ? "rgba(255, 255, 255, 0.8)" : t.textSecondary,
    }),
    typingIndicator: {
        container: {
            backgroundColor: t.bubbleBg,
            border: `1px solid ${t.bubbleBorder}`,
            borderRadius: "16px",
            borderTopLeftRadius: "4px",
            padding: "16px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
        },
        dot: (delay: string) => ({
            width: "8px",
            height: "8px",
            backgroundColor: t.typingDot,
            borderRadius: "50%",
            animation: "varienBounce 1s infinite",
            animationDelay: delay,
        }),
    },
    inputArea: {
        padding: "16px",
        backgroundColor: t.bg,
        borderTop: `1px solid ${t.border}`,
    },
    inputForm: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        backgroundColor: t.inputBg,
        border: `1px solid ${t.border}`,
        borderRadius: "9999px",
        padding: "8px 16px",
    },
    input: {
        flex: 1,
        backgroundColor: "transparent",
        border: "none",
        outline: "none",
        color: t.inputText,
        fontSize: "14px",
    },
    sendButton: (
        hasText: boolean,
        isLoading: boolean,
        primaryColor: string,
    ) => ({
        padding: "8px",
        borderRadius: "50%",
        border: "none",
        cursor: hasText && !isLoading ? "pointer" : "not-allowed",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 200ms",
        backgroundColor: hasText && !isLoading ? primaryColor : t.border,
        color: hasText && !isLoading ? "#ffffff" : t.textSecondary,
    }),
    poweredBy: {
        textAlign: "center" as const,
        marginTop: "8px",
        fontSize: "10px",
        color: t.poweredBy,
    },
    fab: (isOpen: boolean, primaryColor: string) => ({
        width: "64px",
        height: "64px",
        borderRadius: "50%",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 300ms",
        backgroundColor: isOpen
            ? adjustColor(primaryColor, -10)
            : `${primaryColor}80`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
        color: "#ffffff",
    }),
});

// Helper function to darken/lighten colors
function adjustColor(color: string, amount: number): string {
    const hex = color.replace("#", "");
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Lightweight markdown to HTML — supports bold, italic, code, links, lists, headings, paragraphs */
function renderMarkdown(text: string): string {
    return text
        // Escape HTML
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        // Code blocks (``` ... ```)
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#1e293b;color:#e2e8f0;padding:8px 12px;border-radius:8px;overflow-x:auto;font-size:12px;margin:4px 0"><code>$2</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.08);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        // Italic
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        // Links (only http/https — block javascript: protocol)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">$1</a>')
        // Headings (### ## #)
        .replace(/^### (.+)$/gm, '<strong style="font-size:14px;display:block;margin:8px 0 4px">$1</strong>')
        .replace(/^## (.+)$/gm, '<strong style="font-size:15px;display:block;margin:8px 0 4px">$1</strong>')
        .replace(/^# (.+)$/gm, '<strong style="font-size:16px;display:block;margin:8px 0 4px">$1</strong>')
        // Unordered lists
        .replace(/^[-*] (.+)$/gm, '<div style="padding-left:12px">• $1</div>')
        // Ordered lists
        .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:12px">$1. $2</div>')
        // Line breaks
        .replace(/\n\n/g, '<div style="height:8px"></div>')
        .replace(/\n/g, "<br>");
}

// Inject keyframes + markdown styles for animation
const injectStyles = () => {
    if (typeof document === "undefined") return;
    if (document.getElementById("varien-chat-widget-styles")) return;

    const styleSheet = document.createElement("style");
    styleSheet.id = "varien-chat-widget-styles";
    styleSheet.textContent = `
    @keyframes varienBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-8px); }
    }
    .varien-chat-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .varien-chat-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .varien-chat-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 3px;
    }
    .varien-chat-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
    .varien-md p { margin: 0; }
    .varien-md pre { margin: 4px 0; }
    .varien-md strong { font-weight: 600; }
  `;
    document.head.appendChild(styleSheet);
};

interface ChatWidgetProps {
    config?: WidgetConfig;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ config }) => {
    const primaryColor = config?.primaryColor || "#6366f1";
    const theme = config?.theme || "light";
    const styles = getStyles(themes[theme]);
    const welcomeMessage =
        config?.welcomeMessage || "Hello! How can I help you today?";
    const title = config?.title || "Assistant";
    const subtitle = config?.subtitle || "Powered by Varien AI";

    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [inputText, setInputText] = useState("");
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            text: welcomeMessage,
            timestamp: new Date(),
        },
    ]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        injectStyles();
    }, []);

    useEffect(() => {
        if (config?.gatewayUrl && !isInitialized) {
            initializeGateway({
                gatewayUrl: config.gatewayUrl,
                apiToken: config.apiToken,
                provider: config.provider,
            });
            setIsInitialized(true);
        }
    }, [config, isInitialized]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, messages]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim() || isLoading) return;

        if (!isInitialized) {
            setError("Chat not initialized. Please check configuration.");
            return;
        }

        setError(null);

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: "user",
            text: inputText.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInputText("");
        setIsLoading(true);

        try {
            const assistantMsgId = crypto.randomUUID();
            // Add empty assistant message that will be filled by streaming
            setMessages(prev => [...prev, {
                id: assistantMsgId,
                role: "assistant" as const,
                text: "",
                timestamp: new Date(),
            }]);

            await sendMessage(
                userMsg.text,
                (partialText) => {
                    // onDelta — update the last message with streaming text
                    setMessages(prev => prev.map(m =>
                        m.id === assistantMsgId ? { ...m, text: partialText } : m
                    ));
                },
                (fullText) => {
                    // onCompleted — finalize message
                    setMessages(prev => prev.map(m =>
                        m.id === assistantMsgId ? { ...m, text: fullText } : m
                    ));
                },
                (errorMsg) => {
                    setError(errorMsg);
                    // Remove the empty assistant message on error
                    setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
                },
            );
        } catch (err) {
            console.error(err);
            setError("Mesaj gönderilemedi. Lütfen tekrar deneyin.");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleChat = () => setIsOpen(!isOpen);

    // SVG Icons
    const MessageIcon = () => (
        <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );

    const CloseIcon = () => (
        <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );

    const MinusIcon = () => (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );

    const SendIcon = () => (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    );

    const AssistantIcon = () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12C10.34 12 9 10.66 9 9C9 7.34 10.34 6 12 6ZM12 18C9.33 18 7 16.67 7 14.5H17C17 16.67 14.67 18 12 18Z" />
        </svg>
    );

    return (
        <div style={styles.container}>
            {/* Chat Window */}
            <div style={styles.chatWindow(isOpen, primaryColor)}>
                {/* Header */}
                <div style={styles.header(primaryColor)}>
                    <div style={styles.headerInfo}>
                        <div style={styles.avatar}>
                            <div style={styles.avatarCircle}>
                                <AssistantIcon />
                            </div>
                            <span
                                style={styles.onlineIndicator(primaryColor)}
                            />
                        </div>
                        <div>
                            <h3 style={styles.headerText.title}>{title}</h3>
                            <p style={styles.headerText.subtitle}>{subtitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={toggleChat}
                        style={styles.minimizeBtn}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor =
                                "rgba(255,255,255,0.1)")
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor =
                                "transparent")
                        }
                    >
                        <MinusIcon />
                    </button>
                </div>

                {/* Messages Area */}
                <div
                    style={styles.messagesArea}
                    className="varien-chat-scrollbar"
                >
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            style={styles.messageRow(msg.role === "user")}
                        >
                            <div
                                style={styles.messageBubble(
                                    msg.role === "user",
                                    primaryColor,
                                )}
                            >
                                <div className="varien-md" style={styles.messageText} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                                <span
                                    style={styles.messageTime(
                                        msg.role === "user",
                                    )}
                                >
                                    {msg.timestamp.toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div style={styles.messageRow(false)}>
                            <div style={styles.typingIndicator.container}>
                                <span
                                    style={styles.typingIndicator.dot("-0.3s")}
                                />
                                <span
                                    style={styles.typingIndicator.dot("-0.15s")}
                                />
                                <span
                                    style={styles.typingIndicator.dot("0s")}
                                />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div style={styles.messageRow(false)}>
                            <div
                                style={{
                                    ...styles.messageBubble(
                                        false,
                                        primaryColor,
                                    ),
                                    backgroundColor: "#fef2f2",
                                    borderColor: "#fecaca",
                                    color: "#dc2626",
                                }}
                            >
                                <p style={styles.messageText}>{error}</p>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div style={styles.inputArea}>
                    <form onSubmit={handleSendMessage} style={styles.inputForm}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Mesajınızı yazın..."
                            style={styles.input}
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!inputText.trim() || isLoading}
                            style={styles.sendButton(
                                !!inputText.trim(),
                                isLoading,
                                primaryColor,
                            )}
                        >
                            <SendIcon />
                        </button>
                    </form>
                    <div style={styles.poweredBy}>Powered by VARIEN AI</div>
                </div>
            </div>

            {/* Floating Action Button */}
            <button
                onClick={toggleChat}
                style={styles.fab(isOpen, primaryColor)}
                aria-label="Toggle Chat"
            >
                {isOpen ? (
                    <CloseIcon />
                ) : config?.fabIconUrl ? (
                    <img
                        src={config.fabIconUrl}
                        alt=""
                        style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }}
                    />
                ) : (
                    <MessageIcon />
                )}
            </button>
        </div>
    );
};
