import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";
import Select2 from "../components/Select2";
import {
  deckAuthSettings,
  generalSettings,
  providerSections,
  runtimeSettings,
  settingsTabs,
  widgetSettings,
  type SettingsField,
  type SettingsTabId,
} from "../data/settings-schema";
import { useSettings, useSaveSettings } from "../api/hooks";

function buildInitialValues() {
  const fields = [
    ...generalSettings,
    ...runtimeSettings,
    ...deckAuthSettings,
    ...widgetSettings,
    ...providerSections.flatMap((section) => section.fields),
  ];

  return Object.fromEntries(fields.map((field) => [field.key, field.value]));
}

const inputClassName =
  "w-full rounded border border-stroke bg-gray py-3 px-4.5 text-black focus:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:border-strokedark dark:bg-meta-4 dark:text-white dark:focus:border-primary";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [values, setValues] = useState<Record<string, string>>(buildInitialValues);

  // Fetch real settings from backend and merge into local state
  const { data: settingsData } = useSettings();
  const saveMutation = useSaveSettings();

  useEffect(() => {
    if (settingsData?.settings) {
      setValues((current) => {
        const next = { ...current };
        for (const s of settingsData.settings) {
          if (s.key in next) {
            next[s.key] = String(s.value);
          }
        }
        return next;
      });
    }
  }, [settingsData]);

  const updateValue = (key: string, value: string) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const SENSITIVE_KEYS = ["deck.adminPassword", "deck.jwtSecret", "codex.apiKey"];

  const getServerValue = (key: string): string | undefined => {
    const item = settingsData?.settings.find((s) => s.key === key);
    return item ? String(item.value) : undefined;
  };

  const handleSave = (fields: SettingsField[]) => {
    const payload: Record<string, string> = {};
    for (const field of fields) {
      const current = values[field.key] ?? field.value;
      const server = getServerValue(field.key) ?? field.value;
      if (current !== server) {
        payload[field.key] = current;
      }
    }

    if (Object.keys(payload).length === 0) {
      toast("Değişiklik yok", { icon: "\u2139\uFE0F" });
      return;
    }

    const hasSensitiveChange = Object.keys(payload).some((k) => SENSITIVE_KEYS.includes(k));
    if (hasSensitiveChange) {
      const ok = window.confirm(
        "Hassas alanlar (şifre, JWT secret, API key) değiştiriliyor. Değişiklik sunucu yeniden başlatıldıktan sonra geçerli olacak. Devam etmek istiyor musunuz?"
      );
      if (!ok) return;
    }

    saveMutation.mutate(payload, {
      onSuccess: (data) => {
        toast.success("Ayarlar kaydedildi");
        if (data.warnings && Array.isArray(data.warnings)) {
          for (const w of data.warnings) toast(w, { icon: "\u26A0\uFE0F" });
        }
      },
      onError: (err) => toast.error(`Kaydetme hatası: ${(err as Error).message}`),
    });
  };

  const renderField = (field: SettingsField) => {
    const value = values[field.key] ?? field.value;

    return (
      <div key={field.key} className="mb-5.5">
        <label className="mb-1 block text-sm font-medium text-black dark:text-white">
          {field.label}
        </label>
        <p className="mb-2 text-xs leading-5 text-bodydark2">{field.description}</p>

        {field.kind === "textarea" ? (
          <textarea
            rows={5}
            value={value}
            disabled={!field.editable}
            onChange={(event) => updateValue(field.key, event.target.value)}
            className={inputClassName}
          />
        ) : null}

        {field.kind === "select" && field.options ? (
          <Select2
            options={field.options}
            value={value}
            onChange={(nextValue) => updateValue(field.key, nextValue)}
            isDisabled={!field.editable}
          />
        ) : null}

        {field.kind === "text" ? (
          <input
            type="text"
            value={value}
            disabled={!field.editable}
            onChange={(event) => updateValue(field.key, event.target.value)}
            className={inputClassName}
          />
        ) : null}

        {field.kind === "password" ? (
          <input
            type="password"
            value={value}
            disabled={!field.editable}
            onChange={(event) => updateValue(field.key, event.target.value)}
            className={inputClassName}
          />
        ) : null}

        {field.kind === "number" ? (
          <input
            type="number"
            value={value}
            disabled={!field.editable}
            min={field.min}
            max={field.max}
            onChange={(event) => updateValue(field.key, event.target.value)}
            className={inputClassName}
          />
        ) : null}
      </div>
    );
  };

  const renderGeneralTab = () => (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="font-medium text-black dark:text-white">Genel Ayarlar</h3>
      </div>
      <div className="p-7">
        <div className="mb-6 rounded-sm border border-[#dcfce7] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534] dark:border-[#166534] dark:bg-[#166534]/20 dark:text-[#dcfce7]">
          Bu sekmedeki alanlar Redis&apos;e kaydedilir ve .env default&apos;larını runtime&apos;da ezer.
        </div>
        <div className="grid gap-x-6 md:grid-cols-2">
          {generalSettings.map(renderField)}
        </div>
        <button
          onClick={() => handleSave(generalSettings)}
          disabled={saveMutation.isPending}
          className="mt-2 flex justify-center rounded bg-primary px-6 py-2 font-medium text-gray hover:bg-opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );

  const renderRuntimeTab = () => (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="font-medium text-black dark:text-white">Runtime Ayarları</h3>
      </div>
      <div className="p-7">
        <div className="mb-6 rounded-sm border border-[#dcfce7] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534] dark:border-[#166534] dark:bg-[#166534]/20 dark:text-[#dcfce7]">
          Chat ayarları Redis&apos;e kaydedilir: sistem prompt&apos;u ve mesaj limiti.
        </div>
        {runtimeSettings.map(renderField)}
        <button
          onClick={() => handleSave(runtimeSettings)}
          disabled={saveMutation.isPending}
          className="flex justify-center rounded bg-primary px-6 py-2 font-medium text-gray hover:bg-opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );

  const renderProvidersTab = () => {
    const allProviderFields = providerSections.flatMap((s) => s.fields);
    return (
      <div className="space-y-6">
        {providerSections.map((section) => (
          <div
            key={section.id}
            className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark"
          >
            <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
              <h3 className="font-medium text-black dark:text-white">{section.title}</h3>
              <p className="mt-1 text-sm text-bodydark2">{section.description}</p>
            </div>
            <div className="p-7">
              <div className="mb-6 rounded-sm border border-[#dcfce7] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534] dark:border-[#166534] dark:bg-[#166534]/20 dark:text-[#dcfce7]">
                Provider ayarları Redis&apos;e kaydedilir ve .env default&apos;larını runtime&apos;da ezer.
              </div>
              <div className="grid gap-x-6 md:grid-cols-2">
                {section.fields.map(renderField)}
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={() => handleSave(allProviderFields)}
          disabled={saveMutation.isPending}
          className="flex justify-center rounded bg-primary px-6 py-2 font-medium text-gray hover:bg-opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Kaydediliyor..." : "Tüm Provider Ayarlarını Kaydet"}
        </button>
      </div>
    );
  };

  const renderDeckTab = () => (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="font-medium text-black dark:text-white">Deck Auth Ayarları</h3>
      </div>
      <div className="p-7">
        <div className="mb-6 rounded-sm border border-[#fef3c7] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e] dark:border-[#92400e] dark:bg-[#92400e]/20 dark:text-[#fef3c7]">
          Dikkat: Şifre veya JWT secret değişiklikleri sunucu yeniden başlatıldıktan sonra geçerli olur.
        </div>
        {deckAuthSettings.map(renderField)}
        <button
          onClick={() => handleSave(deckAuthSettings)}
          disabled={saveMutation.isPending}
          className="mt-2 flex justify-center rounded bg-primary px-6 py-2 font-medium text-gray hover:bg-opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );

  const renderWidgetTab = () => (
    <div className="space-y-6">
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">Widget Ayarları</h3>
        </div>
        <div className="p-7">
          <div className="mb-6 rounded-sm border border-[#dcfce7] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534] dark:border-[#166534] dark:bg-[#166534]/20 dark:text-[#dcfce7]">
            Widget ayarları Redis&apos;e kaydedilir ve anında etkili olur.
          </div>
          <div className="grid gap-x-6 md:grid-cols-2">
            {widgetSettings.map(renderField)}
          </div>
          <button
            onClick={() => handleSave(widgetSettings)}
            disabled={saveMutation.isPending}
            className="mt-2 flex justify-center rounded bg-primary px-6 py-2 font-medium text-gray hover:bg-opacity-90 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>

      {/* Embed Code */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">Embed Kodu</h3>
        </div>
        <div className="p-7">
          <p className="mb-4 text-sm text-bodydark2">
            Aşağıdaki kodu web sitenizin {'<body>'} etiketinin kapanışından hemen önce ekleyin:
          </p>
          <div className="relative">
            <pre className="overflow-auto rounded-lg bg-[#1e293b] p-4 text-sm text-[#e2e8f0]">
{`<script
  src="${window.location.origin}/widget/varien-chat-widget.js?v=1"
  data-gateway-url="${window.location.origin}">
</script>`}
            </pre>
            <button
              onClick={() => {
                const code = `<script\n  src="${window.location.origin}/widget/varien-chat-widget.js?v=1"\n  data-gateway-url="${window.location.origin}">\n</script>`;
                navigator.clipboard.writeText(code);
                toast.success("Embed kodu kopyalandı");
              }}
              className="absolute right-2 top-2 rounded bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
            >
              Kopyala
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return renderGeneralTab();
      case "runtime":
        return renderRuntimeTab();
      case "providers":
        return renderProvidersTab();
      case "deck":
        return renderDeckTab();
      case "widget":
        return renderWidgetTab();
      default:
        return null;
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 xl:col-span-3">
          <div className="rounded-sm border border-stroke bg-white py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <h4 className="mb-2 px-7.5 text-xl font-semibold text-black dark:text-white">
              Menü
            </h4>
            <div className="flex flex-col">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-7.5 py-3 text-left font-medium hover:bg-gray-2 dark:hover:bg-meta-4 ${
                    activeTab === tab.id
                      ? "bg-gray-2 text-primary dark:bg-meta-4"
                      : "text-bodydark2"
                  }`}
                >
                  <span className="block">{tab.label}</span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-bodydark2">
                    {tab.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="col-span-12 xl:col-span-9">{renderContent()}</div>
      </div>
    </>
  );
}
