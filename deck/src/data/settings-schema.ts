export interface SelectOption {
  label: string;
  value: string;
}

export type SettingsTabId = "general" | "runtime" | "providers" | "deck" | "widget";
export type SettingsFieldKind =
  | "text"
  | "number"
  | "password"
  | "select"
  | "textarea";
export interface SettingsTab {
  description: string;
  id: SettingsTabId;
  label: string;
}

export interface SettingsField {
  description: string;
  editable: boolean;
  key: string;
  kind: SettingsFieldKind;
  label: string;
  max?: number;
  min?: number;
  options?: SelectOption[];
  value: string;
}

export interface ProviderSection {
  description: string;
  fields: SettingsField[];
  id: "codex" | "claude" | "gemini";
  title: string;
}

const LOG_LEVEL_OPTIONS: SelectOption[] = [
  { value: "info", label: "Info" },
  { value: "debug", label: "Debug" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

export const settingsTabs: SettingsTab[] = [
  {
    id: "general",
    label: "Genel",
    description: "Provider seçimi, loglama ve güvenlik limitleri.",
  },
  {
    id: "runtime",
    label: "Runtime",
    description: "Chat ayarları — sistem prompt ve mesaj limiti.",
  },
  {
    id: "providers",
    label: "Providerlar",
    description: "Codex, Claude ve Gemini provider yapılandırmaları.",
  },
  {
    id: "deck",
    label: "Deck Auth",
    description: "Deck admin paneli kimlik doğrulama ayarları (salt okunur).",
  },
  {
    id: "widget",
    label: "Widget",
    description: "Web sitesine yerleştirilecek chat widget ayarları ve embed kodu.",
  },
];

export const generalSettings: SettingsField[] = [
  {
    key: "logging.level",
    label: "Log Level",
    description: "Gateway log seviyesi.",
    editable: true,
    kind: "select",
    options: LOG_LEVEL_OPTIONS,
    value: "info",
  },
  {
    key: "security.rateLimitMaxRequests",
    label: "Rate Limit - Maks İstek",
    description: "Belirli zaman penceresi içinde izin verilen maksimum API isteği sayısı.",
    editable: true,
    kind: "number",
    min: 1,
    value: "30",
  },
  {
    key: "security.rateLimitWindowMs",
    label: "Rate Limit - Pencere (ms)",
    description: "Rate limit penceresi (milisaniye). Örn: 60000 = 1 dakika.",
    editable: true,
    kind: "number",
    min: 1000,
    value: "60000",
  },
  {
    key: "security.requestBodyLimitBytes",
    label: "Request Body Limit (byte)",
    description: "Gelen isteklerin maksimum gövde boyutu. Varsayılan: 1 MB.",
    editable: true,
    kind: "number",
    min: 1024,
    value: "1048576",
  },
];

export const runtimeSettings: SettingsField[] = [
  {
    key: "chat.systemPrompt",
    label: "System Prompt (Fallback)",
    description: "Knowledge base'de system-prompt.md varsa o kullanılır. Bu alan yalnızca dosya yoksa devreye giren yedek prompt'tur.",
    editable: true,
    kind: "textarea",
    value:
      "Sen Varien'in AI asistanısın. Müşteri sorularını yanıtla.",
  },
  {
    key: "chat.recentMessageLimit",
    label: "Recent Message Limit",
    description: "Prompt'a dahil edilen son mesaj sayısı.",
    editable: true,
    kind: "number",
    min: 1,
    max: 100,
    value: "12",
  },
];

export const providerSections: ProviderSection[] = [
  {
    id: "codex",
    title: "Codex",
    description: "src/config/env.ts icindeki codex config alanlari.",
    fields: [
      {
        key: "codex.authMode",
        label: "Auth Mode",
        description: "oauth veya api_key. OPENAI tabanli auth yalnizca Codex icin tanimli.",
        editable: true,
        kind: "select",
        options: [
          { value: "oauth", label: "oauth" },
          { value: "api_key", label: "api_key" },
        ],
            value: "oauth",
      },
      {
        key: "codex.apiKey",
        label: "Codex OpenAI API Key",
        description: "CODEX_OPENAI_API_KEY veya OPENAI_API_KEY uzerinden okunur.",
        editable: true,
        kind: "password",
            value: "configured-placeholder",
      },
      {
        key: "codex.model",
        label: "Model",
        description: "CODEX_MODEL karsiligi.",
        editable: true,
        kind: "text",
            value: "gpt-5-codex",
      },
      {
        key: "codex.sandbox",
        label: "Sandbox",
        description: "read-only, workspace-write veya danger-full-access.",
        editable: true,
        kind: "select",
        options: [
          { value: "read-only", label: "read-only" },
          { value: "workspace-write", label: "workspace-write" },
          { value: "danger-full-access", label: "danger-full-access" },
        ],
            value: "read-only",
      },
      {
        key: "codex.skipGitRepoCheck",
        label: "Skip Git Repo Check",
        description: "CLI cagrisi oncesinde repo kontrolunun atlanip atlanmayacagi.",
        editable: true,
        kind: "select",
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
            value: "true",
      },
      {
        key: "codex.enableDangerousBypass",
        label: "Enable Dangerous Bypass",
        description: "Codex CLI icin tehlikeli bypass modu.",
        editable: true,
        kind: "select",
        options: [
          { value: "false", label: "false" },
          { value: "true", label: "true" },
        ],
            value: "false",
      },
      {
        key: "codex.timeoutMs",
        label: "Timeout Ms",
        description: "Provider komut zaman asimi.",
        editable: true,
        kind: "number",
        min: 1000,
            value: "60000",
      },
      {
        key: "codex.binaryPath",
        label: "Binary Path",
        description: "Calistirilacak codex binary yolu.",
        editable: true,
        kind: "text",
            value: "codex",
      },
      {
        key: "codex.workingDirectory",
        label: "Working Directory",
        description: "CLI komutlari icin kullandigi calisma dizini.",
        editable: true,
        kind: "text",
            value: "/workspace/varien-ai-gateway",
      },
    ],
  },
  {
    id: "claude",
    title: "Claude",
    description: "Claude provider icin gercek config alanlari.",
    fields: [
      {
        key: "claude.model",
        label: "Model",
        description: "CLAUDE_MODEL karsiligi.",
        editable: true,
        kind: "text",
            value: "claude-3-7-sonnet",
      },
      {
        key: "claude.permissionMode",
        label: "Permission Mode",
        description: "Claude CLI icin permission mode.",
        editable: true,
        kind: "select",
        options: [
          { value: "plan", label: "plan" },
          { value: "default", label: "default" },
          { value: "auto", label: "auto" },
          { value: "dontAsk", label: "dontAsk" },
          { value: "acceptEdits", label: "acceptEdits" },
          { value: "bypassPermissions", label: "bypassPermissions" },
        ],
            value: "plan",
      },
      {
        key: "claude.includePartialMessages",
        label: "Include Partial Messages",
        description: "Streaming sirasinda partial mesajlarin dahil edilmesi.",
        editable: true,
        kind: "select",
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
            value: "true",
      },
      {
        key: "claude.timeoutMs",
        label: "Timeout Ms",
        description: "Claude komut zaman asimi.",
        editable: true,
        kind: "number",
        min: 1000,
            value: "60000",
      },
      {
        key: "claude.binaryPath",
        label: "Binary Path",
        description: "Claude binary yolu.",
        editable: true,
        kind: "text",
            value: "claude",
      },
      {
        key: "claude.workingDirectory",
        label: "Working Directory",
        description: "Claude cagrilarinin calistigi dizin.",
        editable: true,
        kind: "text",
            value: "/workspace/varien-ai-gateway",
      },
    ],
  },
  {
    id: "gemini",
    title: "Gemini",
    description: "Gemini provider icin gercek config alanlari.",
    fields: [
      {
        key: "gemini.model",
        label: "Model",
        description: "GEMINI_MODEL karsiligi.",
        editable: true,
        kind: "text",
            value: "gemini-2.0-flash",
      },
      {
        key: "gemini.approvalMode",
        label: "Approval Mode",
        description: "Gemini CLI approval mode degeri.",
        editable: true,
        kind: "select",
        options: [
          { value: "plan", label: "plan" },
          { value: "default", label: "default" },
          { value: "auto_edit", label: "auto_edit" },
          { value: "yolo", label: "yolo" },
        ],
            value: "plan",
      },
      {
        key: "gemini.sandbox",
        label: "Sandbox",
        description: "Gemini sandbox bayragi.",
        editable: true,
        kind: "select",
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
            value: "false",
      },
      {
        key: "gemini.timeoutMs",
        label: "Timeout Ms",
        description: "Gemini komut zaman asimi.",
        editable: true,
        kind: "number",
        min: 1000,
            value: "60000",
      },
      {
        key: "gemini.binaryPath",
        label: "Binary Path",
        description: "Gemini binary yolu.",
        editable: true,
        kind: "text",
            value: "gemini",
      },
      {
        key: "gemini.workingDirectory",
        label: "Working Directory",
        description: "Gemini cagrilarinin calistigi dizin.",
        editable: true,
        kind: "text",
            value: "/workspace/varien-ai-gateway",
      },
    ],
  },
];

export const widgetSettings: SettingsField[] = [
  {
    key: "widget.enabled",
    label: "Widget Aktif",
    description: "Chat widget'ın web sitesinde görünüp görünmeyeceğini belirler.",
    editable: true,
    kind: "select",
    options: [
      { value: "true", label: "Aktif" },
      { value: "false", label: "Pasif" },
    ],
    value: "false",
  },
  {
    key: "widget.title",
    label: "Başlık",
    description: "Widget header'ında görünen başlık.",
    editable: true,
    kind: "text",
    value: "Varien AI Asistan",
  },
  {
    key: "widget.subtitle",
    label: "Alt Başlık",
    description: "Başlığın altında görünen kısa açıklama.",
    editable: true,
    kind: "text",
    value: "Size nasıl yardımcı olabilirim?",
  },
  {
    key: "widget.welcomeMessage",
    label: "Karşılama Mesajı",
    description: "Widget açıldığında gösterilen ilk mesaj.",
    editable: true,
    kind: "textarea",
    value: "Merhaba! 👋 Mobil uygulama, web geliştirme veya yapay zeka projeleriniz hakkında sorularınızı yanıtlayabilirim.",
  },
  {
    key: "widget.primaryColor",
    label: "Ana Renk",
    description: "Widget'ın tema rengi (hex kodu).",
    editable: true,
    kind: "text",
    value: "#AA0B5A",
  },
  {
    key: "widget.position",
    label: "Pozisyon",
    description: "Widget'ın sayfadaki konumu.",
    editable: true,
    kind: "select",
    options: [
      { value: "bottom-right", label: "Sağ Alt" },
      { value: "bottom-left", label: "Sol Alt" },
    ],
    value: "bottom-right",
  },
  {
    key: "widget.theme",
    label: "Tema",
    description: "Widget'ın renk teması.",
    editable: true,
    kind: "select",
    options: [
      { value: "light", label: "Açık (Light)" },
      { value: "dark", label: "Koyu (Dark)" },
    ],
    value: "light",
  },
  {
    key: "widget.fabIconUrl",
    label: "Buton İkonu (URL)",
    description: "Sağ alttaki chat butonunda gösterilecek ikon URL'i. Boş bırakılırsa varsayılan mesaj ikonu kullanılır.",
    editable: true,
    kind: "text",
    value: "",
  },
];

export const deckAuthSettings: SettingsField[] = [
  {
    key: "deck.adminUser",
    label: "Deck Admin User",
    description: "DECK_ADMIN_USER ile belirlenen admin kullanicisi.",
    editable: true,
    kind: "text",
    value: "admin",
  },
  {
    key: "deck.adminPassword",
    label: "Deck Admin Password",
    description: "Login endpoint'inin kontrol ettigi admin sifresi.",
    editable: true,
    kind: "password",
    value: "password-placeholder",
  },
  {
    key: "deck.jwtSecret",
    label: "Deck JWT Secret",
    description: "Deck JWT token imzalamak icin kullanilan secret.",
    editable: true,
    kind: "password",
    value: "jwt-secret-placeholder",
  },
];
