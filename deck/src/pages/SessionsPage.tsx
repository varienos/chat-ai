import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProviderBadge from '../components/ProviderBadge';
import { useSessions } from '../api/hooks';

const PAGE_SIZE = 20;

function DeviceIcon({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  if (type === 'mobile') {
    return (
      <svg className="inline-block h-4 w-4 text-bodydark2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  if (type === 'tablet') {
    return (
      <svg className="inline-block h-4 w-4 text-bodydark2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="inline-block h-4 w-4 text-bodydark2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

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

const SessionsPage = () => {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isLoading, error } = useSessions({ page, limit: PAGE_SIZE, status: statusFilter || undefined });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <p className="text-danger">Oturumlar yüklenirken hata oluştu: {(error as Error).message}</p>
      </div>
    );
  }

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded border border-stroke bg-gray px-4 py-2 text-sm text-black dark:border-strokedark dark:bg-meta-4 dark:text-white"
        >
          <option value="">Tümü</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        {/* Table */}
        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4">
                <th className="min-w-[180px] border border-stroke dark:border-strokedark py-4 px-4 font-medium text-black dark:text-white xl:pl-11">
                  Session ID
                </th>
                <th className="min-w-[150px] border border-stroke dark:border-strokedark py-4 px-4 font-medium text-black dark:text-white">
                  Sağlayıcı
                </th>
                <th className="min-w-[100px] border border-stroke dark:border-strokedark py-4 px-4 font-medium text-black dark:text-white">
                  Mesaj
                </th>
                <th className="border border-stroke dark:border-strokedark py-4 px-4 font-medium text-black dark:text-white">
                  Durum
                </th>
                <th className="border border-stroke dark:border-strokedark py-4 px-4 font-medium text-black dark:text-white">
                  Başlangıç
                </th>
                <th className="border border-stroke dark:border-strokedark py-4 px-4 font-medium text-black dark:text-white text-center">
                  Cihaz
                </th>
                <th className="border border-stroke dark:border-strokedark py-4 px-4 font-medium text-black dark:text-white text-center">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="hover:bg-gray-1 dark:hover:bg-meta-4">
                  <td className="border border-stroke py-4 px-4 dark:border-strokedark xl:pl-11">
                    <Link to={`/sessions/${session.id}`} className="font-medium text-primary hover:underline">
                      #{session.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="border border-stroke py-4 px-4 dark:border-strokedark">
                    <ProviderBadge provider={session.provider} />
                  </td>
                  <td className="border border-stroke py-4 px-4 dark:border-strokedark">
                    <p className="text-black dark:text-white">{session.messageCount}</p>
                  </td>
                  <td className="border border-stroke py-4 px-4 dark:border-strokedark">
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="border border-stroke py-4 px-4 dark:border-strokedark">
                    <p className="text-sm text-bodydark2">{new Date(session.createdAt).toLocaleString()}</p>
                  </td>
                  <td className="border border-stroke py-4 px-4 dark:border-strokedark text-center">
                    <DeviceIcon type={session.visitorMetadata?.deviceType} />
                  </td>
                  <td className="border border-stroke py-4 px-4 dark:border-strokedark text-center">
                    <Link
                      to={`/sessions/${session.id}`}
                      className="inline-flex hover:text-primary"
                      title="Detay"
                    >
                      <svg className="fill-current" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.99981 14.8219C3.43106 14.8219 0.674805 9.50624 0.562305 9.28124C0.47793 9.11249 0.47793 8.88749 0.562305 8.71874C0.674805 8.49374 3.43106 3.17812 8.99981 3.17812C14.5686 3.17812 17.3248 8.49374 17.4373 8.71874C17.5217 8.88749 17.5217 9.11249 17.4373 9.28124C17.3248 9.50624 14.5686 14.8219 8.99981 14.8219ZM1.85605 9.00001C2.49043 10.0406 5.09043 13.5 8.99981 13.5C12.9092 13.5 15.5092 10.0406 16.1436 9.00001C15.5092 7.95938 12.9092 4.5 8.99981 4.5C5.09043 4.5 2.49043 7.95938 1.85605 9.00001Z" fill=""/>
                        <path d="M9 11.3906C7.67812 11.3906 6.60938 10.3219 6.60938 9C6.60938 7.67813 7.67812 6.60938 9 6.60938C10.3219 6.60938 11.3906 7.67813 11.3906 9C11.3906 10.3219 10.3219 11.3906 9 11.3906ZM9 7.875C8.38125 7.875 7.875 8.38125 7.875 9C7.875 9.61875 8.38125 10.125 9 10.125C9.61875 10.125 10.125 9.61875 10.125 9C10.125 8.38125 9.61875 7.875 9 7.875Z" fill=""/>
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-bodydark2">Henüz oturum bulunmuyor.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-stroke px-5 py-4 dark:border-strokedark sm:px-7.5">
          <p className="text-sm text-bodydark2">
            {total > 0
              ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} / ${total}`
              : "0 sonuç"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-stroke py-1.5 px-4 text-sm font-medium hover:bg-gray-2 disabled:opacity-40 disabled:cursor-not-allowed dark:border-strokedark dark:hover:bg-meta-4"
            >
              Önceki
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-stroke py-1.5 px-4 text-sm font-medium hover:bg-gray-2 disabled:opacity-40 disabled:cursor-not-allowed dark:border-strokedark dark:hover:bg-meta-4"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SessionsPage;
