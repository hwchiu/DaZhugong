import { Fragment } from 'react';
import { LUNCH_TIME_SLOTS } from '../utils/statisticsDashboard.js';

// heatmap: [{ dayOfWeek(1-7,一開始), dayLabel, timeSlot, tokenCount, intensity(0-1) }]
// 用CSS Grid畫，不用圖表庫(spec 16章建議)。顏色深淺跟著當日主題色走(--brand-500)，
// 這裡故意不用固定色，因為熱區圖本身只有「單一指標的強弱」，跟需要互相區分的
// 原因分類圖不一樣，適合跟著每日主題色統一。
export default function LunchTimeHeatmap({ heatmap }) {
  const cellsByDay = Array.from({ length: 7 }, (_, dayIndex) => (
    heatmap
      .filter((cell) => cell.dayOfWeek === dayIndex + 1)
      .sort((left, right) => LUNCH_TIME_SLOTS.indexOf(left.timeSlot) - LUNCH_TIME_SLOTS.indexOf(right.timeSlot))
  ));
  const dayLabels = heatmap.length
    ? Array.from({ length: 7 }, (_, dayIndex) => heatmap.find((cell) => cell.dayOfWeek === dayIndex + 1)?.dayLabel ?? '')
    : ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div data-testid="lunch-time-heatmap" role="img" aria-label="使用時段熱區圖，顏色越深代表該時段聊公事次數越多">
      <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-1.5 text-center">
        <span />
        {dayLabels.map((label, index) => (
          <span key={`day-${index}`} className="text-xs font-bold text-slate-700">{label}</span>
        ))}

        {LUNCH_TIME_SLOTS.map((slot, slotIndex) => (
          <Fragment key={slot}>
            <span className="flex items-center justify-end pr-1 text-[11px] font-semibold text-slate-600">
              {slot}
            </span>
            {cellsByDay.map((dayCells, dayIndex) => {
              const cell = dayCells[slotIndex];
              const intensity = cell?.intensity ?? 0;
              return (
                <span
                  key={`cell-${dayIndex}-${slotIndex}`}
                  title={`${cell?.dayLabel ?? ''} ${slot}：${cell?.tokenCount ?? 0} 枚`}
                  className="flex h-9 items-center justify-center rounded-lg text-[11px] font-bold"
                  style={{
                    backgroundColor: intensity === 0 ? '#f5f5f4' : 'var(--brand-500)',
                    opacity: intensity === 0 ? 1 : 0.25 + intensity * 0.75,
                    color: intensity > 0.5 ? '#ffffff' : '#57534e',
                  }}
                >
                  {cell?.tokenCount > 0 ? cell.tokenCount : ''}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-500">
        <span>低</span>
        <span
          aria-hidden="true"
          className="h-2 w-24 rounded-full"
          style={{ background: 'linear-gradient(90deg, #f5f5f4, var(--brand-500))' }}
        />
        <span>高</span>
      </div>
    </div>
  );
}
