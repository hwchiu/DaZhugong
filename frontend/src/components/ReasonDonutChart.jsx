import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

// data: reasonDistribution陣列(reasonId, reasonName, tokenCount, color, percentage)。
// 顏色是reasonCategories.js裡固定的5色，不跟著每日主題色變——這裡需要的是「分類之間好區分」，
// 跟member token顏色刻意固定、不跟daily theme走是同一個設計決定。
export default function ReasonDonutChart({ data, total }) {
  const chartData = data.filter((row) => row.tokenCount > 0);

  return (
    <div
      data-testid="reason-donut-chart"
      role="img"
      aria-label={`聊公事原因分布甜甜圈圖，總計${total}枚Token`}
      className="relative mt-2 h-48 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="tokenCount"
            nameKey="reasonName"
            cx="50%"
            cy="50%"
            innerRadius={46}
            outerRadius={80}
            paddingAngle={chartData.length > 1 ? 2 : 0}
            isAnimationActive={false}
          >
            {chartData.map((entry) => (
              <Cell key={entry.reasonId} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} 枚`, name]}
            contentStyle={{ borderRadius: '16px', borderColor: '#e7e5e4', color: '#0f172a' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-black text-slate-950">{total} 枚</p>
        <p className="text-xs font-semibold text-slate-600">總計</p>
      </div>
    </div>
  );
}
