import React from "react";
import ReactDOM from "react-dom/client";
import { ChatWidget } from "./components/ChatWidget";
import { WidgetConfig } from "./types";

declare global {
  interface Window {
    VarienChatWidget: {
      init: (config: WidgetConfig) => void;
      destroy: () => void;
    };
    varienChatConfig?: WidgetConfig;
  }
}

let widgetRoot: ReactDOM.Root | null = null;
let widgetContainer: HTMLDivElement | null = null;
let activeConfig: WidgetConfig | null = null;
let observer: MutationObserver | null = null;

function ensureContainer(): HTMLDivElement {
  let container = document.getElementById("varien-chat-widget-root") as HTMLDivElement | null;
  if (!container) {
    container = document.createElement("div");
    container.id = "varien-chat-widget-root";
    // Use setAttribute to prevent frameworks from removing it
    container.setAttribute("data-varien-widget", "true");
    document.body.appendChild(container);
  }
  return container;
}

function renderWidget(config: WidgetConfig): void {
  widgetContainer = ensureContainer();
  widgetRoot = ReactDOM.createRoot(widgetContainer);
  widgetRoot.render(
    <React.StrictMode>
      <ChatWidget config={config} />
    </React.StrictMode>
  );
}

function startGuard(): void {
  // Watch for container removal (Next.js/SPA re-renders can remove it)
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    if (activeConfig && !document.getElementById("varien-chat-widget-root")) {
      // Container was removed — re-render
      renderWidget(activeConfig);
    }
  });
  observer.observe(document.body, { childList: true });
}

function init(config: WidgetConfig): void {
  destroy();
  activeConfig = config;

  fetch(`${config.gatewayUrl}/api/widget/config`)
    .then(async (r) => {
      if (!r.ok) {
        console.warn(`[varien-widget] Config endpoint returned HTTP ${r.status}`);
        return null;
      }
      try {
        return await r.json();
      } catch {
        console.warn("[varien-widget] Config response is not valid JSON");
        return null;
      }
    })
    .then((serverConfig) => {
      if (serverConfig && !serverConfig.enabled) {
        console.warn("[varien-widget] Widget is disabled by server");
        activeConfig = null;
        return;
      }

      const mergedConfig: WidgetConfig = {
        ...config,
        ...(serverConfig && {
          title: serverConfig.title || config.title,
          subtitle: serverConfig.subtitle || config.subtitle,
          welcomeMessage: serverConfig.welcomeMessage || config.welcomeMessage,
          primaryColor: serverConfig.primaryColor || config.primaryColor,
          position: serverConfig.position || config.position,
          theme: serverConfig.theme || config.theme,
          fabIconUrl: serverConfig.fabIconUrl || config.fabIconUrl,
        }),
      };

      activeConfig = mergedConfig;
      renderWidget(mergedConfig);
      startGuard();
    })
    .catch((err) => {
      console.warn("[varien-widget] Config fetch failed, using local config:", err);
      activeConfig = config;
      renderWidget(config);
      startGuard();
    });
}

function destroy(): void {
  activeConfig = null;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (widgetRoot) {
    widgetRoot.unmount();
    widgetRoot = null;
  }
  if (widgetContainer?.parentNode) {
    widgetContainer.parentNode.removeChild(widgetContainer);
    widgetContainer = null;
  }
}

window.VarienChatWidget = { init, destroy };

// Auto-init from data attributes
function autoInit(): void {
  if (window.varienChatConfig) {
    init(window.varienChatConfig);
    return;
  }

  const scriptTag = document.querySelector("script[data-gateway-url]");
  if (scriptTag) {
    const gatewayUrl = scriptTag.getAttribute("data-gateway-url");
    if (!gatewayUrl) {
      console.error("[varien-widget] data-gateway-url attribute is required");
      return;
    }
    init({
      gatewayUrl,
      apiToken: scriptTag.getAttribute("data-api-token") || undefined,
      provider: scriptTag.getAttribute("data-provider") || undefined,
      title: scriptTag.getAttribute("data-title") || undefined,
      subtitle: scriptTag.getAttribute("data-subtitle") || undefined,
      welcomeMessage: scriptTag.getAttribute("data-welcome-message") || undefined,
      primaryColor: scriptTag.getAttribute("data-primary-color") || undefined,
      position: (scriptTag.getAttribute("data-position") as any) || undefined,
      theme: (scriptTag.getAttribute("data-theme") as any) || undefined,
      fabIconUrl: scriptTag.getAttribute("data-fab-icon-url") || undefined,
    });
  }
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    setTimeout(autoInit, 0);
  }
}

export { init, destroy };
