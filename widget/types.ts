export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export interface WidgetConfig {
  gatewayUrl: string;
  apiToken?: string;
  provider?: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  primaryColor?: string;
  position?: "bottom-right" | "bottom-left";
  theme?: "light" | "dark";
  fabIconUrl?: string;
}
