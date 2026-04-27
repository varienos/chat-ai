import { Link, useParams, Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ProviderBadge from '../components/ProviderBadge';
import { useSessionDetail } from '../api/hooks';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-[#dcfce7] text-[#166534]",
    completed: "bg-[#fef3c7] text-[#92400e]",
    error: "bg-[#fee2e2] text-[#991b1b]",
  };
  const cls = colors[status] ?? colors.active;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

const SessionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useSessionDetail(id ?? "");

  if (!id) return <Navigate to="/sessions" />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <p className="text-danger">Oturum detayı yüklenirken hata oluştu: {(error as Error)?.message ?? "Veri bulunamadı"}</p>
        <Link to="/sessions" className="mt-4 inline-block text-primary hover:underline">Oturumlara Dön</Link>
      </div>
    );
  }

  const { session, messages } = data;
  const withLatency = messages.filter((m) => m.role === "assistant" && m.latencyMs != null);
  const avgLatency = withLatency.length > 0
    ? Math.round(withLatency.reduce((sum, m) => sum + (m.latencyMs ?? 0), 0) / withLatency.length)
    : 0;

  return (
    <>
      {/* Session Info Card */}
      <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">
              Session #{session.id.slice(0, 8)}
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-bodydark2">
              <ProviderBadge provider={session.provider} status="active" />
              <StatusBadge status={session.status} />
              <span>{session.messageCount} mesaj</span>
              <span>{new Date(session.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <Link
            to="/sessions"
            className="inline-flex items-center gap-2 rounded border border-stroke py-2 px-4 text-sm font-medium hover:shadow-1 dark:border-strokedark"
          >
            <svg className="fill-current" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.25 6.5625H3.38125L6.89375 3.05C7.1375 2.80625 7.1375 2.40625 6.89375 2.1625C6.65 1.91875 6.25 1.91875 6.00625 2.1625L1.50625 6.6625C1.2625 6.90625 1.2625 7.30625 1.50625 7.55L6.00625 12.05C6.25 12.2937 6.65 12.2937 6.89375 12.05C7.1375 11.8062 7.1375 11.4062 6.89375 11.1625L3.38125 7.4375H12.25C12.5875 7.4375 12.875 7.15 12.875 6.8125C12.875 6.475 12.5875 6.5625 12.25 6.5625Z" fill="" />
            </svg>
            Oturumlara Dön
          </Link>
        </div>
      </div>

      {/* Session Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-sm text-bodydark2">Toplam Mesaj</p>
          <h4 className="mt-1 text-xl font-bold text-black dark:text-white">{messages.length}</h4>
        </div>
        <div className="rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-sm text-bodydark2">Ort. Latency</p>
          <h4 className="mt-1 text-xl font-bold text-black dark:text-white">{avgLatency}ms</h4>
        </div>
        <div className="rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-sm text-bodydark2">Sağlayıcı</p>
          <h4 className="mt-1 text-xl font-bold text-black dark:text-white capitalize">{session.provider}</h4>
        </div>
        <div className="rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-sm text-bodydark2">Durum</p>
          <h4 className="mt-1 text-xl font-bold text-success capitalize">{session.status}</h4>
        </div>
      </div>

      {/* Visitor Info */}
      {session.visitorMetadata && (
        <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 font-medium text-black dark:text-white">Ziyaretçi Bilgileri</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <p className="text-xs text-bodydark2">IP Adresi</p>
              <p className="mt-0.5 text-sm font-medium text-black dark:text-white">{session.visitorMetadata.ip}</p>
            </div>
            <div>
              <p className="text-xs text-bodydark2">Tarayıcı</p>
              <p className="mt-0.5 text-sm font-medium text-black dark:text-white">{session.visitorMetadata.browser ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-bodydark2">İşletim Sistemi</p>
              <p className="mt-0.5 text-sm font-medium text-black dark:text-white">{session.visitorMetadata.os ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-bodydark2">Cihaz</p>
              <p className="mt-0.5 text-sm font-medium text-black dark:text-white capitalize">{session.visitorMetadata.deviceType ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-bodydark2">Ülke</p>
              <p className="mt-0.5 text-sm font-medium text-black dark:text-white">{session.visitorMetadata.country ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-bodydark2">Şehir</p>
              <p className="mt-0.5 text-sm font-medium text-black dark:text-white">{session.visitorMetadata.city ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Message History */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke py-4 px-6 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">Mesaj Geçmişi</h3>
        </div>
        <div className="p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-5 py-3.5 ${
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-none'
                    : 'bg-gray-2 text-black dark:bg-meta-4 dark:text-white rounded-bl-none'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-table:my-2 prose-pre:my-2 prose-pre:bg-black/10 prose-pre:dark:bg-black/30 prose-pre:rounded-lg prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1 prose-th:text-left">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                )}
                <div
                  className={`mt-2 flex items-center gap-2 text-xs ${
                    msg.role === 'user' ? 'justify-end opacity-70' : 'opacity-60'
                  }`}
                >
                  {msg.role === 'assistant' && msg.latencyMs && (
                    <span>{msg.latencyMs}ms</span>
                  )}
                  <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="py-8 text-center text-bodydark2">Bu oturumda henüz mesaj yok.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default SessionDetailPage;
