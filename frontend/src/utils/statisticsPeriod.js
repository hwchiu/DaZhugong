// 統計頁「本週 / 本月 / 全部」期間的日期計算，純函式、不碰React/Firestore，方便單獨測試。
// 全部用「使用者瀏覽器的當地時區」為準(spec 39: 日期統計依使用者timezone)，
// 不特別處理跨時區伺服器計算，因為這個app本來就是純前端直接讀Firestore、沒有後端時區轉換這一層。

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MS_PER_DAY = 86_400_000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + amount);
  return result;
}

// 週一為一週的開始，符合reference image「一二三四五六日」的排列方式。
function startOfWeek(date) {
  const day = date.getDay(); // 0=Sun ... 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(date, diffToMonday);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}

// offset=0代表「本週/本月」，負值往過去推，正值(未來)一律鎖在0，符合
// spec 6.「不允許切換到未來週」的規則——這裡直接鎖在函式層級，頁面不用自己記得檢查。
export function clampPeriodOffset(offset) {
  if (!Number.isFinite(offset)) {
    return 0;
  }
  return Math.min(0, Math.trunc(offset));
}

// 回傳{type, start, end, label}，start/end都是「當天00:00~23:59:59.999」的完整日期物件，
// label是給日期區間列顯示的文字(spec 6.)。
export function getPeriodRange(type, offset = 0, referenceDate = new Date()) {
  const safeOffset = clampPeriodOffset(offset);

  if (type === 'month') {
    const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + safeOffset, 1);
    const start = startOfMonth(base);
    const end = endOfMonth(base);
    return {
      type,
      offset: safeOffset,
      start,
      end,
      label: `${start.getFullYear()}/${String(start.getMonth() + 1).padStart(2, '0')}`,
    };
  }

  if (type === 'all') {
    return {
      type,
      offset: 0,
      start: null,
      end: null,
      label: '全部',
    };
  }

  // 預設/其餘情況都當作「週」處理
  const thisWeekStart = startOfWeek(referenceDate);
  const start = addDays(thisWeekStart, safeOffset * 7);
  const end = addDays(start, 6);
  return {
    type: 'week',
    offset: safeOffset,
    start,
    end,
    label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
    fullLabel: `${start.getFullYear()}/${formatShortDate(start)} - ${formatShortDate(end)}`,
  };
}

// 前一個「同長度」期間，用來算summary的「較上週/上月」比較基準(spec 7.1)。
// 注意：這裡直接用period.start往前推算，不能重新呼叫getPeriodRange(type, offset-1, new Date())，
// 那樣會用「現在的referenceDate」重算，而不是原本呼叫getPeriodRange時錨定的那個日期，
// 兩個呼叫如果不是同一刻執行(例如跨到隔天)結果就會兜不起來。
// all模式沒有「前一個全部」的概念，回傳null。
export function getPreviousPeriodRange(period) {
  if (period.type === 'all') {
    return null;
  }
  if (period.type === 'month') {
    const previousMonthAnchor = new Date(period.start.getFullYear(), period.start.getMonth() - 1, 1);
    return getPeriodRange('month', 0, previousMonthAnchor);
  }
  const previousWeekAnchor = addDays(period.start, -7);
  return getPeriodRange('week', 0, previousWeekAnchor);
}

// 期間內每一天的清單(week一定是7天，month是該月天數)，給Line Chart X軸用。
// all模式不適用「每日」粒度，呼叫端應該改用getMonthlyBuckets。
export function getDaysInRange(period) {
  if (!period.start || !period.end) {
    return [];
  }
  const days = [];
  let cursor = startOfDay(period.start);
  const end = startOfDay(period.end);
  while (cursor.getTime() <= end.getTime()) {
    days.push({
      date: formatDate(cursor),
      dayOfWeek: DAY_LABELS[cursor.getDay()],
      dateObj: new Date(cursor),
    });
    cursor = addDays(cursor, 1);
  }
  return days;
}

// all模式用「月」為粒度分桶，避免全部時間跨度太長時Line Chart有上百個點。
// 回傳從「最早的報告所在月」到「這個月」的每一個月份桶。
export function getMonthlyBuckets(earliestDate, referenceDate = new Date()) {
  if (!earliestDate) {
    return [{
      key: `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`,
      label: `${referenceDate.getFullYear()}/${String(referenceDate.getMonth() + 1).padStart(2, '0')}`,
      start: startOfMonth(referenceDate),
      end: endOfMonth(referenceDate),
    }];
  }

  const buckets = [];
  let cursor = startOfMonth(earliestDate);
  const last = startOfMonth(referenceDate);
  // 避免資料時間戳異常(例如未來日期)導致近乎無限迴圈
  let guard = 0;
  while (cursor.getTime() <= last.getTime() && guard < 240) {
    buckets.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: `${cursor.getFullYear()}/${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      start: startOfMonth(cursor),
      end: endOfMonth(cursor),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    guard += 1;
  }
  return buckets;
}

export function isWithinRange(timestampMs, period) {
  if (!period.start || !period.end) {
    return true; // all模式沒有邊界限制
  }
  return timestampMs >= period.start.getTime() && timestampMs <= period.end.getTime() + MS_PER_DAY - 1;
}

export { formatDate, formatShortDate };
