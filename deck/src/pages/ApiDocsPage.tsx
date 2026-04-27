import { useState } from 'react';
import { useOpenApiSpec } from '../api/hooks';

const ENDPOINTS = [
  {
    method: 'POST',
    path: '/api/v1/chat/completions',
    description: 'Chat completion isteği gönderir. OpenAI uyumlu format.',
    methodColor: 'bg-success',
  },
  {
    method: 'GET',
    path: '/api/v1/sessions',
    description: 'Tüm oturumları listeler. Filtreleme ve sayfalama destekler.',
    methodColor: 'bg-primary',
  },
  {
    method: 'GET',
    path: '/api/v1/sessions/:id',
    description: 'Belirli bir oturumun detaylarını ve mesaj geçmişini döner.',
    methodColor: 'bg-primary',
  },
  {
    method: 'GET',
    path: '/api/v1/providers',
    description: 'Yapılandırılmış AI sağlayıcılarını ve durumlarını listeler.',
    methodColor: 'bg-primary',
  },
  {
    method: 'POST',
    path: '/api/v1/providers',
    description: 'Yeni bir AI sağlayıcısı ekler.',
    methodColor: 'bg-success',
  },
  {
    method: 'PUT',
    path: '/api/v1/providers/:id',
    description: 'Mevcut bir sağlayıcının konfigürasyonunu günceller.',
    methodColor: 'bg-warning',
  },
  {
    method: 'DELETE',
    path: '/api/v1/providers/:id',
    description: 'Bir sağlayıcıyı kaldırır.',
    methodColor: 'bg-danger',
  },
  {
    method: 'GET',
    path: '/api/v1/stats',
    description: 'Dashboard istatistiklerini döner (oturum, mesaj, latency).',
    methodColor: 'bg-primary',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/login',
    description: 'Kullanıcı girişi. JWT token döner.',
    methodColor: 'bg-success',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/refresh',
    description: 'Access token yeniler.',
    methodColor: 'bg-success',
  },
];

const ApiDocsPage = () => {
  const { data: spec, isLoading } = useOpenApiSpec();
  const [specOpen, setSpecOpen] = useState(false);

  return (
    <>
      {/* Overview */}
      <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-3 text-xl font-semibold text-black dark:text-white">
          Deck AI Gateway API
        </h3>
        <p className="mb-4 text-bodydark2">
          Deck API, AI sağlayıcılarına (OpenAI, Anthropic, Google) unified bir arayüz sunar.
          Tüm istekler <code className="rounded bg-gray-2 px-1.5 py-0.5 text-sm text-primary dark:bg-meta-4">Authorization: Bearer {'<token>'}</code> header'ı gerektirir.
        </p>
        <div className="flex flex-wrap gap-3">
          <span className="rounded bg-gray-2 px-3 py-1 text-sm dark:bg-meta-4">
            Base URL: <code className="text-primary">/api/v1</code>
          </span>
          <span className="rounded bg-gray-2 px-3 py-1 text-sm dark:bg-meta-4">
            Format: <code className="text-primary">JSON</code>
          </span>
          <span className="rounded bg-gray-2 px-3 py-1 text-sm dark:bg-meta-4">
            Auth: <code className="text-primary">JWT Bearer</code>
          </span>
        </div>
      </div>

      {/* Endpoints */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke py-4 px-7 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            Endpoints
          </h3>
        </div>
        <div className="p-4">
          {ENDPOINTS.map((ep, idx) => (
            <div
              key={idx}
              className="mb-3 flex flex-col gap-2 rounded border border-stroke p-4 hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4 sm:flex-row sm:items-center sm:gap-4"
            >
              <span
                className={`inline-flex w-fit rounded px-2.5 py-0.5 text-xs font-bold text-white ${ep.methodColor}`}
              >
                {ep.method}
              </span>
              <code className="text-sm font-semibold text-black dark:text-white">
                {ep.path}
              </code>
              <span className="text-sm text-bodydark2 sm:ml-auto">
                {ep.description}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Example */}
      <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke py-4 px-7 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            Kullanım Örneği
          </h3>
        </div>
        <div className="p-7">
          <pre className="overflow-x-auto rounded bg-gray-2 p-4 text-sm dark:bg-meta-4">
            <code className="text-black dark:text-white">{`curl -X POST /api/v1/chat/completions \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "openai",
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Merhaba!"}
    ],
    "temperature": 0.7
  }'`}</code>
          </pre>
        </div>
      </div>

      {/* OpenAPI Spec */}
      <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <button
          onClick={() => setSpecOpen(!specOpen)}
          className="flex w-full items-center justify-between border-b border-stroke py-4 px-7 dark:border-strokedark"
        >
          <h3 className="font-medium text-black dark:text-white">
            OpenAPI Spec (JSON)
          </h3>
          <svg
            className={`fill-current transition-transform ${specOpen ? 'rotate-180' : ''}`}
            width="20"
            height="20"
            viewBox="0 0 20 20"
          >
            <path d="M10 13.75L3.75 7.5L5 6.25L10 11.25L15 6.25L16.25 7.5L10 13.75Z" />
          </svg>
        </button>
        {specOpen && (
          <div className="p-7">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : spec ? (
              <pre className="max-h-[500px] overflow-auto rounded bg-gray-2 p-4 text-xs dark:bg-meta-4">
                <code className="text-black dark:text-white">{JSON.stringify(spec, null, 2)}</code>
              </pre>
            ) : (
              <p className="text-bodydark2">OpenAPI spec yüklenemedi.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default ApiDocsPage;
