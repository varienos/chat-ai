import ProviderBadge from '../ProviderBadge';
import type { ProviderStats } from '../../api/hooks';

interface TableOneProps {
  byProvider: Record<string, ProviderStats>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TableOne: React.FC<TableOneProps> = ({ byProvider }) => {
  const entries = Object.entries(byProvider);

  return (
    <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5">
      <h4 className="mb-6 text-xl font-semibold text-black dark:text-white">
        Sağlayıcı Performansı
      </h4>

      <div className="max-w-full overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-gray-2 dark:bg-meta-4">
              <th className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-left text-xs font-medium text-bodydark2">
                Sağlayıcı
              </th>
              <th className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-xs font-medium text-bodydark2">
                Oturum
              </th>
              <th className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-xs font-medium text-bodydark2">
                Mesaj
              </th>
              <th className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-xs font-medium text-bodydark2 hidden sm:table-cell">
                Ort. Latency
              </th>
              <th className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-xs font-medium text-bodydark2 hidden sm:table-cell">
                Hata Oranı
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, stats]) => (
              <tr key={name}>
                <td className="border border-stroke dark:border-strokedark p-2.5 xl:p-5">
                  <ProviderBadge provider={name} />
                </td>
                <td className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-black dark:text-white">
                  {fmt(stats.totalSessions)}
                </td>
                <td className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-black dark:text-white">
                  {fmt(stats.totalMessages)}
                </td>
                <td className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-black dark:text-white hidden sm:table-cell">
                  {Math.round(stats.avgLatencyMs)}ms
                </td>
                <td className="border border-stroke dark:border-strokedark p-2.5 xl:p-5 text-center text-black dark:text-white hidden sm:table-cell">
                  {stats.errorRate.toFixed(2)}%
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-bodydark2">Henüz veri yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TableOne;
