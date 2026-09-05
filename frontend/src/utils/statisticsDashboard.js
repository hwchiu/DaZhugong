import {
  getDaysInRange,
  getMonthlyBuckets,
  getPeriodRange,
  getPreviousPeriodRange,
  isWithinRange,
} from './statisticsPeriod.js';
import { REASON_CATEGORIES, categorizeReason } from './reasonCategories.js';

// 只聚焦午餐時間三個時段(spec 16-17)，不做全天24小時熱區圖。
export const LUNCH_TIME_SLOTS = ['12:00-12:30', '12:30-13:00', '13:00-13:30'];
// 熱區圖X軸是「一二三四五六日」(週一開始)，跟一般JS的Date.getDay()週日開始不同，
// 這裡固定用這個順序的中文字顯示。
const WEEKDAY_LABELS_MONDAY_FIRST = ['一', '二', '三', '四', '五', '六', '日'];

function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// 回傳0/1/2代表三個午餐時段的index，超出午餐時間範圍回傳-1(該筆不計入熱區圖)。
function getLunchSlotIndex(date) {
  const minutesSinceNoon = (date.getHours() - 12) * 60 + date.getMinutes();
  if (minutesSinceNoon >= 0 && minutesSinceNoon < 30) return 0;
  if (minutesSinceNoon >= 30 && minutesSinceNoon < 60) return 1;
  if (minutesSinceNoon >= 60 && minutesSinceNoon < 90) return 2;
  return -1;
}

// 0=一...6=日，週一開始，對應WEEKDAY_LABELS_MONDAY_FIRST的順序。
function getMondayFirstDayIndex(date) {
  const day = date.getDay(); // JS原生: 0=日
  return day === 0 ? 6 : day - 1;
}

function isSameLocalDay(date, reference) {
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
}

function buildDailyTrend(period, currentReports, allMyReports, referenceDate) {
  if (period.type === 'all') {
    const earliestMs = allMyReports.reduce((min, report) => {
      const ms = toMillis(report.timestamp);
      return min === null || ms < min ? ms : min;
    }, null);
    const buckets = getMonthlyBuckets(earliestMs ? new Date(earliestMs) : null, referenceDate);

    return buckets.map((bucket) => ({
      date: bucket.key,
      dayOfWeek: bucket.label,
      tokenCount: allMyReports.filter((report) => {
        const ms = toMillis(report.timestamp);
        return ms >= bucket.start.getTime() && ms < bucket.end.getTime() + 86_400_000;
      }).length,
    }));
  }

  const days = getDaysInRange(period);
  return days.map((day) => ({
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    tokenCount: currentReports.filter((report) => isSameLocalDay(new Date(toMillis(report.timestamp)), day.dateObj)).length,
  }));
}

function buildReasonDistribution(currentReports, totalTokenCount) {
  const tally = new Map();
  for (const report of currentReports) {
    const categoryId = categorizeReason(report?.reason);
    const entry = tally.get(categoryId) ?? { tokenCount: 0, eventCount: 0 };
    entry.tokenCount += 1;
    entry.eventCount += 1;
    tally.set(categoryId, entry);
  }

  const rows = REASON_CATEGORIES.map((category) => {
    const entry = tally.get(category.id) ?? { tokenCount: 0, eventCount: 0 };
    return {
      reasonId: category.id,
      reasonName: category.name,
      color: category.color,
      tokenCount: entry.tokenCount,
      eventCount: entry.eventCount,
      percentage: totalTokenCount === 0 ? 0 : Math.round((entry.tokenCount / totalTokenCount) * 1000) / 10,
      averagePerEvent: entry.eventCount === 0 ? 0 : Math.round((entry.tokenCount / entry.eventCount) * 10) / 10,
    };
  });

  const maxTokenCount = rows.reduce((max, row) => Math.max(max, row.tokenCount), 0);
  return rows.map((row) => ({
    ...row,
    progress: maxTokenCount === 0 ? 0 : row.tokenCount / maxTokenCount,
  }));
}

function buildLunchTimeHeatmap(currentReports) {
  const tally = new Map();
  for (const report of currentReports) {
    const date = new Date(toMillis(report.timestamp));
    const slotIndex = getLunchSlotIndex(date);
    if (slotIndex === -1) {
      continue;
    }
    const dayIndex = getMondayFirstDayIndex(date);
    const key = `${dayIndex}-${slotIndex}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  const cells = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    for (let slotIndex = 0; slotIndex < LUNCH_TIME_SLOTS.length; slotIndex += 1) {
      cells.push({
        dayOfWeek: dayIndex + 1,
        dayLabel: WEEKDAY_LABELS_MONDAY_FIRST[dayIndex],
        timeSlot: LUNCH_TIME_SLOTS[slotIndex],
        tokenCount: tally.get(`${dayIndex}-${slotIndex}`) ?? 0,
      });
    }
  }

  const maxTokenCount = cells.reduce((max, cell) => Math.max(max, cell.tokenCount), 0);
  return cells.map((cell) => ({
    ...cell,
    intensity: maxTokenCount === 0 ? 0 : cell.tokenCount / maxTokenCount,
  }));
}

// 共用核心：給定「這個範圍要看的reports」(已經篩過是誰的、或全部人的)，
// 算出summary/每日趨勢/原因分布/熱區圖。buildStatisticsDashboard(個人)跟
// buildGroupStatisticsDashboard(全員)都是這個核心的薄包裝，差別只在傳進來的
// scopedReports範圍不同(個人只過濾自己、全員不過濾)，避免兩份邏輯各寫一次、之後改一邊忘了改另一邊。
function computeDashboardCore({ scopedReports, periodType, periodOffset, referenceDate }) {
  const period = getPeriodRange(periodType, periodOffset, referenceDate);
  const previousPeriod = getPreviousPeriodRange(period);

  const currentReports = scopedReports.filter((report) => isWithinRange(toMillis(report.timestamp), period));
  const previousReports = previousPeriod
    ? scopedReports.filter((report) => isWithinRange(toMillis(report.timestamp), previousPeriod))
    : [];

  const currentTokenCount = currentReports.length;
  const previousTokenCount = previousReports.length;
  const changeRate = previousTokenCount === 0
    ? null
    : Math.round(((currentTokenCount - previousTokenCount) / previousTokenCount) * 1000) / 10;

  return {
    period,
    currentReports,
    summary: { currentTokenCount, previousTokenCount, changeRate },
    dailyTrend: buildDailyTrend(period, currentReports, scopedReports, referenceDate),
    reasonDistribution: buildReasonDistribution(currentReports, currentTokenCount),
    lunchTimeHeatmap: buildLunchTimeHeatmap(currentReports),
    isEmpty: currentTokenCount === 0,
  };
}

// 主入口：從「整個群組的reports」+「目前登入者id」+「期間設定」算出統計頁要用的完整資料模型。
// reports的形狀對應 useTokens() 回傳的資料: { targetId, reporterId, reason, timestamp }。
export function buildStatisticsDashboard({
  reports,
  currentMemberId,
  periodType = 'week',
  periodOffset = 0,
  referenceDate = new Date(),
}) {
  const safeReports = Array.isArray(reports) ? reports : [];
  // 統計的對象是「被記Token的人」，也就是 targetId === 目前登入者，
  // 跟 useGroup.js 裡 withReportTotals() 算 member.totalTokens 的邏輯一致。
  const myReports = currentMemberId
    ? safeReports.filter((report) => report?.targetId === currentMemberId)
    : [];

  const core = computeDashboardCore({ scopedReports: myReports, periodType, periodOffset, referenceDate });
  const { currentReports, ...rest } = core;
  return rest;
}

// 全員統計：跟個人版差別只在不過濾targetId(全部人的reports都算)，
// 額外多算一份「成員貢獻排名」(對應reference image的「成員貢獻 Top N」)。
export function buildGroupStatisticsDashboard({
  reports,
  members,
  periodType = 'week',
  periodOffset = 0,
  referenceDate = new Date(),
}) {
  const safeReports = Array.isArray(reports) ? reports : [];
  const safeMembers = Array.isArray(members) ? members : [];

  const core = computeDashboardCore({ scopedReports: safeReports, periodType, periodOffset, referenceDate });
  const { currentReports, ...rest } = core;

  const nameById = new Map(safeMembers.map((member) => [member.id, member?.name ?? member?.displayName ?? '未命名成員']));
  const colorById = new Map(safeMembers.map((member) => [member.id, member?.color]));
  const tally = new Map();
  for (const report of currentReports) {
    if (!report?.targetId) continue;
    tally.set(report.targetId, (tally.get(report.targetId) ?? 0) + 1);
  }

  const totalTokenCount = rest.summary.currentTokenCount;
  const memberContributions = Array.from(tally.entries())
    .map(([memberId, tokenCount]) => ({
      memberId,
      name: nameById.get(memberId) ?? '未命名成員',
      color: colorById.get(memberId),
      tokenCount,
      percentage: totalTokenCount === 0 ? 0 : Math.round((tokenCount / totalTokenCount) * 1000) / 10,
    }))
    .sort((left, right) => (
      right.tokenCount - left.tokenCount
      || left.name.localeCompare(right.name, 'zh-TW')
    ));

  return { ...rest, memberContributions };
}
