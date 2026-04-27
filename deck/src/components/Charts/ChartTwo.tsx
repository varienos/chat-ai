import { ApexOptions } from 'apexcharts';
import React, { useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { DailyVolume } from '../../api/hooks';

const PROVIDER_COLORS: Record<string, string> = {
  codex: '#F40079',
  claude: '#870746',
  gemini: '#F59E0B',
};

interface ChartTwoProps {
  dailyVolume: DailyVolume[];
}

const ChartTwo: React.FC<ChartTwoProps> = ({ dailyVolume }) => {
  const { categories, series, colors } = useMemo(() => {
    // Collect all dates and providers
    const dateSet = new Set<string>();
    const providerSet = new Set<string>();
    for (const d of dailyVolume) {
      dateSet.add(d.date);
      providerSet.add(d.provider);
    }

    const dates = [...dateSet].sort();
    const providers = [...providerSet];

    // Build provider → date → count lookup
    const lookup = new Map<string, Map<string, number>>();
    for (const d of dailyVolume) {
      if (!lookup.has(d.provider)) lookup.set(d.provider, new Map());
      lookup.get(d.provider)!.set(d.date, d.count);
    }

    return {
      categories: dates.map((d) => d.slice(5)), // MM-DD
      series: providers.map((p) => ({
        name: p,
        data: dates.map((d) => lookup.get(p)?.get(d) ?? 0),
      })),
      colors: providers.map((p) => PROVIDER_COLORS[p] ?? '#888'),
    };
  }, [dailyVolume]);

  const options: ApexOptions = {
    colors,
    chart: {
      fontFamily: 'Satoshi, sans-serif',
      type: 'bar',
      height: 335,
      stacked: true,
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    responsive: [
      {
        breakpoint: 1536,
        options: {
          plotOptions: { bar: { borderRadius: 0, columnWidth: '25%' } },
        },
      },
    ],
    plotOptions: {
      bar: {
        horizontal: false,
        borderRadius: 0,
        columnWidth: '25%',
        borderRadiusApplication: 'end',
        borderRadiusWhenStacked: 'last',
      },
    },
    dataLabels: { enabled: false },
    xaxis: { categories },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      fontFamily: 'Satoshi',
      fontWeight: 500,
      fontSize: '14px',
    },
    fill: { opacity: 1 },
  };

  return (
    <div className="col-span-12 rounded-sm border border-stroke bg-white p-7.5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-4">
      <div className="mb-4 justify-between gap-4 sm:flex">
        <div>
          <h4 className="text-xl font-semibold text-black dark:text-white">
            Sağlayıcı Kullanımı
          </h4>
        </div>
      </div>

      <div>
        <div id="chartTwo" className="-ml-5 -mb-9">
          <ReactApexChart
            options={options}
            series={series}
            type="bar"
            height={350}
          />
        </div>
      </div>
    </div>
  );
};

export default ChartTwo;
