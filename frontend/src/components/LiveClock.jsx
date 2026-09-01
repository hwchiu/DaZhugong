import { useEffect, useState } from 'react';

const UPDATE_INTERVAL_MS = 15_000;

function formatTime(date) {
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatter.format(date);
}

export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), UPDATE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  const timeLabel = formatTime(now);

  return (
    <div
      role="status"
      aria-label={`目前時間 ${timeLabel}`}
      className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm shadow-stone-200"
    >
      <span aria-hidden="true">🕐</span>
      <span>{timeLabel}</span>
    </div>
  );
}
