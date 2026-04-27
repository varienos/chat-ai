import { ApexOptions } from 'apexcharts';
import React, { useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { DailyVolume } from '../../api/hooks';

interface ChartOneProps {
  dailyVolume: DailyVolume[];
}

const ChartOne: React.FC<ChartOneProps> = ({ dailyVolume }) => {
  const { categories, totalData } = useMemo(() => {
    // Aggregate daily volume by date (sum across all providers)
    const byDate = new Map<string, number>();
    for (const d of dailyVolume) {
      byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.count);
    }
    const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      categories: sorted.map(([date]) => date.slice(5)), // MM-DD
      totalData: sorted.map(([, count]) => count),
    };
  }, [dailyVolume]);

  const options: ApexOptions = {
    legend: { show: false, position: 'top', horizontalAlign: 'left' },
    colors: ['#F40079'],
    chart: {
      fontFamily: 'Satoshi, sans-serif',
      height: 335,
      type: 'area',
      dropShadow: { enabled: true, color: '#623CEA14', top: 10, blur: 4, left: 0, opacity: 0.1 },
      toolbar: { show: false },
    },
    stroke: { width: [2], curve: 'straight' },
    grid: { xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
    dataLabels: { enabled: false },
    markers: {
      size: 4,
      colors: '#fff',
      strokeColors: ['#F40079'],
      strokeWidth: 3,
      strokeOpacity: 0.9,
      fillOpacity: 1,
      hover: { sizeOffset: 5 },
    },
    xaxis: { type: 'category', categories, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { title: { style: { fontSize: '0px' } }, min: 0 },
  };

  const series = [{ name: 'Toplam İstek', data: totalData }];

  return (
    <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5 xl:col-span-8">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="flex w-full flex-wrap gap-3 sm:gap-5">
          <div className="flex min-w-47.5">
            <span className="mt-1 mr-2 flex h-4 w-full max-w-4 items-center justify-center rounded-full border border-primary">
              <span className="block h-2.5 w-full max-w-2.5 rounded-full bg-primary"></span>
            </span>
            <div className="w-full">
              <p className="font-semibold text-primary">Toplam İstek</p>
              <p className="text-sm font-medium">Günlük API çağrıları</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div id="chartOne" className="-ml-5">
          <ReactApexChart
            options={options}
            series={series}
            type="area"
            height={350}
          />
        </div>
      </div>
    </div>
  );
};

export default ChartOne;
