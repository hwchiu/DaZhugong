import { useEffect, useState } from 'react';

// 純粹是「每隔intervalMs逼一次重新render」的hook，讓冷卻倒數計時器能每秒跳動、
// 時間一到就自動讓disabled解除，不需要使用者重新整理頁面。
export function useNowTicker(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export default useNowTicker;
