import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export default function StatsPieChart({ data, total }) {
  return (
    <div
      data-testid="stats-pie-chart"
      role="img"
      aria-label={`成員 Token 占比圖，共 ${total} Token`}
      className="mt-4 h-64 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={88}
            paddingAngle={2}
            isAnimationActive={false}
          >
            {data.map((entry) => <Cell key={entry.id} fill={entry.color} stroke="#ffffff" strokeWidth={2} />)}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} Token`, name]}
            contentStyle={{
              borderRadius: '16px',
              borderColor: '#cbd5e1',
              color: '#0f172a',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
