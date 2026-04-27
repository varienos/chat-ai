import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  latencyMs?: number;
  createdAt: string;
}

const ChatBubble = ({ role, content, provider, latencyMs, createdAt }: ChatBubbleProps) => {
  const isUser = role === "user";
  const badgeCls = `rounded-full px-2 py-0.5 ${isUser ? "bg-white/20" : "bg-black/5 dark:bg-white/10"}`;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
        <div
            className={`max-w-[70%] rounded-2xl px-5 py-3.5 shadow-md ${
                isUser
                    ? "bg-primary text-white rounded-br-none"
                    : "bg-white text-black dark:bg-boxdark dark:text-white dark:border dark:border-strokedark rounded-bl-none"
            }`}
        >
            {isUser ? (
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{content}</p>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-table:my-2 prose-pre:my-2 prose-pre:bg-black/10 prose-pre:dark:bg-black/30 prose-pre:rounded-lg prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1 prose-th:text-left">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
            <div
                className={`flex items-center justify-end gap-2 mt-2 text-xs font-medium opacity-70 ${
                    isUser ? "text-white" : "text-black dark:text-white"
                }`}
            >
                {provider && (
                  <span className={`${badgeCls} uppercase tracking-wider`}>{provider}</span>
                )}
                {latencyMs != null && (
                  <span className={badgeCls}>{latencyMs}ms</span>
                )}
                <span className={badgeCls}>{new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        </div>
    </div>
  );
};

export default ChatBubble;
