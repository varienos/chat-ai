import React from 'react';
import CardDataStats from '../components/CardDataStats';
import ChartOne from '../components/Charts/ChartOne';
import ChartTwo from '../components/Charts/ChartTwo';
import TableOne from '../components/Tables/TableOne';
import { useSessionStats, type ProviderStats, type DailyVolume } from '../api/hooks';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const DashboardPage: React.FC = () => {
  const { data, isLoading } = useSessionStats();

  const byProvider: Record<string, ProviderStats> = data?.byProvider ?? {};
  const dailyVolume: DailyVolume[] = data?.dailyVolume ?? [];

  const providers = Object.values(byProvider);
  const totalSessions = providers.reduce((s, p) => s + p.totalSessions, 0);
  const totalMessages = providers.reduce((s, p) => s + p.totalMessages, 0);
  const avgLatency = totalMessages > 0
    ? Math.round(providers.reduce((s, p) => s + p.avgLatencyMs * p.totalMessages, 0) / totalMessages)
    : 0;
  const avgErrorRate = totalSessions > 0
    ? (providers.reduce((s, p) => s + p.errorRate * p.totalSessions, 0) / totalSessions).toFixed(2)
    : "0";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-4 2xl:gap-7.5">
        <CardDataStats title="Toplam Oturum" total={fmt(totalSessions)} rate="">
          <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.25 2.75H2.75C1.7875 2.75 1 3.5375 1 4.5V17.5C1 18.4625 1.7875 19.25 2.75 19.25H19.25C20.2125 19.25 21 18.4625 21 17.5V4.5C21 3.5375 20.2125 2.75 19.25 2.75ZM19.25 17.5H2.75V4.5H19.25V17.5Z" fill=""/>
            <path d="M5 7.5H17V8.75H5V7.5ZM5 10.5H13V11.75H5V10.5ZM5 13.5H15V14.75H5V13.5Z" fill=""/>
          </svg>
        </CardDataStats>
        <CardDataStats title="Toplam Mesaj" total={fmt(totalMessages)} rate="">
          <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.5 2H3.5C2.4 2 1.5 2.9 1.5 4V20L5.5 16H18.5C19.6 16 20.5 15.1 20.5 14V4C20.5 2.9 19.6 2 18.5 2ZM18.5 14H5.5L3.5 16V4H18.5V14Z" fill=""/>
            <path d="M6 7H16V8.5H6V7ZM6 10H13V11.5H6V10Z" fill=""/>
          </svg>
        </CardDataStats>
        <CardDataStats title="Ort. Latency" total={`${avgLatency}ms`} rate="">
          <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 1C5.48 1 1 5.48 1 11C1 16.52 5.48 21 11 21C16.52 21 21 16.52 21 11C21 5.48 16.52 1 11 1ZM11 19C6.59 19 3 15.41 3 11C3 6.59 6.59 3 11 3C15.41 3 19 6.59 19 11C19 15.41 15.41 19 11 19Z" fill=""/>
            <path d="M11.5 6H10V12L15.25 15.15L16 13.92L11.5 11.25V6Z" fill=""/>
          </svg>
        </CardDataStats>
        <CardDataStats title="Hata Oranı" total={`${avgErrorRate}%`} rate="">
          <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 1L1 19H21L11 1ZM11 4.5L18 17H4L11 4.5Z" fill=""/>
            <path d="M10 9H12V13H10V9ZM10 14.5H12V16.5H10V14.5Z" fill=""/>
          </svg>
        </CardDataStats>
      </div>

      <div className="mt-4 grid grid-cols-12 gap-4 md:mt-6 md:gap-6 2xl:mt-7.5 2xl:gap-7.5">
        <ChartOne dailyVolume={dailyVolume} />
        <ChartTwo dailyVolume={dailyVolume} />
        <div className="col-span-12">
          <TableOne byProvider={byProvider} />
        </div>
      </div>
    </>
  );
};

export default DashboardPage;
