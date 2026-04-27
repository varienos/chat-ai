const PROVIDER_COLORS: Record<string, string> = {
  codex: "bg-[#dcfce7] text-[#166534] dark:bg-[#166534] dark:text-[#bbf7d0]",
  claude: "bg-[#dbeafe] text-[#1e40af] dark:bg-[#1e40af] dark:text-[#bfdbfe]",
  gemini: "bg-[#fef3c7] text-[#92400e] dark:bg-[#92400e] dark:text-[#fde68a]",
  openai: "bg-[#dcfce7] text-[#166534] dark:bg-[#166534] dark:text-[#bbf7d0]",
  anthropic: "bg-[#dbeafe] text-[#1e40af] dark:bg-[#1e40af] dark:text-[#bfdbfe]",
  google: "bg-[#fef3c7] text-[#92400e] dark:bg-[#92400e] dark:text-[#fde68a]",
};

interface ProviderBadgeProps {
  provider: string;
  status?: "active" | "inactive";
}

export default function ProviderBadge({ provider, status }: ProviderBadgeProps) {
  const colorClass = PROVIDER_COLORS[provider.toLowerCase()] ?? "bg-gray-100 text-gray-800 dark:bg-meta-4 dark:text-white";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded py-1 px-3 text-xs font-medium ${colorClass}`}>
      {status && (
        <span className={`h-2 w-2 rounded-full ${status === "active" ? "bg-success" : "bg-danger"}`}></span>
      )}
      {provider}
    </span>
  );
}
