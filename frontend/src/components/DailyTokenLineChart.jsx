import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg shadow-rose-100">
      <p className="font-bold text-slate-950">{label}（{point?.dayOfWeek}）</p>
      <p className="mt-0.5 font-semibold text-slate-700">{point?.tokenCount ?? 0} 枚 Token</p>
    </div>
  );
}

// data: [{ date, dayOfWeek, tokenCount }]，跟著當日主題色(brandColor)畫線，
// 沿用StatsPieChart.jsx的既有慣例：isAnimationActive={false}、role="img"包一層給AT。
export default function DailyTokenLineChart({ data, brandColor = '#f43f5e' }) {
  const maxTokenCount = data.reduce((max, point) => Math.max(max, point.tokenCount), 0);
  const yAxisMax = Math.max(4, Math.ceil((maxTokenCount + 1) / 2) * 2);

  return (
    <div
      data-testid="daily-token-line-chart"
      role="img"
      aria-label={`每日Token投入趨勢折線圖，${data.map((d) => `${d.date} ${d.tokenCount}枚`).join('、')}`}
      className="mt-4 h-56 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="daily-token-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={brandColor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={brandColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
          <XAxis
            dataKey="dayOfWeek"
            tick={{ fontSize: 12, fill: '#57534e' }}
            axisLine={{ stroke: '#e7e5e4' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, yAxisMax]}
            tick={{ fontSize: 12, fill: '#57534e' }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<TrendTooltip />} />
          <Area
            type="monotone"
            dataKey="tokenCount"
            stroke={brandColor}
            strokeWidth={2.5}
            fill="url(#daily-token-area)"
            dot={{ r: 4, fill: '#ffffff', stroke: brandColor, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
